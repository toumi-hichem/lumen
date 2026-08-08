package org.wikisubmission.lumen;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;
import org.wikisubmission.lumen.supertonic.SupertonicNativePlugin;
import org.wikisubmission.lumen.kokoro.KokoroNativePlugin;
import org.wikisubmission.lumen.volume.VolumeKeysPlugin;
import org.wikisubmission.lumen.screen.ScreenAwakePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SupertonicNativePlugin.class);
        registerPlugin(KokoroNativePlugin.class);
        registerPlugin(VolumeKeysPlugin.class);
        registerPlugin(ScreenAwakePlugin.class);
        super.onCreate(savedInstanceState);
        int nightMode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        int bgColor = nightMode == Configuration.UI_MODE_NIGHT_YES
            ? Color.parseColor("#14181F")
            : Color.parseColor("#F7F8FA");
        getBridge().getWebView().setBackgroundColor(bgColor);
    }

    /**
     * Route volume presses to the reader while it has asked for them. Both the
     * down and the up event are swallowed in that case, otherwise the system
     * still shows its volume slider on release.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        boolean isVolumeKey = keyCode == KeyEvent.KEYCODE_VOLUME_UP
            || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN;
        if (isVolumeKey && VolumeKeysPlugin.isCapturing()) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                // Auto-repeat events are forwarded too: holding a button keeps
                // a scrolled page moving. The web layer decides what to do with
                // them, page mode ignores repeats.
                VolumeKeysPlugin.dispatchVolumeKey(keyCode, event.getRepeatCount() > 0);
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
}
