import { onBeforeUnmount, watch } from "vue";
import type { PluginListener } from "@tauri-apps/api/core";
import { useTheme } from "@/composables/useTheme";
import {
  applyInsetsToCss,
  getInsets,
  listenInsets,
  setBarStyle
} from "@/services/systemBarsService";

/// Keeps the page clear of the Android system bars and keeps the bar icons readable.
///
/// Two jobs, both best-effort:
///  1. Put the real bar sizes into `--native-safe-top/right/bottom/left`. The native plugin also
///     writes them into the document by itself whenever they change, but it cannot reach a page
///     that has not loaded yet and a reload wipes what it wrote -- so the page pulls them once at
///     startup as well. Neither path is enough on its own.
///  2. Tell the system whether to draw dark or light status / navigation bar icons, following the
///     theme: a light theme needs dark icons.
///
/// Every failure is swallowed. In a plain browser there is no Tauri at all, and on desktop the
/// plugin has nothing to report; neither is an error worth showing. The `debug` line is the only
/// trace, and it is hidden at the default console level.
///
/// Call once, from App.vue.
export function useSystemBars() {
  const { isDark } = useTheme();

  let listener: PluginListener | undefined;
  let stopped = false;

  const quiet = (what: string) => (error: unknown) => {
    console.debug(`[system-bars] ${what}:`, error);
  };

  const pull = () => getInsets().then(applyInsetsToCss).catch(quiet("get_insets"));

  watch(
    isDark,
    (dark) => {
      setBarStyle(!dark).catch(quiet("set_bar_style"));
    },
    { immediate: true }
  );

  // Subscribe before pulling: an event that lands between the two is then never lost, and the pull
  // that follows is at least as recent as anything the subscription missed.
  listenInsets(applyInsetsToCss)
    .then((handle) => {
      if (stopped) {
        // Unmounted while the subscription was still being set up.
        handle.unregister().catch(quiet("remove_listener"));
      } else {
        listener = handle;
      }
    })
    .catch(quiet("register_listener"))
    .then(pull);

  onBeforeUnmount(() => {
    stopped = true;
    listener?.unregister().catch(quiet("remove_listener"));
    listener = undefined;
  });
}
