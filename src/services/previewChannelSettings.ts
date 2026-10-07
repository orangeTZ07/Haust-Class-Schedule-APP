/// 预览版抢先体验开关的读写。更新比较逻辑在 updateService / useUpdateCheck，由 Grok 接入本开关。
const STORAGE_KEY = "course-mngr-preview-channel-enabled";

const readStorage = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeStorage = (value: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // 记不下来就只影响当次会话，不打扰用户。
  }
};

/** 是否开启预览版抢先体验。默认关。 */
export function previewChannelEnabled(): boolean {
  return readStorage() === "1";
}

export function setPreviewChannelEnabled(enabled: boolean): void {
  writeStorage(enabled ? "1" : "0");
}
