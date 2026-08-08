package org.wikisubmission.lumen.screen;

import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Holds the screen on while a book is open. The web Wake Lock API is missing or
 * unreliable in the Android WebView and does not stop the display from dimming
 * first, so the activity's own FLAG_KEEP_SCREEN_ON is used instead. Android
 * ignores the flag whenever the activity is not in the foreground, so nothing
 * has to be released when the app is backgrounded.
 */
@CapacitorPlugin(name = "ScreenAwake")
public class ScreenAwakePlugin extends Plugin {

    @PluginMethod
    public void setKeepAwake(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            if (enabled) {
                getActivity().getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getActivity().getWindow().clearFlags(
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        getActivity().getWindow().clearFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
