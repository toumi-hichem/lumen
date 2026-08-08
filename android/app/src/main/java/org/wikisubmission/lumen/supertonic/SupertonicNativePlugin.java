package org.wikisubmission.lumen.supertonic;

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

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * JS bridge for the native Supertonic read-aloud pipeline. Owns model
 * download/state and hands full playback queues to SupertonicTtsService,
 * relaying its progress back to JS as plugin events ('chunk', 'state',
 * 'complete', 'error', 'downloadProgress', 'skip').
 */
@CapacitorPlugin(
    name = "SupertonicNative",
    permissions = {
        @Permission(
            alias = SupertonicNativePlugin.NOTIFICATIONS,
            strings = {Manifest.permission.POST_NOTIFICATIONS}
        )
    }
)
public class SupertonicNativePlugin extends Plugin {

    static final String NOTIFICATIONS = "notifications";

    /** Full denoising quality; requests without an explicit `steps` use it. */
    private static final int DEFAULT_STEPS = 8;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private SupertonicModelStore store() {
        return new SupertonicModelStore(getContext());
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
            // The cached sessions hold the model files open; drop them first.
            SupertonicRuntimeHolder.release();
            store().clear();
            call.resolve();
        });
    }

    /**
     * Detected CPU topology and the inference strategy derived from it, for
     * the settings UI and debugging. Detection itself stays native — the web
     * layer never configures threads/steps, it only observes the choice.
     */
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
        result.put("initialSteps", topology.initialSteps(DEFAULT_STEPS));
        result.put("source", topology.source());
        result.put("summary", topology.toString());
        call.resolve(result);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (!store().isComplete()) {
            call.reject("Supertonic voice is not downloaded");
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

        // A media notification needs POST_NOTIFICATIONS on 13+; playback works
        // without it, so ask once and start regardless of the answer.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState(NOTIFICATIONS) == PermissionState.PROMPT) {
            requestPermissionForAlias(NOTIFICATIONS, call, "startAfterPermission");
            return;
        }
        startPlayback(call, chunks);
    }

    @PermissionCallback
    private void startAfterPermission(PluginCall call) {
        // Start whether or not the notification permission was granted.
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
        SupertonicTtsService.Request request = new SupertonicTtsService.Request(
            chunks,
            sanitizeVoiceId(call.getString("voiceId")),
            call.getFloat("rate", 1.0f),
            call.getInt("steps", DEFAULT_STEPS),
            call.getInt("startIndex", 0),
            call.getString("lang", "en"),
            call.getString("title", null),
            call.getString("cover", null)
        );
        SupertonicTtsService.setPendingRequest(request, new SupertonicTtsService.Listener() {
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

        Intent intent = new Intent(getContext(), SupertonicTtsService.class)
            .setAction(SupertonicTtsService.ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        sendServiceAction(SupertonicTtsService.ACTION_PAUSE);
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        sendServiceAction(SupertonicTtsService.ACTION_RESUME);
        call.resolve();
    }

    @PluginMethod
    public void stopPlayback(PluginCall call) {
        stopServicePlayback();
        call.resolve();
    }

    private void stopServicePlayback() {
        sendServiceAction(SupertonicTtsService.ACTION_STOP);
    }

    private void sendServiceAction(String action) {
        Intent intent = new Intent(getContext(), SupertonicTtsService.class).setAction(action);
        getContext().startService(intent);
    }

    /**
     * A fresh install has no chosen voice yet, so JS can send an empty or
     * unknown id; an unchecked one ends up in a style file path
     * (voice_styles/&lt;id&gt;.json). Fall back to the default voice instead.
     */
    private static String sanitizeVoiceId(String voiceId) {
        if (voiceId == null || !voiceId.matches("[MF][1-5]")) return "M1";
        return voiceId;
    }

    private static String message(Exception e) {
        String m = e.getMessage();
        return m != null && !m.isEmpty() ? m : e.getClass().getSimpleName();
    }
}
