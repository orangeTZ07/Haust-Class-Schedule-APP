package com.coursemngr.systembars

import android.app.Activity
import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.util.Log
import android.view.WindowManager
import android.webkit.WebView
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.Locale
import kotlin.math.round

private const val TAG = "SystemBars"

/// The event the frontend subscribes to with addPluginListener("system-bars", "insetsChanged", ..).
private const val EVENT_INSETS_CHANGED = "insetsChanged"

/// Arguments for set_bar_style. Camel-case on purpose: @InvokeArg classes carry the JSON keys that
/// the Rust side (SetBarStyleArgs, serde camelCase) sends.
@InvokeArg
class SetBarStyleArgs {
    var darkIcons: Boolean = false
}

/// What the page has to keep clear of -- status bar, navigation bar or gesture bar, display
/// cutout -- in CSS pixels. Android reports pixels, and the WebView's CSS pixel is one dp, so the
/// conversion is a division by the screen density.
///
/// Rounded to two decimals so that equal insets compare equal (density is a float such as 2.625,
/// and the division otherwise leaves noise in the last digits), and so that the CSS text below can
/// never come out in the exponent notation Double.toString uses for tiny values, which is not valid
/// CSS.
private data class SafeInsets(
    val top: Double,
    val right: Double,
    val bottom: Double,
    val left: Double,
) {
    fun toJSObject(): JSObject =
        JSObject().put("top", top).put("right", right).put("bottom", bottom).put("left", left)

    /// A script that writes the four variables onto <html>. Inline style rather than a stylesheet
    /// rule so it wins over whatever the page declares for the same names, and so it needs no
    /// <style> element that a page reload would also drop.
    fun toScript(): String {
        fun px(value: Double) = String.format(Locale.US, "%.2fpx", value)
        return "(function(){var r=document.documentElement;if(!r)return;var s=r.style;" +
            "s.setProperty('--native-safe-top','${px(top)}');" +
            "s.setProperty('--native-safe-right','${px(right)}');" +
            "s.setProperty('--native-safe-bottom','${px(bottom)}');" +
            "s.setProperty('--native-safe-left','${px(left)}');})()"
    }
}

/// Makes the app draw behind the system bars and tells the page how much of its edges they cover.
///
/// Why this exists at all: the Tauri Android template already calls enableEdgeToEdge() in
/// MainActivity and targets SDK 36, so the WebView does extend under the bars. What nothing in
/// tauri, wry or tao does is hand the page the bar sizes, and env(safe-area-inset-*) in the
/// Android System WebView is only filled in by recent Chromium (system bars for every WebView from
/// M144, display cutouts earlier); older WebViews report 0. Reading the insets natively works on
/// all of them.
///
/// Reached as `plugin:system-bars|get_insets` and `plugin:system-bars|set_bar_style`; build.rs
/// declares the snake_case names and Tauri maps them onto the camelCase methods below.
///
/// MainActivity cannot be edited -- src-tauri/gen is regenerated on every build -- so everything
/// that would normally live there is done from load().
@TauriPlugin
class SystemBarsPlugin(private val activity: Activity) : Plugin(activity) {

    private var webView: WebView? = null

    /// The last value pushed to the page, so that the insets listener -- which fires for every
    /// insets dispatch, including each frame of a keyboard animation -- only talks to the WebView
    /// when a number actually changed.
    private var published: SafeInsets? = null

    /// Remembered because the platform can drop the appearance flags on a configuration change.
    /// Null until the frontend has asked for a style, in which case the system default stands.
    private var darkIcons: Boolean? = null

    override fun load(webView: WebView) {
        this.webView = webView
        // The WebView, the window and the insets listener all belong to the UI thread.
        activity.runOnUiThread {
            try {
                setUpWindow()
                watchInsets()
            } catch (e: Exception) {
                // Never let a styling problem take the app down on startup.
                Log.w(TAG, "could not set up edge-to-edge", e)
            }
        }
    }

    /// Rotation, a different screen size and a switch between gesture and three-button navigation
    /// all change the insets. The insets listener sees the new values by itself; this asks for a
    /// fresh dispatch in case the system does not send one, and puts the icon style back.
    ///
    /// (Plugin.onResume is not used for the same purpose: nothing in tauri 2.11 registers the
    /// lifecycle observer that would call it. This hook is wired through TauriActivity.)
    override fun onConfigurationChanged(newConfig: Configuration) {
        activity.runOnUiThread {
            try {
                applyBarStyle()
                ViewCompat.requestApplyInsets(activity.window.decorView)
            } catch (e: Exception) {
                Log.w(TAG, "could not refresh after a configuration change", e)
            }
        }
    }

    @Command
    fun getInsets(invoke: Invoke) {
        // The page asks once per load. A reload drops the CSS variables written by publish(), and
        // the insets listener will not fire again for unchanged insets, so this is how they come
        // back.
        activity.runOnUiThread {
            try {
                val root = ViewCompat.getRootWindowInsets(activity.window.decorView)
                val insets = if (root != null) measure(root) else published ?: measure(null)
                invoke.resolve(insets.toJSObject())
            } catch (e: Exception) {
                invoke.reject(e.message ?: "读取系统栏尺寸失败")
            }
        }
    }

