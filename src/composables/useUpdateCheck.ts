import { computed, ref } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { openUrl } from "@tauri-apps/plugin-opener";
import { download } from "@tauri-apps/plugin-upload";
import { canInstall, installApk, requestInstallPermission } from "@/services/androidInstaller";
import {
  decideInstallFollowUp,
  installApkInAppWithRetries,
  isMissingApkError,
  type InstallPhase
} from "@/services/apkUpdate";
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
const DOWNLOADED_APK_KEY = "course-mngr-update-downloaded-apk";

/// 启动后等一会儿再查，别跟首屏加载抢网络和主线程。
const STARTUP_DELAY_MS = 3000;

export type CheckOutcome =
  | { status: "available"; release: ReleaseInfo }
  | { status: "latest" }
  | { status: "error"; message: string }
  /// 已经有一次检查在跑，这次没有发请求。
  | { status: "busy" };

type DownloadedApkMarker = { tag: string; path: string };

// 状态放在模块里，不放进函数：弹窗挂在 App.vue，「检查更新」按钮在设置页，两处要共用同一份。
const currentVersion = ref("");
const checking = ref(false);
const dialogVisible = ref(false);
const release = ref<ReleaseInfo | null>(null);
const actionError = ref("");
const installing = ref(false);
const downloadPercent = ref<number | null>(null);
const installPhase = ref<InstallPhase>("idle");
const cachedApkReady = ref(false);
const primaryKind = ref<"update" | "continue" | "retry">("update");
let lastAutoAttemptAt = 0;
let updateGeneration = 0;
let startUpdateBusy = false;
let consecutiveInstallFails = 0;
let consecutiveInstallFailsTag = "";

const primaryActionLabel = computed(() => {
  if (installPhase.value === "downloading") return "下载中…";
  if (installPhase.value === "waiting-permission") return "等待授权…";
  if (installPhase.value === "launching-installer") return "正在安装…";
  if (primaryKind.value === "retry") return "重试安装";
  if (primaryKind.value === "continue" || cachedApkReady.value) return "继续安装";
  return "立即更新";
});

const installBusy = computed(
  () =>
    installPhase.value === "downloading" ||
    installPhase.value === "waiting-permission" ||
    installPhase.value === "launching-installer"
);

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

const removeStorage = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // 清不掉就下次再用一遍路径，安装时发现没了再重新下。
  }
};

const readLastCheckAt = (): number => {
  const value = Number(readStorage(LAST_CHECK_KEY));
  return Number.isFinite(value) ? value : 0;
};

const readDownloadedMarker = (): DownloadedApkMarker | null => {
  const raw = readStorage(DOWNLOADED_APK_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DownloadedApkMarker>;
    if (typeof parsed.tag === "string" && parsed.tag && typeof parsed.path === "string" && parsed.path) {
      return { tag: parsed.tag, path: parsed.path };
    }
  } catch {
    // 坏数据当没有。
  }
  return null;
};

const writeDownloadedMarker = (tag: string, path: string) => {
  writeStorage(DOWNLOADED_APK_KEY, JSON.stringify({ tag, path }));
  cachedApkReady.value = true;
};

const clearDownloadedMarker = () => {
  removeStorage(DOWNLOADED_APK_KEY);
  cachedApkReady.value = false;
};

/// 探得到文件才信缓存。探失败先当还在：安装时 Kotlin 会说找不到，再改下一次。
const cachedFileLooksPresent = async (path: string): Promise<boolean> => {
  try {
    const response = await fetch(convertFileSrc(path));
    return response.ok;
  } catch {
    return true;
  }
};

