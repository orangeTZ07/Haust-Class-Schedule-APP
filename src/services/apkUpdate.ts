import { describeError } from "../utils/describeError";

export type DownloadProgress = { progressTotal: number; total: number };

export type ApkInstallDeps = {
  download: (
    url: string,
    path: string,
    onProgress?: (progress: DownloadProgress) => void
  ) => Promise<void>;
  canInstall: () => Promise<boolean>;
  requestInstallPermission: () => Promise<void>;
  install: (path: string) => Promise<void>;
  appCacheDir: () => Promise<string>;
  join: (base: string, ...parts: string[]) => Promise<string>;
  exists?: (path: string) => Promise<boolean>;
};

export type InstallPhase = "idle" | "downloading" | "waiting-permission" | "launching-installer";

export type InAppInstallResult =
  | { status: "launched" }
  | { status: "permission-denied"; path: string }
  | { status: "download-failed"; message: string }
  | { status: "install-failed"; message: string; path: string }
  | { status: "cancelled" };

export const DOWNLOAD_RETRY_LIMIT = 3;
export const INSTALL_FAIL_BEFORE_BROWSER = 2;
export const INCOMPLETE_DOWNLOAD_MESSAGE = "下载不完整";
export const PERMISSION_DENIED_HINT = "请在设置里允许本应用安装未知应用，返回后点「继续安装」";

export const installFailedStayHint = (message: string): string =>
  `没能唤起系统安装：${message}。安装包还在，可点「重试安装」`;

export const downloadFailedBrowserHint = (message: string): string =>
  `应用内下载失败：${message}，已改为用浏览器下载`;

export const installFailedBrowserHint = (message: string): string =>
  `多次没能唤起系统安装：${message}，已改为用浏览器下载`;

export const downloadPercent = (progress: DownloadProgress): number | null => {
  if (!(progress.total > 0)) return null;
  return Math.max(0, Math.min(100, Math.round((progress.progressTotal / progress.total) * 100)));
};

/// tag 里可能有 `/` 之类，不能直接当文件名。
export const apkFileName = (tag: string): string => {
  const safe = tag.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `update-${safe || "package"}.apk`;
};

export const isCompleteDownload = (progress: DownloadProgress | null): boolean =>
  !progress || !(progress.total > 0) || progress.progressTotal === progress.total;

export const isMissingApkError = (message: string): boolean =>
  /not found|不是一个|不存在|no such file|APK not found/i.test(message);

export type InstallApkRequest = {
  apkUrl: string;
  tag: string;
  cachedPath?: string | null;
  onProgress?: (percent: number | null) => void;
  onPhase?: (phase: InstallPhase) => void;
  onDownloaded?: (path: string) => void;
  isCancelled?: () => boolean;
};

const cancelled = (isCancelled?: () => boolean): boolean => !!isCancelled?.();

/// 下载到缓存（可跳过已下好的文件），确认「安装未知应用」权限，再唤起系统安装器。
export const installApkInApp = async (
  request: InstallApkRequest,
  deps: ApkInstallDeps
): Promise<InAppInstallResult> => {
  const { apkUrl, tag, onProgress, onPhase, onDownloaded, isCancelled } = request;
  let path = request.cachedPath?.trim() || "";
  if (cancelled(isCancelled)) return { status: "cancelled" };

  if (!path) {
    onPhase?.("downloading");
    try {
      path = await deps.join(await deps.appCacheDir(), apkFileName(tag));
    } catch (e) {
      if (cancelled(isCancelled)) return { status: "cancelled" };
      return { status: "download-failed", message: describeError(e) };
    }

    let lastProgress: DownloadProgress | null = null;
    try {
      await deps.download(apkUrl, path, (progress) => {
        lastProgress = progress;
        onProgress?.(downloadPercent(progress));
      });
    } catch (e) {
      if (cancelled(isCancelled)) return { status: "cancelled" };
      return { status: "download-failed", message: describeError(e) };
    }
    if (!isCompleteDownload(lastProgress)) {
      return { status: "download-failed", message: INCOMPLETE_DOWNLOAD_MESSAGE };
    }
    onDownloaded?.(path);
    if (cancelled(isCancelled)) return { status: "cancelled" };
  }

  if (cancelled(isCancelled)) return { status: "cancelled" };

  onPhase?.("waiting-permission");
  try {
    if (!(await deps.canInstall())) {
      await deps.requestInstallPermission();
      if (cancelled(isCancelled)) return { status: "cancelled" };
      if (!(await deps.canInstall())) return { status: "permission-denied", path };
    }
  } catch (e) {
    if (cancelled(isCancelled)) return { status: "cancelled" };
    return { status: "install-failed", message: describeError(e), path };
  }

  if (cancelled(isCancelled)) return { status: "cancelled" };

  onPhase?.("launching-installer");
  try {
    await deps.install(path);
    return { status: "launched" };
  } catch (e) {
    if (cancelled(isCancelled)) return { status: "cancelled" };
    return { status: "install-failed", message: describeError(e), path };
  }
};

/// 下载失败才连着重试；权限和唤起安装器失败交给调用方决定要不要开浏览器。
export const installApkInAppWithRetries = async (
  request: InstallApkRequest,
  deps: ApkInstallDeps,
  downloadAttempts: number = DOWNLOAD_RETRY_LIMIT
): Promise<InAppInstallResult> => {
  const attempts = Math.max(1, downloadAttempts);
  let last: InAppInstallResult | null = null;
  for (let i = 0; i < attempts; i++) {
    const cachedPath = i === 0 ? request.cachedPath : undefined;
    last = await installApkInApp({ ...request, cachedPath }, deps);
    if (last.status !== "download-failed") return last;
  }
  return last!;
};

export type InstallFollowUp =
  | { action: "none" }
  | { action: "stay"; message: string; button: "continue" | "retry" }
  | { action: "browser"; message: string };

/// 调用方只在下载重试用尽之后再问。下载失败 -> 浏览器；权限拒绝 / 第一次安装失败 -> 留在弹窗。
export const decideInstallFollowUp = (
  outcome: InAppInstallResult,
  consecutiveInstallFails: number
): InstallFollowUp => {
  switch (outcome.status) {
    case "launched":
    case "cancelled":
      return { action: "none" };
    case "permission-denied":
      return { action: "stay", message: PERMISSION_DENIED_HINT, button: "continue" };
    case "download-failed":
      return { action: "browser", message: downloadFailedBrowserHint(outcome.message) };
    case "install-failed":
      if (consecutiveInstallFails >= INSTALL_FAIL_BEFORE_BROWSER) {
        return { action: "browser", message: installFailedBrowserHint(outcome.message) };
      }
      return { action: "stay", message: installFailedStayHint(outcome.message), button: "retry" };
  }
};
