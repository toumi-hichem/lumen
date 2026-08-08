package org.wikisubmission.lumen.volume;

import android.view.KeyEvent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.atomic.AtomicReference;

/**
 * Lets the reader borrow the volume buttons for page navigation.
 *
 * The web layer turns capture on only while a book is open with no chrome or
 * narration in the way; every other moment the keys fall through to the system
 * so they still change the volume. MainActivity does the interception and asks
 * this plugin whether the press belongs to the reader.
 */
@CapacitorPlugin(name = "VolumeKeys")
public class VolumeKeysPlugin extends Plugin {

    /** The live plugin instance, so the activity's key dispatch can reach it. */
    private static final AtomicReference<VolumeKeysPlugin> ACTIVE = new AtomicReference<>();

    private volatile boolean capturing = false;

    @Override
    public void load() {
        ACTIVE.set(this);
    }

    @Override
    protected void handleOnDestroy() {
        ACTIVE.compareAndSet(this, null);
        capturing = false;
    }

    @PluginMethod
    public void setCapture(PluginCall call) {
        capturing = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        call.resolve();
    }

    /** True while the reader wants the volume keys instead of the system. */
    public static boolean isCapturing() {
        VolumeKeysPlugin plugin = ACTIVE.get();
        return plugin != null && plugin.capturing;
    }

    /**
     * Relay a volume key press to the web layer. Returns false when nothing is
     * listening, so the caller can let the system handle the key.
     */
    public static boolean dispatchVolumeKey(int keyCode, boolean repeat) {
        VolumeKeysPlugin plugin = ACTIVE.get();
        if (plugin == null || !plugin.capturing) return false;
        String direction;
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) direction = "up";
        else if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) direction = "down";
        else return false;
        JSObject data = new JSObject();
        data.put("direction", direction);
        data.put("repeat", repeat);
        plugin.notifyListeners("volumeKey", data);
        return true;
    }
}