const syncCachedReady = (tag: string) => {
  const marker = readDownloadedMarker();
  if (marker?.tag === tag) {
    cachedApkReady.value = true;
    if (primaryKind.value === "update") primaryKind.value = "continue";
  } else {
    cachedApkReady.value = false;
    if (primaryKind.value === "continue") primaryKind.value = "update";
  }
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
  if (consecutiveInstallFailsTag !== found.tag) {
    consecutiveInstallFails = 0;
    consecutiveInstallFailsTag = found.tag;
  }
  syncCachedReady(found.tag);
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

/// 从设置页回来或进程被杀掉再打开：有下好的包就弹出「继续安装」，别停在空白里。
const offerContinueFromCache = () => {
  if (installBusy.value) return;
  const marker = readDownloadedMarker();
  if (!marker) return;
  if (release.value && release.value.tag !== marker.tag) return;
  cachedApkReady.value = true;
  if (primaryKind.value === "update") primaryKind.value = "continue";
  if (release.value) dialogVisible.value = true;
};

/// 在 App.vue 挂载时调用，返回清理函数。
///
/// 冷启动（延迟那一次）每次进程都会查，不受 6 小时节流。切回前台仍受 6 小时限制，
/// 避免在后台挂着时反复打 GitHub。
const startAutoCheck = (): (() => void) => {
  const timer = setTimeout(() => void autoCheck({ force: true }), STARTUP_DELAY_MS);
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      offerContinueFromCache();
      void autoCheck();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
};

const resetInstallUi = () => {
  installing.value = false;
  downloadPercent.value = null;
  installPhase.value = "idle";
};

const closeDialog = () => {
  updateGeneration += 1;
  resetInstallUi();
  dialogVisible.value = false;
};

/// 「稍后」：只关掉，不记任何东西，下次自动检查到点还会再弹。
const dismissDialog = () => {
  closeDialog();
};

const skipThisVersion = () => {
  if (installBusy.value) return;
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

const apkInstallDeps = {
  download: (
    apkUrl: string,
    path: string,
    onProgress?: (progress: { progressTotal: number; total: number }) => void
  ) =>
    download(apkUrl, path, onProgress, new Map([["Accept", "application/octet-stream"]])),
  canInstall,
  requestInstallPermission,
  install: installApk,
  appCacheDir,
  join,
  exists: cachedFileLooksPresent
};

const startUpdate = async () => {
  if (!release.value || installBusy.value || startUpdateBusy) return;
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
    if (decision.status !== "download") {
      await openInBrowser(url);
      return;
    }

    if (consecutiveInstallFailsTag !== decision.release.tag) {
      consecutiveInstallFails = 0;
      consecutiveInstallFailsTag = decision.release.tag;
    }

    let cachedPath: string | undefined;
    const marker = readDownloadedMarker();
    if (marker?.tag === decision.release.tag) {
      const stillThere = await cachedFileLooksPresent(marker.path);
      if (stillThere) cachedPath = marker.path;
      else clearDownloadedMarker();
    }

    const runInstall = (path?: string) =>
      installApkInAppWithRetries(
        {
          apkUrl: url,
          tag: decision.release.tag,
          cachedPath: path,
          onProgress: (percent) => {
            if (generation === updateGeneration) downloadPercent.value = percent;
          },
          onPhase: (phase) => {
            if (generation !== updateGeneration) return;
            installPhase.value = phase;
            installing.value =
              phase === "downloading" ||
              phase === "waiting-permission" ||
              phase === "launching-installer";
            if (phase !== "downloading") downloadPercent.value = null;
          },
          onDownloaded: (savedPath) => {
            writeDownloadedMarker(decision.release.tag, savedPath);
          },
          isCancelled: () => generation !== updateGeneration
        },
        apkInstallDeps
      );

    let outcome = await runInstall(cachedPath);
    if (generation !== updateGeneration) return;

    if (
      outcome.status === "install-failed" &&
      cachedPath &&
      isMissingApkError(outcome.message)
    ) {
      clearDownloadedMarker();
      outcome = await runInstall(undefined);
      if (generation !== updateGeneration) return;
    }

    if (outcome.status === "launched") {
      consecutiveInstallFails = 0;
      primaryKind.value = "continue";
      return;
    }
    if (outcome.status === "cancelled") return;

    if (outcome.status === "install-failed") consecutiveInstallFails += 1;
    else consecutiveInstallFails = 0;

    const follow = decideInstallFollowUp(outcome, consecutiveInstallFails);
    if (follow.action === "stay") {
      actionError.value = follow.message;
      primaryKind.value = follow.button;
      if (outcome.status === "permission-denied" || outcome.status === "install-failed") {
        writeDownloadedMarker(decision.release.tag, outcome.path);
      }
      return;
    }
    if (follow.action === "browser") {
      actionError.value = follow.message;
      primaryKind.value = "update";
      await openInBrowser(url);
    }
  } finally {
    startUpdateBusy = false;
    if (generation === updateGeneration) resetInstallUi();
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
    installBusy,
    downloadPercent,
    installPhase,
    primaryActionLabel,
    loadCurrentVersion,
    manualCheck,
    startAutoCheck,
    dismissDialog,
    skipThisVersion,
    startUpdate,
    openFullNotes
  };
}
