package dev.imal.tauri.androidinstaller

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class InstallArgs {
    var path: String? = null
}

@InvokeArg
class LaunchAppArgs {
    var packageName: String? = null
}

@TauriPlugin
class InstallerPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun install(invoke: Invoke) {
        val path = invoke.parseArgs(InstallArgs::class.java).path
        if (path.isNullOrBlank()) {
            invoke.reject("No APK path provided.")
            return
        }

        val file = File(path)
        if (!file.isFile) {
            invoke.reject("APK not found or not a regular file at path: $path")
            return
        }

        val uri: Uri = try {
            FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.installer.fileprovider",
                file
            )
        } catch (e: IllegalArgumentException) {
            invoke.reject(
                "APK path is not inside a shareable directory: $path. " +
                    "Download it into the app cache or files dir (e.g. appCacheDir())."
            )
            return
        }

        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        try {
            activity.startActivity(intent)
            invoke.resolve()
        } catch (e: ActivityNotFoundException) {
            invoke.reject("No installer available to handle the APK.")
        } catch (e: Exception) {
            invoke.reject(e.message ?: "Failed to launch the installer.")
        }
    }

    @Command
    fun canInstall(invoke: Invoke) {
        val ret = JSObject()
        ret.put("canInstall", canRequestInstalls())
        invoke.resolve(ret)
    }

    @Command
    fun requestInstallPermission(invoke: Invoke) {
        if (canRequestInstalls()) {
            invoke.resolve()
            return
        }
        val intent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${activity.packageName}")
        )
        try {
            startActivityForResult(invoke, intent, "installPermissionResult")
        } catch (e: ActivityNotFoundException) {
            invoke.reject("Could not open the 'install unknown apps' settings screen.")
        }
    }

    @ActivityCallback
    fun installPermissionResult(invoke: Invoke, result: ActivityResult) {
        invoke.resolve()
    }

    /**
     * Launches an installed app by package name. Resolves `{ launched: false }` instead of
     * rejecting when the app is not installed (or not visible to us -- on Android 11+ the package
     * has to be declared in a `<queries>` entry in AndroidManifest.xml), so callers can fall back
     * without a try/catch.
     */
    @Command
    fun launchApp(invoke: Invoke) {
        val packageName = invoke.parseArgs(LaunchAppArgs::class.java).packageName
        if (packageName.isNullOrBlank()) {
            invoke.reject("No package name provided.")
            return
        }

        val ret = JSObject()
        val intent = activity.packageManager.getLaunchIntentForPackage(packageName)
        if (intent == null) {
            ret.put("launched", false)
            invoke.resolve(ret)
            return
        }

        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val launched = try {
            activity.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
        ret.put("launched", launched)
        invoke.resolve(ret)
    }

    private fun canRequestInstalls(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            activity.packageManager.canRequestPackageInstalls()
    }
}
