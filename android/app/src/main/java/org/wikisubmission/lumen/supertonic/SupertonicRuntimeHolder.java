package org.wikisubmission.lumen.supertonic;

import android.content.Context;
import android.os.SystemClock;

/**
 * Process-wide owner of the loaded Supertonic runtime. Creating the four ONNX
 * sessions takes several seconds on mid-range devices, and the TTS service is
 * destroyed after every playback queue; closing the runtime with it forced a
 * full model reload on every single play. Holding the runtime here keeps the
 * first play slow but every later play instant, at the cost of keeping the
 * sessions in memory until the models are removed or the process dies.
 */
final class SupertonicRuntimeHolder {

    /** Load progress, fired only for the call that actually loads. */
    interface LoadListener {
        void onLoadStart();

        void onLoadDone(long elapsedMs);
    }

    private static SupertonicRuntime runtime;
    private static long lastLoadMs = -1;

    private SupertonicRuntimeHolder() {
    }

    /**
     * Return the shared runtime, loading it if needed. Blocks while another
     * thread is loading; only the loading thread receives listener callbacks.
     */
    static synchronized SupertonicRuntime obtain(Context context, LoadListener listener)
        throws Exception {
        if (runtime != null) return runtime;
        if (listener != null) listener.onLoadStart();
        long start = SystemClock.elapsedRealtime();
        SupertonicRuntime created = new SupertonicRuntime(
            new SupertonicModelStore(context.getApplicationContext()));
        lastLoadMs = SystemClock.elapsedRealtime() - start;
        runtime = created;
        if (listener != null) listener.onLoadDone(lastLoadMs);
        return runtime;
    }

    static synchronized boolean isLoaded() {
        return runtime != null;
    }

    /** Milliseconds the last session load took, or -1 if never loaded. */
    static synchronized long lastLoadMs() {
        return lastLoadMs;
    }

    /** Close and forget the runtime (model removal, or explicit teardown). */
    static synchronized void release() {
        if (runtime != null) {
            runtime.close();
            runtime = null;
        }
    }
}
