import { computed, ref } from "vue";
import { getVersion } from "@tauri-apps/api/app";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { openUrl } from "@tauri-apps/plugin-opener";
import { download } from "@tauri-apps/plugin-upload";
import { canInstall, installApk, requestInstallPermission } from "@/services/androidInstaller";
import { installApkInApp } from "@/services/apkUpdate";
import {
  fetchUpdateCandidate,
  isAndroidUserAgent,
  resolveInstallAction,
  shouldAttemptAutoCheck,
  summarizeReleaseBody,
  type ReleaseInfo
} from "@/services/updateService";
import { describeError } from "@/utils/describeError";

const LAST_CHECK_KEY = "course-mngr-update-last-check";
const SKIPPED_TAG_KEY = "course-mngr-update-skipped-tag";

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
const installing = ref(false);
const downloadPercent = ref<number | null>(null);
let lastAutoAttemptAt = 0;
let updateGeneration = 0;
let startUpdateBusy = false;

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
    const found = await fetchUpdateCandidate(current);
    // 只在成功时记时间：失败了就该让下一次启动再试，而不是等满 6 小时。
    writeStorage(LAST_CHECK_KEY, String(Date.now()));
    return found
      ? { status: "available", release: found }
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

/// 启动后和切回应用时调用。已经在查、弹窗已经开着都直接返回；失败一律静默。
/// `force`：冷启动，忽略 6 小时成功节流，仍受重试间隔 / busy / 弹窗守卫。
const autoCheck = async (opts?: { force?: boolean }) => {
  const now = Date.now();
  if (!shouldAttemptAutoCheck(now, readLastCheckAt(), lastAutoAttemptAt, opts?.force === true)) {
    return;
  }
  if (checking.value || dialogVisible.value) return;

  lastAutoAttemptAt = now;
  const outcome = await runCheck();
  if (outcome.status === "available" && readStorage(SKIPPED_TAG_KEY) !== outcome.release.tag) {
    showDialog(outcome.release);
  }
};

/// 在 App.vue 挂载时调用，返回清理函数。
///
/// 冷启动（延迟那一次）每次进程都会查，不受 6 小时节流。切回前台仍受 6 小时限制，
/// 避免在后台挂着时反复打 GitHub。
const startAutoCheck = (): (() => void) => {
  const timer = setTimeout(() => void autoCheck({ force: true }), STARTUP_DELAY_MS);
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") void autoCheck();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
};

const closeDialog = () => {
  updateGeneration += 1;
  installing.value = false;
  downloadPercent.value = null;
  dialogVisible.value = false;
};

/// 「稍后」：只关掉，不记任何东西，下次自动检查到点还会再弹。
const dismissDialog = () => {
  closeDialog();
};

const skipThisVersion = () => {
  if (release.value) writeStorage(SKIPPED_TAG_KEY, release.value.tag);
  closeDialog();
};

const openInBrowser = async (url: string) => {
  try {
    await openUrl(url);
    closeDialog();
  } catch (e) {
    // 弹窗留着，用户还能点「查看完整更新说明」或者重试。
    actionError.value = actionError.value
      ? `${actionError.value}；也没能打开浏览器：${describeError(e)}`
      : `没能打开浏览器：${describeError(e)}`;
  }
};

const startUpdate = async () => {
  if (!release.value || installing.value || startUpdateBusy) return;
  const android = isAndroidUserAgent(navigator.userAgent);
  actionError.value = "";
  const generation = (updateGeneration += 1);
  startUpdateBusy = true;

  try {
    // 弹窗里可能是发版刚建、APK 还没传上的那份；按 tag 再拉一次，好接到刚传上的安装包。
    const decision = await resolveInstallAction(release.value, android);
    if (generation !== updateGeneration) return;
    release.value = decision.release;

    if (decision.status === "wait") {
      actionError.value = decision.message;
      return;
    }

    const url = decision.url;
    if (decision.status === "download") {
      installing.value = true;
      downloadPercent.value = 0;
      try {
        const outcome = await installApkInApp(
          url,
          {
            download: (apkUrl, path, onProgress) =>
              download(
                apkUrl,
                path,
                onProgress,
                new Map([["Accept", "application/octet-stream"]])
              ),
            canInstall,
            requestInstallPermission,
            install: installApk,
            appCacheDir,
            join
          },
          (percent) => {
            if (generation === updateGeneration) downloadPercent.value = percent;
          },
          () => generation !== updateGeneration
        );
        if (generation !== updateGeneration) return;
        if (outcome.status === "launched") return;
        if (outcome.status === "permission-denied") {
          actionError.value = "需要允许安装未知应用才能在应用内更新，已改为用浏览器下载";
        } else if (outcome.message === "已取消") {
          return;
        } else {
          actionError.value = `应用内安装失败：${outcome.message}，已改为用浏览器下载`;
        }
      } finally {
        if (generation === updateGeneration) {
          installing.value = false;
          downloadPercent.value = null;
        }
      }
    }

    await openInBrowser(url);
  } finally {
    startUpdateBusy = false;
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
    installing,
    downloadPercent,
    loadCurrentVersion,
    manualCheck,
    startAutoCheck,
    dismissDialog,
    skipThisVersion,
    startUpdate,
    openFullNotes
  };
}
