package org.wikisubmission.lumen.supertonic;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.io.File;
import java.io.FileWriter;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * Host-side tests for the CPU topology detection and the thread/quality
 * strategy derived from it. Real-device layouts used as fixtures:
 * Dimensity 7025 (2x2.6GHz + 6x2.0GHz), Snapdragon 8-series
 * (1 prime + 3 perf + 4 eff), Helio-class (2x2.0GHz + 6x1.8GHz).
 */
public class CpuTopologyTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private static CpuTopology.Cluster cluster(long freqKhz, int cores) {
        return new CpuTopology.Cluster(freqKhz, cores);
    }

    private static CpuTopology sysfs(CpuTopology.Cluster... clusters) {
        return new CpuTopology(Arrays.asList(clusters), CpuTopology.SOURCE_SYSFS);
    }

    // --- inferenceThreads ---

    @Test
    public void threads_bigLittle_usesOnlyTheFastCluster() {
        // Dimensity 7025: the 6 slow cores gate every op if included.
        assertEquals(2, sysfs(cluster(2_600_000, 2), cluster(2_000_000, 6)).inferenceThreads());
    }

    @Test
    public void threads_primeCore_accumulatesClustersUntilTwoCores() {
        // Snapdragon prime layout: 1 prime alone is too few; add the perf
        // cluster, then cap at 4.
        assertEquals(4, sysfs(
            cluster(3_200_000, 1), cluster(2_800_000, 3), cluster(2_000_000, 4)
        ).inferenceThreads());
    }

    @Test
    public void threads_uniformCores_leaveOneCoreForAudioAndUi() {
        // No big.LITTLE split: ORT would otherwise saturate every core the
        // AudioTrack and UI threads need.
        assertEquals(4, sysfs(cluster(1_800_000, 8)).inferenceThreads());
        assertEquals(3, sysfs(cluster(2_200_000, 4)).inferenceThreads());
        assertEquals(1, sysfs(cluster(1_400_000, 2)).inferenceThreads());
    }

    @Test
    public void threads_fallbackTopology_usesCoreCountMinusOneCappedAtFour() {
        CpuTopology fallback = new CpuTopology(
            Collections.singletonList(cluster(0, 8)), CpuTopology.SOURCE_FALLBACK);
        assertEquals(4, fallback.inferenceThreads());
    }

    // --- initialSteps ---

    @Test
    public void steps_midRangeBigLittle_startsAtSix() {
        // Dimensity 7025: 2 fast threads sustain 6 steps; runtime RTF
        // adaptation claws back to 8 when there is headroom.
        assertEquals(6, sysfs(cluster(2_600_000, 2), cluster(2_000_000, 6)).initialSteps(8));
    }

    @Test
    public void steps_highEnd_startsAtFull() {
        assertEquals(8, sysfs(
            cluster(3_200_000, 1), cluster(2_800_000, 3), cluster(2_000_000, 4)
        ).initialSteps(8));
    }

    @Test
    public void steps_smallPhone_startsAtFloor() {
        // <= 4 cores total: floor quality regardless of thread count.
        assertEquals(4, sysfs(cluster(2_200_000, 4)).initialSteps(8));
    }

    @Test
    public void steps_slowFastCluster_startsAtFloor() {
        // Helio-class: 2 "fast" cores below 2.3 GHz cannot hold 6 steps
        // realtime; start at the floor and let measured RTF raise it.
        assertEquals(4, sysfs(cluster(2_000_000, 2), cluster(1_800_000, 6)).initialSteps(8));
    }

    @Test
    public void steps_neverExceedTheRequestedQuality() {
        assertEquals(4, sysfs(
            cluster(3_200_000, 1), cluster(2_800_000, 3), cluster(2_000_000, 4)
        ).initialSteps(4));
    }

    // --- debug.lumen.tts.topology override parsing ---

    @Test
    public void overrideParsing_acceptsFastestFirstCoreCounts() {
        List<CpuTopology.Cluster> clusters = CpuTopology.parseTopologyOverride("2,6");
        assertEquals(2, clusters.size());
        assertEquals(2, clusters.get(0).cores);
        assertEquals(6, clusters.get(1).cores);
        // Forced "2,6" must behave like the Dimensity it imitates.
        CpuTopology forced = new CpuTopology(clusters, CpuTopology.SOURCE_OVERRIDE);
        assertEquals(2, forced.inferenceThreads());
        // Synthetic clusters carry no frequency, so the slow-cluster rule
        // must not kick in.
        assertEquals(6, forced.initialSteps(8));
    }

    @Test
    public void overrideParsing_rejectsGarbage() {
        assertNull(CpuTopology.parseTopologyOverride(null));
        assertNull(CpuTopology.parseTopologyOverride(""));
        assertNull(CpuTopology.parseTopologyOverride("fast"));
        assertNull(CpuTopology.parseTopologyOverride("0,4"));
        assertNull(CpuTopology.parseTopologyOverride("2,-6"));
    }

    // --- sysfs reading ---

    @Test
    public void sysfs_groupsCoresByMaxFrequencyFastestFirst() throws Exception {
        File root = tmp.getRoot();
        long[] freqs = {2_000_000, 2_000_000, 2_600_000, 2_600_000, 2_000_000, 2_000_000, 2_000_000, 2_000_000};
        for (int i = 0; i < freqs.length; i++) {
            File dir = new File(root, "cpu" + i + "/cpufreq");
            if (!dir.mkdirs()) throw new AssertionError("mkdirs failed");
            try (FileWriter w = new FileWriter(new File(dir, "cpuinfo_max_freq"))) {
                w.write(freqs[i] + "\n");
            }
        }
        List<CpuTopology.Cluster> clusters = CpuTopology.readSysfsClusters(root, freqs.length);
        assertEquals(2, clusters.size());
        assertEquals(2_600_000, clusters.get(0).maxFreqKhz);
        assertEquals(2, clusters.get(0).cores);
        assertEquals(2_000_000, clusters.get(1).maxFreqKhz);
        assertEquals(6, clusters.get(1).cores);
    }

    @Test
    public void sysfs_unreadableLayoutReturnsNull() {
        assertNull(CpuTopology.readSysfsClusters(new File(tmp.getRoot(), "missing"), 8));
    }

    @Test
    public void describe_summarizesSourceAndClusters() {
        assertEquals(
            "sysfs 2x2600MHz+6x2000MHz",
            sysfs(cluster(2_600_000, 2), cluster(2_000_000, 6)).toString());
    }
}
