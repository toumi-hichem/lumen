package org.wikisubmission.lumen.supertonic;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.TreeMap;

/**
 * CPU core layout (cores grouped into clusters by max frequency, fastest
 * cluster first) plus the Supertonic inference strategy derived from it.
 *
 * ORT partitions each op across its intra-op threads and waits for the
 * slowest one, so on big.LITTLE chips a thread scheduled on an efficiency
 * core gates every op. The strategy therefore sizes the thread pool to the
 * fastest cluster(s) only, and picks an initial denoising quality the fast
 * cores can plausibly sustain in realtime; the TTS service then adapts
 * quality up or down from measured RTF while playing.
 *
 * Debug overrides for on-device experiments (adb shell setprop, readable
 * without root):
 *   debug.lumen.tts.topology "2,6"  — force cluster core counts, fastest first
 *   debug.lumen.tts.threads N       — force the ORT thread count directly
 */
final class CpuTopology {

    static final class Cluster {
        /** 0 when unknown (forced topology, or fallback detection). */
        final long maxFreqKhz;
        final int cores;

        Cluster(long maxFreqKhz, int cores) {
            this.maxFreqKhz = maxFreqKhz;
            this.cores = cores;
        }
    }

    static final String SOURCE_SYSFS = "sysfs";
    static final String SOURCE_OVERRIDE = "override";
    static final String SOURCE_FALLBACK = "fallback";

    /** Quality floor; matches the adaptive minimum in SupertonicTtsService. */
    private static final int MIN_STEPS = 4;
    /** Fast clusters clocked below this cannot hold 6 steps in realtime. */
    private static final long SLOW_FAST_CLUSTER_KHZ = 2_300_000;

    private final List<Cluster> clusters;
    private final String source;

    CpuTopology(List<Cluster> clusters, String source) {
        if (clusters.isEmpty()) throw new IllegalArgumentException("clusters must not be empty");
        this.clusters = Collections.unmodifiableList(new ArrayList<>(clusters));
        this.source = source;
    }

    /** Detect this device's topology: forced prop, then sysfs, then core count. */
    static CpuTopology detect() {
        List<Cluster> forced = parseTopologyOverride(getProp("debug.lumen.tts.topology"));
        if (forced != null) return new CpuTopology(forced, SOURCE_OVERRIDE);
        int cpuCount = Runtime.getRuntime().availableProcessors();
        List<Cluster> sysfs = readSysfsClusters(new File("/sys/devices/system/cpu"), cpuCount);
        if (sysfs != null) return new CpuTopology(sysfs, SOURCE_SYSFS);
        return new CpuTopology(
            Collections.singletonList(new Cluster(0, Math.max(1, cpuCount))), SOURCE_FALLBACK);
    }

    List<Cluster> clusters() {
        return clusters;
    }

    String source() {
        return source;
    }

    int totalCores() {
        int total = 0;
        for (Cluster c : clusters) total += c.cores;
        return total;
    }

    /**
     * ORT intra-op thread count: accumulate the fastest clusters until at
     * least 2 cores, capped at 4. When there is no big/little split (uniform
     * or unknown layout) there is no slow cluster to park the AudioTrack and
     * UI threads on, so leave one core free instead.
     */
    int inferenceThreads() {
        int forced = intProp("debug.lumen.tts.threads");
        if (forced > 0) return Math.min(forced, 8);
        if (clusters.size() == 1) {
            return Math.max(1, Math.min(4, totalCores() - 1));
        }
        int threads = 0;
        for (Cluster c : clusters) {
            threads += c.cores;
            if (threads >= 2) break;
        }
        return Math.max(1, Math.min(4, threads));
    }

    /**
     * Denoising steps to start synthesis at, never above `requested`:
     * 4 on small (≤4 cores) or slow-fast-cluster devices, 6 on mid-range
     * big.LITTLE (2 fast threads), 8 with 3+ fast threads. Deliberately
     * conservative — the service raises quality from measured RTF, and a low
     * start means no stutter while it calibrates.
     */
    int initialSteps(int requested) {
        int threads = inferenceThreads();
        int steps;
        if (threads <= 1 || totalCores() <= 4) {
            steps = MIN_STEPS;
        } else if (threads == 2) {
            steps = 6;
        } else {
            steps = 8;
        }
        long topKhz = clusters.get(0).maxFreqKhz;
        if (topKhz > 0 && topKhz < SLOW_FAST_CLUSTER_KHZ) steps = MIN_STEPS;
        return Math.max(1, Math.min(requested, steps));
    }

    /** e.g. "sysfs 2x2600MHz+6x2000MHz"; used for logs and the debug UI. */
    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder(source).append(' ');
        for (int i = 0; i < clusters.size(); i++) {
            if (i > 0) sb.append('+');
            Cluster c = clusters.get(i);
            sb.append(c.cores).append('x');
            sb.append(c.maxFreqKhz > 0 ? (c.maxFreqKhz / 1000) + "MHz" : "?");
        }
        return sb.toString();
    }

    /**
     * Parse a forced topology like "2,6" (cluster core counts, fastest
     * first). Returns null when unset or malformed. Synthetic clusters carry
     * no frequency (0), so frequency-based rules stay out of forced runs.
     */
    static List<Cluster> parseTopologyOverride(String raw) {
        if (raw == null || raw.trim().isEmpty()) return null;
        try {
            String[] parts = raw.trim().split(",");
            List<Cluster> parsed = new ArrayList<>(parts.length);
            for (String part : parts) {
                int cores = Integer.parseInt(part.trim());
                if (cores <= 0) return null;
                parsed.add(new Cluster(0, cores));
            }
            return parsed;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Group cores under `cpuRoot` (normally /sys/devices/system/cpu) into
     * clusters by cpuinfo_max_freq, fastest first. Null when nothing is
     * readable, so callers can fall back to a plain core count.
     */
    static List<Cluster> readSysfsClusters(File cpuRoot, int cpuCount) {
        try {
            TreeMap<Long, Integer> byFreq = new TreeMap<>();
            for (int cpu = 0; cpu < cpuCount; cpu++) {
                File f = new File(cpuRoot, "cpu" + cpu + "/cpufreq/cpuinfo_max_freq");
                if (!f.canRead()) continue;
                try (BufferedReader r = new BufferedReader(new FileReader(f))) {
                    long freq = Long.parseLong(r.readLine().trim());
                    byFreq.merge(freq, 1, Integer::sum);
                }
            }
            if (byFreq.isEmpty()) return null;
            List<Cluster> clusters = new ArrayList<>(byFreq.size());
            for (Long freq : byFreq.descendingKeySet()) {
                clusters.add(new Cluster(freq, byFreq.get(freq)));
            }
            return clusters;
        } catch (Exception e) {
            return null;
        }
    }

    /** Read a system property via getprop; null when unset or unavailable. */
    private static String getProp(String name) {
        try {
            Process p = Runtime.getRuntime().exec(new String[]{"getprop", name});
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                String line = r.readLine();
                return line == null || line.trim().isEmpty() ? null : line.trim();
            }
        } catch (Exception e) {
            return null;
        }
    }

    /** Read an integer system property; 0 when unset or invalid. */
    static int intProp(String name) {
        String raw = getProp(name);
        if (raw == null) return 0;
        try {
            return Integer.parseInt(raw);
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
