package com.jimmystate.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Update plumbing that the WebView cannot do by itself.
 *
 * The web layer decides *whether* an update exists (it asks /api/app/version) and
 * downloads the APK with the same progress-reporting code the media downloads use.
 * This plugin only does the two things a browser is not allowed to do:
 *
 *  - read the installed versionCode, so "is there a newer build?" is answered by the
 *    running app rather than by a cached page;
 *  - hand a downloaded file to the system package installer, with the FileProvider
 *    grant the receiver needs.
 *
 * Updating replaces the APK only. WebView storage, the IndexedDB library, playlists,
 * downloads history and the language preference are owned by the app's data
 * directory and are untouched by an install-over — which is why no backup/restore
 * step is needed for an in-place update.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    /** Installed version, read from the package manager — never from the web cache. */
    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? info.getLongVersionCode()
                    : info.versionCode;

            JSObject result = new JSObject();
            result.put("versionName", info.versionName == null ? "" : info.versionName);
            result.put("versionCode", code);
            result.put("packageName", getContext().getPackageName());
            result.put("canInstall", canInstallPackages());
            call.resolve(result);
        } catch (Exception err) {
            call.reject("Could not read the installed version: " + err.getMessage(), err);
        }
    }

    /** True when Android will let this app launch the package installer. */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("canInstall", canInstallPackages());
        call.resolve(result);
    }

    /**
     * Opens the "install unknown apps" screen for this app.
     *
     * Android 8+ requires a per-app grant before an APK can be installed, and the
     * only way to obtain it is for the user to toggle it themselves. Opening the
     * exact screen is the difference between an update that works and one that
     * silently does nothing.
     */
    @PluginMethod
    public void openInstallPermission(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception err) {
            call.reject("Could not open the install permission screen: " + err.getMessage(), err);
        }
    }

    /** App details screen — the place to grant the microphone back after a denial. */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception err) {
            call.reject("Could not open the app settings: " + err.getMessage(), err);
        }
    }

    /**
     * Launches the system installer for a file the web layer already downloaded.
     *
     * `path` is a filesystem path inside the app's own cache/files directory (that is
     * where @capacitor/filesystem writes). The file is exposed through the
     * FileProvider declared in the manifest, because a raw file:// URI is refused by
     * the installer on Android 7+.
     */
    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("install() needs the path of the downloaded APK.");
            return;
        }

        File apk = new File(path.startsWith("file://") ? path.substring(7) : path);
        if (!apk.exists()) {
            call.reject("The downloaded update is no longer on the device. Download it again.");
            return;
        }
        if (!canInstallPackages()) {
            call.reject("ALLOW_INSTALL_REQUIRED");
            return;
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apk);

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject result = new JSObject();
            result.put("launched", true);
            call.resolve(result);
        } catch (Exception err) {
            call.reject("Could not start the installer: " + err.getMessage(), err);
        }
    }

    private boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return getContext().getPackageManager().canRequestPackageInstalls();
        }
        return true;
    }
}
