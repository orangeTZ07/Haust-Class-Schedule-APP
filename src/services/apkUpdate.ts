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
};

export type InAppInstallResult =
  | { status: "launched" }
  | { status: "permission-denied" }
  | { status: "error"; message: string };

export const downloadPercent = (progress: DownloadProgress): number | null => {
  if (!(progress.total > 0)) return null;
  return Math.max(0, Math.min(100, Math.round((progress.progressTotal / progress.total) * 100)));
};

/// 下载到缓存，确认「安装未知应用」权限，再唤起系统安装器。
export const installApkInApp = async (
  apkUrl: string,
  deps: ApkInstallDeps,
  onProgress?: (percent: number | null) => void,
  isCancelled?: () => boolean
): Promise<InAppInstallResult> => {
  try {
    const path = await deps.join(await deps.appCacheDir(), "update.apk");
    await deps.download(apkUrl, path, (progress) => {
      onProgress?.(downloadPercent(progress));
    });
    if (isCancelled?.()) return { status: "error", message: "已取消" };

    if (!(await deps.canInstall())) {
      await deps.requestInstallPermission();
      if (!(await deps.canInstall())) return { status: "permission-denied" };
    }
    if (isCancelled?.()) return { status: "error", message: "已取消" };

    await deps.install(path);
    return { status: "launched" };
  } catch (e) {
    return { status: "error", message: describeError(e) };
  }
};
