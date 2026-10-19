import { invoke } from "@tauri-apps/api/core";

const PREFIX = "plugin:android-installer";

export const canInstall = (): Promise<boolean> => invoke<boolean>(`${PREFIX}|can_install`);

export const requestInstallPermission = (): Promise<void> =>
  invoke(`${PREFIX}|request_install_permission`);

export const installApk = (path: string): Promise<void> =>
  invoke(`${PREFIX}|install`, { path });

/// Launch an installed app by its Android package name. Resolves `false` (never rejects) when the
/// app is not installed, and always `false` off Android, so callers can fall back without a
/// try/catch.
export const launchApp = (packageName: string): Promise<boolean> =>
  invoke<boolean>(`${PREFIX}|launch_app`, { packageName });
