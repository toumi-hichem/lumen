package org.wikisubmission.lumen.kokoro;

import android.Manifest;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.wikisubmission.lumen.supertonic.CpuTopology;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * JS bridge for the native Kokoro read-aloud pipeline. Mirrors
 * SupertonicNativePlugin — owns model download/state and hands full
 * playback queues to KokoroTtsService, relaying its progress back to JS as
 * plugin events ('chunk', 'state', 'complete', 'error', 'downloadProgress',
 * 'modelState', 'synthesizing', 'skip').
 */
@CapacitorPlugin(
    name = "KokoroNative",
    permissions = {
        @Permission(
            alias = KokoroNativePlugin.NOTIFICATIONS,
            strings = {Manifest.permission.POST_NOTIFICATIONS}
        )
    }
)
public class KokoroNativePlugin extends Plugin {

    static final String NOTIFICATIONS = "notifications";

    private static final Set<String> VOICE_IDS =
        new HashSet<>(Arrays.asList(KokoroModelStore.VOICE_IDS));
    private static final String DEFAULT_VOICE_ID = "af_heart";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private KokoroModelStore store() {
        return new KokoroModelStore(getContext());
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", true);
        call.resolve(result);
    }

    @PluginMethod
    public void isModelReady(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ready", store().isComplete());
        call.resolve(result);
    }

    @PluginMethod
    public void downloadModels(PluginCall call) {
        executor.execute(() -> {
            try {
                store().download((done, total) -> {
                    JSObject progress = new JSObject();
                    progress.put("done", done);
                    progress.put("total", total);
                    notifyListeners("downloadProgress", progress);
                });
                call.resolve();
            } catch (Exception e) {
                call.reject(message(e));
            }
        });
    }

    @PluginMethod
    public void removeModels(PluginCall call) {
        executor.execute(() -> {
            stopServicePlayback();
            KokoroRuntimeHolder.release();
            store().clear();
            call.resolve();
        });
    }

    /** Detected CPU topology, same generic CpuTopology as Supertonic uses. */
    @PluginMethod
    public void getCpuTopology(PluginCall call) {
        CpuTopology topology = CpuTopology.detect();
        JSArray clusters = new JSArray();
        for (CpuTopology.Cluster cluster : topology.clusters()) {
            JSObject entry = new JSObject();
            entry.put("cores", cluster.cores);
            entry.put("maxFreqKhz", cluster.maxFreqKhz);
            clusters.put(entry);
        }
        JSObject result = new JSObject();
        result.put("totalCores", topology.totalCores());
        result.put("clusters", clusters);
        result.put("threads", topology.inferenceThreads());
        result.put("source", topology.source());
        result.put("summary", topology.toString());
        call.resolve(result);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (!store().isComplete()) {
            call.reject("Kokoro voice is not downloaded");
            return;
        }
        JSArray chunksArr = call.getArray("chunks");
        if (chunksArr == null || chunksArr.length() == 0) {
            call.reject("chunks is required");
            return;
        }
        List<String> chunks = new ArrayList<>(chunksArr.length());
        try {
            for (int i = 0; i < chunksArr.length(); i++) {
                chunks.add(chunksArr.getString(i));
            }
        } catch (Exception e) {
            call.reject("chunks must be strings");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState(NOTIFICATIONS) == PermissionState.PROMPT) {
            requestPermissionForAlias(NOTIFICATIONS, call, "startAfterPermission");
            return;
        }
        startPlayback(call, chunks);
    }

    @PermissionCallback
    private void startAfterPermission(PluginCall call) {
        JSArray chunksArr = call.getArray("chunks");
        List<String> chunks = new ArrayList<>();
        try {
            for (int i = 0; i < chunksArr.length(); i++) {
                chunks.add(chunksArr.getString(i));
            }
        } catch (Exception e) {
            call.reject("chunks must be strings");
            return;
        }
        startPlayback(call, chunks);
    }

    private void startPlayback(PluginCall call, List<String> chunks) {
        KokoroTtsService.Request request = new KokoroTtsService.Request(
            chunks,
            sanitizeVoiceId(call.getString("voiceId")),
            call.getFloat("rate", 1.0f),
            call.getInt("startIndex", 0),
            call.getString("title", null),
            call.getString("cover", null)
        );
        KokoroTtsService.setPendingRequest(request, new KokoroTtsService.Listener() {
            @Override
            public void onChunk(int index) {
                JSObject data = new JSObject();
                data.put("index", index);
                notifyListeners("chunk", data);
            }

            @Override
            public void onStateChanged(boolean playing) {
                JSObject data = new JSObject();
                data.put("playing", playing);
                notifyListeners("state", data);
            }

            @Override
            public void onComplete() {
                notifyListeners("complete", new JSObject());
            }

            @Override
            public void onError(String errorMessage) {
                JSObject data = new JSObject();
                data.put("message", errorMessage);
                notifyListeners("error", data);
            }

            @Override
            public void onModelLoading() {
                JSObject data = new JSObject();
                data.put("state", "loading");
                notifyListeners("modelState", data);
            }

            @Override
            public void onModelReady(long elapsedMs) {
                JSObject data = new JSObject();
                data.put("state", "ready");
                data.put("elapsedMs", elapsedMs);
                notifyListeners("modelState", data);
            }

            @Override
            public void onSynthesizing(int index) {
                JSObject data = new JSObject();
                data.put("index", index);
                notifyListeners("synthesizing", data);
            }

            @Override
            public void onSkipNext() {
                JSObject data = new JSObject();
                data.put("direction", "next");
                notifyListeners("skip", data);
            }

            @Override
            public void onSkipPrevious() {
                JSObject data = new JSObject();
                data.put("direction", "prev");
                notifyListeners("skip", data);
            }
        });

        Intent intent = new Intent(getContext(), KokoroTtsService.class)
            .setAction(KokoroTtsService.ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        sendServiceAction(KokoroTtsService.ACTION_PAUSE);
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        sendServiceAction(KokoroTtsService.ACTION_RESUME);
        call.resolve();
    }

    @PluginMethod
    public void stopPlayback(PluginCall call) {
        stopServicePlayback();
        call.resolve();
    }

    private void stopServicePlayback() {
        sendServiceAction(KokoroTtsService.ACTION_STOP);
    }

    private void sendServiceAction(String action) {
        Intent intent = new Intent(getContext(), KokoroTtsService.class).setAction(action);
        getContext().startService(intent);
    }

    /**
     * A fresh install has no chosen voice yet, so JS can send an empty or
     * unknown id; fall back to the default voice instead of letting an
     * unchecked id reach a file path (voices/&lt;id&gt;.bin).
     */
    private static String sanitizeVoiceId(String voiceId) {
        return voiceId != null && VOICE_IDS.contains(voiceId) ? voiceId : DEFAULT_VOICE_ID;
    }

    private static String message(Exception e) {
        String m = e.getMessage();
        return m != null && !m.isEmpty() ? m : e.getClass().getSimpleName();
    }
}
