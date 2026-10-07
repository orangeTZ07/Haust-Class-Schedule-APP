import { invoke } from "@tauri-apps/api/core";

const PREFIX = "plugin:android-installer";

export const canInstall = (): Promise<boolean> => invoke<boolean>(`${PREFIX}|can_install`);

export const requestInstallPermission = (): Promise<void> =>
  invoke(`${PREFIX}|request_install_permission`);

export const installApk = (path: string): Promise<void> =>
  invoke(`${PREFIX}|install`, { path });
