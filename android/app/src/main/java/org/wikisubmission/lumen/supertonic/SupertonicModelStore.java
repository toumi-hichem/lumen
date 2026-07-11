package org.wikisubmission.lumen.supertonic;

import android.content.Context;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Owns the on-disk Supertonic model files under filesDir/supertonic, mirroring
 * the layout of the HuggingFace repo (onnx/*, voice_styles/*). The native side
 * downloads its own copy rather than trying to pull ~400 MB out of the
 * WebView's Cache Storage through the JS bridge.
 */
final class SupertonicModelStore {

    interface ProgressListener {
        void onProgress(int done, int total);
    }

    /**
     * Supertonic 3 (same ONNX I/O contract as earlier generations). v1/v2
     * weights had documented skip/repeat failures on short inputs that v3
     * fixes. Bump MODEL_VERSION whenever this URL changes so stale weights
     * from a previous version are re-downloaded instead of silently used.
     */
    static final String REMOTE_BASE = "https://huggingface.co/Supertone/supertonic-3/resolve/main";
    static final String MODEL_VERSION = "supertonic-3";
    private static final String VERSION_FILE = "model_version";

    static final String[] ONNX_FILES = {
        "duration_predictor.onnx",
        "text_encoder.onnx",
        "vector_estimator.onnx",
        "vocoder.onnx",
        "tts.json",
        "unicode_indexer.json",
    };
    static final String[] VOICE_IDS = {
        "M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5",
    };

    private final File root;

    SupertonicModelStore(Context context) {
        this.root = new File(context.getFilesDir(), "supertonic");
    }

    static String[] manifest() {
        String[] all = new String[ONNX_FILES.length + VOICE_IDS.length];
        int i = 0;
        for (String f : ONNX_FILES) all[i++] = "onnx/" + f;
        for (String v : VOICE_IDS) all[i++] = "voice_styles/" + v + ".json";
        return all;
    }

    File file(String relPath) {
        return new File(root, relPath);
    }

    boolean isComplete() {
        if (!isCurrentVersion()) return false;
        for (String rel : manifest()) {
            File f = file(rel);
            if (!f.isFile() || f.length() == 0) return false;
        }
        return true;
    }

    private boolean isCurrentVersion() {
        try {
            return MODEL_VERSION.equals(readText(VERSION_FILE).trim());
        } catch (Exception e) {
            return false; // no marker: pre-versioning install or nothing yet
        }
    }

    String readText(String relPath) throws Exception {
        // java.nio.file needs API 26; minSdk is 24, so read via streams.
        try (InputStream in = new FileInputStream(file(relPath));
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    /**
     * Download every missing manifest file sequentially. Interrupted or failed
     * downloads leave a .part file that is retried next time; completed files
     * are skipped, so the download is resumable at file granularity.
     */
    void download(ProgressListener listener) throws Exception {
        // Weights from a previous model version must not be mixed with the
        // current ones; wipe them so every file is re-fetched.
        if (root.isDirectory() && !isCurrentVersion()) {
            clear();
        }
        String[] manifest = manifest();
        int total = manifest.length;
        int done = 0;
        listener.onProgress(done, total);
        for (String rel : manifest) {
            File target = file(rel);
            if (!target.isFile() || target.length() == 0) {
                downloadFile(rel, target);
            }
            done += 1;
            listener.onProgress(done, total);
        }
        writeVersionMarker();
    }

    private void writeVersionMarker() throws Exception {
        File marker = file(VERSION_FILE);
        File parent = marker.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
            throw new Exception("Cannot create directory " + parent);
        }
        try (OutputStream out = new FileOutputStream(marker)) {
            out.write(MODEL_VERSION.getBytes(StandardCharsets.UTF_8));
        }
    }

    void clear() {
        deleteRecursively(root);
    }

    private void downloadFile(String relPath, File target) throws Exception {
        File parent = target.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
            throw new Exception("Cannot create directory " + parent);
        }
        File part = new File(target.getAbsolutePath() + ".part");
        URL url = new URL(REMOTE_BASE + "/" + relPath);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(20_000);
        conn.setReadTimeout(60_000);
        try {
            int code = conn.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) {
                throw new Exception("Failed to download " + relPath + " (" + code + ")");
            }
            try (InputStream in = conn.getInputStream();
                 OutputStream out = new FileOutputStream(part)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                }
            }
            if (!part.renameTo(target)) {
                throw new Exception("Cannot finalize " + target.getName());
            }
        } finally {
            conn.disconnect();
            if (part.exists() && !part.equals(target)) {
                // Leave nothing half-written under the final name.
                if (!target.isFile()) part.delete();
            }
        }
    }

    private static void deleteRecursively(File file) {
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteRecursively(child);
        }
        file.delete();
    }
}
