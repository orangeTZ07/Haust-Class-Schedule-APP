import { computed, ref } from "vue";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  fetchLatestRelease,
  isAndroidUserAgent,
  isNewerVersion,
  pickInstallUrl,
  summarizeReleaseBody,
  type ReleaseInfo
} from "@/services/updateService";
import { describeError } from "@/utils/describeError";

const LAST_CHECK_KEY = "course-mngr-update-last-check";
const SKIPPED_TAG_KEY = "course-mngr-update-skipped-tag";

/// 自动检查最多每 6 小时一次。
const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/// 上次检查失败（没记下成功时间）时，自动检查两次尝试之间至少隔这么久。
/// 否则断网时每次切回应用都会再发一次请求。
const AUTO_RETRY_GAP_MS = 10 * 60 * 1000;
/// 启动后等一会儿再查，别跟首屏加载抢网络和主线程。
const STARTUP_DELAY_MS = 3000;

export type CheckOutcome =
  | { status: "available"; release: ReleaseInfo }
  | { status: "latest" }
  | { status: "error"; message: string }
  /// 已经有一次检查在跑，这次没有发请求。
  | { status: "busy" };

// 状态放在模块里，不放进函数：弹窗挂在 App.vue，「检查更新」按钮在设置页，两处要共用同一份。
const currentVersion = ref("");
const checking = ref(false);
const dialogVisible = ref(false);
const release = ref<ReleaseInfo | null>(null);
const actionError = ref("");
let lastAutoAttemptAt = 0;

// localStorage 在无痕窗口或被清理时可能抛错；检查更新不该因此坏掉。
const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 记不下来的后果只是多问一次，不值得打扰用户。
  }
};

const readLastCheckAt = (): number => {
  const value = Number(readStorage(LAST_CHECK_KEY));
  return Number.isFinite(value) ? value : 0;
};

const loadCurrentVersion = async (): Promise<string> => {
  if (currentVersion.value) return currentVersion.value;
  try {
    currentVersion.value = await getVersion();
  } catch (e) {
    // 浏览器里直接开前端（npm run dev）时没有 Tauri 运行时，会走到这里。
    throw new Error(`读不到当前版本：${describeError(e)}`);
  }
  return currentVersion.value;
};

/// 只做「查」：不弹窗、不读写「跳过」。弹不弹由调用方按场景决定。
const runCheck = async (): Promise<CheckOutcome> => {
  if (checking.value) return { status: "busy" };
  checking.value = true;
  try {
    const current = await loadCurrentVersion();
    const latest = await fetchLatestRelease();
    // 只在成功时记时间：失败了就该让下一次启动再试，而不是等满 6 小时。
    writeStorage(LAST_CHECK_KEY, String(Date.now()));
    return isNewerVersion(latest.tag, current)
      ? { status: "available", release: latest }
      : { status: "latest" };
  } catch (e) {
    return { status: "error", message: describeError(e) };
  } finally {
    checking.value = false;
  }
};

const showDialog = (found: ReleaseInfo) => {
  release.value = found;
  actionError.value = "";
  dialogVisible.value = true;
};

/// 用户点「检查更新」。有新版就弹窗，即使这个版本之前被「跳过」过——这是用户主动要看的。
const manualCheck = async (): Promise<CheckOutcome> => {
  const outcome = await runCheck();
  if (outcome.status === "available") showDialog(outcome.release);
  return outcome;
};

/// 启动后和切回应用时调用。没到时间、已经在查、弹窗已经开着都直接返回；失败一律静默。
const autoCheck = async () => {
  const now = Date.now();
  const sinceLastCheck = now - readLastCheckAt();
  // sinceLastCheck 为负说明系统时间被往回调过，不能因此一直不查。
  const due = sinceLastCheck < 0 || sinceLastCheck >= AUTO_CHECK_INTERVAL_MS;
  if (!due || now - lastAutoAttemptAt < AUTO_RETRY_GAP_MS) return;
  if (checking.value || dialogVisible.value) return;

  lastAutoAttemptAt = now;
  const outcome = await runCheck();
  if (outcome.status === "available" && readStorage(SKIPPED_TAG_KEY) !== outcome.release.tag) {
    showDialog(outcome.release);
  }
};

/// 在 App.vue 挂载时调用，返回清理函数。
///
/// 除了启动后查一次，还在切回前台时查：手机上应用常常在后台挂好几天都不重启，只在启动时查的话，
/// 「每 6 小时」基本等于「几乎不查」。切回前台时同样受 6 小时的限制。
const startAutoCheck = (): (() => void) => {
  const timer = setTimeout(() => void autoCheck(), STARTUP_DELAY_MS);
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") void autoCheck();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
};

/// 「稍后」：只关掉，不记任何东西，下次自动检查到点还会再弹。
const dismissDialog = () => {
  dialogVisible.value = false;
};

const skipThisVersion = () => {
  if (release.value) writeStorage(SKIPPED_TAG_KEY, release.value.tag);
  dialogVisible.value = false;
};

const startUpdate = async () => {
  if (!release.value) return;
  const url = pickInstallUrl(release.value, isAndroidUserAgent(navigator.userAgent));
  actionError.value = "";
  try {
    await openUrl(url);
    dialogVisible.value = false;
  } catch (e) {
    // 弹窗留着，用户还能点「查看完整更新说明」或者重试。
    actionError.value = `没能打开浏览器：${describeError(e)}`;
  }
};

const openFullNotes = async () => {
  if (!release.value) return;
  actionError.value = "";
  try {
    await openUrl(release.value.htmlUrl);
  } catch (e) {
    actionError.value = `没能打开浏览器：${describeError(e)}`;
  }
};

export function useUpdateCheck() {
  const notes = computed(() =>
    release.value ? summarizeReleaseBody(release.value.body) : { groups: [], hidden: 0 }
  );

  return {
    currentVersion,
    checking,
    dialogVisible,
    release,
    notes,
    actionError,
    loadCurrentVersion,
    manualCheck,
    startAutoCheck,
    dismissDialog,
    skipThisVersion,
    startUpdate,
    openFullNotes
  };
}
