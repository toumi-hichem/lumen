package org.wikisubmission.lumen.kokoro;

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
 * Owns the on-disk Kokoro model files under filesDir/kokoro. Mirrors
 * SupertonicModelStore's download/versioning/manifest/resumable-file
 * pattern, adapted for a manifest whose files live at two origins (the ONNX
 * model + voice packs on HuggingFace, the English G2P dictionaries on
 * GitHub) instead of one shared base URL.
 */
final class KokoroModelStore {

    interface ProgressListener {
        void onProgress(int done, int total);
    }

    static final String HF_BASE = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main";
    /** Pinned: keep in sync with MISAKI_BASE in src/tts/kokoro/assets.ts. */
    static final String MISAKI_BASE =
        "https://raw.githubusercontent.com/hexgrad/misaki/fba1236595f2d2bf21d414ba6e57d25256afada3/misaki/data";
    static final String MODEL_VERSION = "kokoro-82m-v1.0-fp16";
    private static final String VERSION_FILE = "model_version";

    static final String MODEL_FILE = "onnx/model_fp16.onnx";
    static final String[] VOICE_IDS = {
        "af_heart", "af_bella", "af_nicole", "af_sarah", "af_kore",
        "am_michael", "am_fenrir", "am_puck", "am_onyx", "am_echo",
    };
    static final String[] LEXICON_FILES = {"lexicon/us_gold.json", "lexicon/us_silver.json"};

    private final File root;

    KokoroModelStore(Context context) {
        this.root = new File(context.getFilesDir(), "kokoro");
    }

    static String[] manifest() {
        String[] all = new String[1 + VOICE_IDS.length + LEXICON_FILES.length];
        int i = 0;
        all[i++] = MODEL_FILE;
        for (String v : VOICE_IDS) all[i++] = "voices/" + v + ".bin";
        for (String f : LEXICON_FILES) all[i++] = f;
        return all;
    }

    private static String remoteUrl(String rel) {
        for (String lexiconFile : LEXICON_FILES) {
            if (lexiconFile.equals(rel)) return MISAKI_BASE + "/" + rel.substring("lexicon/".length());
        }
        return HF_BASE + "/" + rel;
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
            return false;
        }
    }

    String readText(String relPath) throws Exception {
        return new String(readBytes(relPath), StandardCharsets.UTF_8);
    }

    byte[] readBytes(String relPath) throws Exception {
        // java.nio.file needs API 26; minSdk is 24, so read via streams.
        try (InputStream in = new FileInputStream(file(relPath));
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    /**
     * Download every missing manifest file sequentially. Interrupted or
     * failed downloads leave a .part file that is retried next time;
     * completed files are skipped, so the download is resumable at file
     * granularity.
     */
    void download(ProgressListener listener) throws Exception {
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
        URL url = new URL(remoteUrl(relPath));
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
