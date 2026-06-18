package org.wikisubmission.lumen;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int nightMode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        int bgColor = nightMode == Configuration.UI_MODE_NIGHT_YES
            ? Color.parseColor("#14181F")
            : Color.parseColor("#F7F8FA");
        getBridge().getWebView().setBackgroundColor(bgColor);
    }
}
