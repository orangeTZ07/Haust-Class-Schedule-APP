// 「我i科大」登录信息只存在这台设备的 localStorage 里：学号每次登录成功都记，密码只在用户勾了
// 「记住密码」时才记。storage 参数只为测试注入内存假实现，应用里一律用默认的 localStorage。

const STORAGE_KEY = "course-mngr-eams-credentials";

export interface SavedCredentials {
  username: string;
  password?: string;
  rememberPassword: boolean;
}

export const readCredentials = (storage: Storage = localStorage): SavedCredentials | null => {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null") as SavedCredentials | null;
    return typeof saved?.username === "string" ? saved : null;
  } catch {
    return null;
  }
};

/// 登录成功后调用。不记密码时连同旧密码一起丢掉，存下的只有学号。
export const saveCredentials = (
  username: string,
  password: string,
  rememberPassword: boolean,
  storage: Storage = localStorage
) => {
  const saved: SavedCredentials = rememberPassword ? { username, password, rememberPassword } : { username, rememberPassword };
  storage.setItem(STORAGE_KEY, JSON.stringify(saved));
};

/// 取消「记住密码」或登录失败时调用：密码删掉，学号留着。读不出来的旧记录整条删掉，免得里面还有密码。
export const clearSavedPassword = (storage: Storage = localStorage) => {
  const saved = readCredentials(storage);
  if (!saved) {
    storage.removeItem(STORAGE_KEY);
    return;
  }
  storage.setItem(STORAGE_KEY, JSON.stringify({ username: saved.username, rememberPassword: false }));
};