    @Command
    fun setBarStyle(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SetBarStyleArgs::class.java)
            darkIcons = args.darkIcons
            activity.runOnUiThread {
                try {
                    applyBarStyle()
                    invoke.resolve()
                } catch (e: Exception) {
                    invoke.reject(e.message ?: "设置状态栏样式失败")
                }
            }
        } catch (e: Exception) {
            invoke.reject(e.message ?: "设置状态栏样式失败")
        }
    }

    /// Does what MainActivity's enableEdgeToEdge() does, again. That call is in the stock template,
    /// but this plugin must not silently stop working if a future template drops it, and every
    /// step here is idempotent. The values follow androidx.activity 1.10 (EdgeToEdge.kt) except
    /// where noted.
    @Suppress("DEPRECATION")
    private fun setUpWindow() {
        val window = activity.window
        WindowCompat.setDecorFitsSystemWindows(window, false)

        // The page paints behind the bars, so the bars themselves must not paint over it.
        window.statusBarColor = Color.TRANSPARENT
        // Below API 26 the navigation bar cannot switch to dark icons (no
        // isAppearanceLightNavigationBars), so leaving it as the system / enableEdgeToEdge set it
        // keeps a dark scrim behind the always-white icons. Transparent would make them
        // unreadable on a light page.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            window.navigationBarColor = Color.TRANSPARENT
        }
        // From API 29 the platform draws a translucent scrim behind a transparent three-button
        // bar ("contrast enforcement"). With it on, the strip under the page is a grey the theme
        // knows nothing about; with it off the page's own background shows through, and
        // set_bar_style keeps the icons readable against it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }

        // Let the page extend into a notch or punch-hole in every orientation. Without this a
        // landscape phone letterboxes the cutout side with a black bar, and the displayCutout()
        // inset below would describe an area the page never gets to draw in.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val params = window.attributes
            params.layoutInDisplayCutoutMode =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                } else {
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                }
            window.attributes = params
        }
    }

    private fun watchInsets() {
        val decor = activity.window.decorView
        ViewCompat.setOnApplyWindowInsetsListener(decor) { view, windowInsets ->
            publish(measure(windowInsets))
            // Observe only. The insets go on unchanged, through the view's own handling, so the
            // WebView below still sees all of them: a Chromium recent enough to fill
            // env(safe-area-inset-*) itself keeps doing so, and the page takes max() of both
            // sources, so nothing is counted twice. Returning WindowInsetsCompat.CONSUMED here
            // would stop that, and Chromium has been seen to stop recomputing its safe area after
            // a consumed dispatch (https://issues.chromium.org/issues/461332423, as reported in
            // Capacitor's SystemBars plugin).
            ViewCompat.onApplyWindowInsets(view, windowInsets)
        }
        // The listener only runs on a dispatch, and the first one may already have happened by the
        // time load() runs.
        ViewCompat.requestApplyInsets(decor)
    }

    private fun measure(windowInsets: WindowInsetsCompat?): SafeInsets {
        // systemBars() is status bar + navigation bar (+ caption bar); displayCutout() is the
        // notch. getInsets() on a combined mask returns the largest value per side, which is what
        // "keep clear of all of these" means.
        val types = WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
        val px = windowInsets?.getInsets(types) ?: Insets.NONE
        val density = activity.resources.displayMetrics.density.toDouble()
        return SafeInsets(
            top = toCssPx(px.top, density),
            right = toCssPx(px.right, density),
            bottom = toCssPx(px.bottom, density),
            left = toCssPx(px.left, density),
        )
    }

    private fun toCssPx(pixels: Int, density: Double): Double =
        round(pixels / density * 100.0) / 100.0

    /// Pushes new values to the page twice over: written straight into the document so the layout
    /// does not wait for any script, and as an event so the frontend can react. The frontend also
    /// pulls them with getInsets at startup, because a page that was not loaded yet when this ran
    /// has no <html> to write to.
    private fun publish(insets: SafeInsets) {
        if (insets == published) return
        published = insets
        try {
            webView?.evaluateJavascript(insets.toScript(), null)
        } catch (e: Exception) {
            Log.w(TAG, "could not write the CSS variables", e)
        }
        try {
            trigger(EVENT_INSETS_CHANGED, insets.toJSObject())
        } catch (e: Exception) {
            Log.w(TAG, "could not notify the frontend", e)
        }
    }

    private fun applyBarStyle() {
        val dark = darkIcons ?: return
        val window = activity.window
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        // "Light" here describes the bar's background, not its icons: a light bar gets dark icons.
        controller.isAppearanceLightStatusBars = dark
        controller.isAppearanceLightNavigationBars = dark
    }
}
