package org.wikisubmission.lumen.kokoro;

import android.content.Context;
import android.os.SystemClock;

/**
 * Process-wide owner of the loaded Kokoro runtime. Mirrors
 * SupertonicRuntimeHolder: creating the ONNX session takes real time, and
 * the TTS service is destroyed after every playback queue, so the runtime
 * must outlive the service instance rather than reload on every play.
 */
final class KokoroRuntimeHolder {

    interface LoadListener {
        void onLoadStart();

        void onLoadDone(long elapsedMs);
    }

    private static KokoroRuntime runtime;
    private static long lastLoadMs = -1;

    private KokoroRuntimeHolder() {
    }

    static synchronized KokoroRuntime obtain(Context context, LoadListener listener)
        throws Exception {
        if (runtime != null) return runtime;
        if (listener != null) listener.onLoadStart();
        long start = SystemClock.elapsedRealtime();
        KokoroRuntime created = new KokoroRuntime(
            new KokoroModelStore(context.getApplicationContext()));
        lastLoadMs = SystemClock.elapsedRealtime() - start;
        runtime = created;
        if (listener != null) listener.onLoadDone(lastLoadMs);
        return runtime;
    }

    static synchronized boolean isLoaded() {
        return runtime != null;
    }

    static synchronized long lastLoadMs() {
        return lastLoadMs;
    }

    static synchronized void release() {
        if (runtime != null) {
            runtime.close();
            runtime = null;
        }
    }
}
