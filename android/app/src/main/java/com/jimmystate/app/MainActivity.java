package com.jimmystate.app;

import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

/**
 * The Android host for the JIMMY STATE web app.
 *
 * There is no native UI here on purpose: the activity hosts the same bundle the
 * website and the PWA serve, so a screen can never exist on one platform and not
 * the others.
 *
 * Two things are tuned for media:
 *  - playback is allowed without a fresh user gesture, which is what makes the
 *    player resume after a screen lock instead of staying silent;
 *  - DOM storage and database storage are enabled explicitly, because the library,
 *    playlists, downloads history and the chosen language live in the WebView's
 *    storage and must survive an APK update.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before super.onCreate so the plugin exists by the time the
        // WebView starts loading and the JS bridge looks for it.
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);

        if (bridge != null && bridge.getWebView() != null) {
            WebSettings settings = bridge.getWebView().getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
        }
    }
}
