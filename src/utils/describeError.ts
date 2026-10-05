/// 把一个被 reject 的值转成能给用户看的文字。
///
/// 为什么需要它：**Tauri 的 `invoke` 是以「命令返回的错误值本身」拒绝 Promise 的** ——
/// 对于 `Result<(), String>`，那是一个**字符串**，不是 Error。
///
/// 而 `${(e as Error).message}` 这种写法在字符串上取 `.message` 会得到 `undefined`，
/// 于是设置页把一次真实的失败显示成了字面的 "undefined"。那既没有告诉用户发生了什么，
/// 也让我无法据此判断该修哪里 —— 白白多花一轮。
///
/// 所以这里按可能性依次尝试，并且**保留原文**：一个看不懂的错误也比 "undefined" 有用。
export const describeError = (error: unknown): string => {
  if (typeof error === "string") {
    return error.trim() || "(空字符串错误)";
  }

  if (error instanceof Error) {
    return error.message || error.name || "(Error 无 message)";
  }

  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}" && json !== "null") return json;
    } catch {
      // 循环引用等，落到下面的 String()
    }
  }

  // undefined / null / 数字 等：仍然给出可辨认的文字，而不是空白
  return String(error);
};
