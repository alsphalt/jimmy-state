package com.jimmystate.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

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

    private static final int PERMISSION_REQUEST = 5173;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before super.onCreate so the plugin exists by the time the
        // WebView starts loading and the JS bridge looks for it.
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);

        requestCorePermissions();

        if (bridge != null && bridge.getWebView() != null) {
            WebSettings settings = bridge.getWebView().getSettings();
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
        }
    }

    /**
     * Asks for the two runtime permissions the features depend on.
     *
     * A manifest entry alone grants nothing on Android 6+. Without this the microphone
     * prompt never appears, getUserMedia() rejects with NotAllowedError, and recognition
     * looks broken — the one bug an APK user would blame on the app rather than their
     * phone. Asking at launch also keeps the prompt out of the middle of a tap.
     */
    private void requestCorePermissions() {
        List<String> wanted = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            wanted.add(Manifest.permission.RECORD_AUDIO);
        }
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(this, "android.permission.POST_NOTIFICATIONS")
            != PackageManager.PERMISSION_GRANTED) {
            wanted.add("android.permission.POST_NOTIFICATIONS");
        }
        if (!wanted.isEmpty()) {
            ActivityCompat.requestPermissions(this, wanted.toArray(new String[0]), PERMISSION_REQUEST);
        }
    }
}
