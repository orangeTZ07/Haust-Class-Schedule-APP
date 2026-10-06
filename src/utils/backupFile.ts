// 校验"从文件导入"读到的内容到底是不是一份课表备份。
//
// 为什么要单独抽出来：这段逻辑有分支（不是 JSON / 结构不对 / 关键字段缺失），
// 而它决定了**用户会不会把一份错误的数据导进课表**。塞在组件里就没法测，而这是唯一
// 我能在本地完整验证的一段 —— 读文件、给课表写入的其余环节只有真机能验证。
//
// 校验刻意严格：宁可拒绝并说清楚，也不要把半份数据写进去 —— 课表被写坏以后，
// 用户不会知道是哪一步错的。

export interface BackupShape {
  courses: unknown[];
  schedules: unknown[];
  currentWeek?: unknown;
  exportedAt?: unknown;
}

export interface BackupFileResult {
  ok: boolean;
  /// 通过校验时的原始文本（交给 importFromJsonBackup，它读的是字符串）
  text?: string;
  courses?: number;
  schedules?: number;
  /// 失败时给用户看的一句话，必须说清是哪一类问题
  error?: string;
}

/// 从纯文本里判断这是不是一份备份。只做 shape 判断，不解析业务字段。
export const parseBackupFile = (raw: string): BackupFileResult => {
  const text = (raw ?? "").trim();

  if (!text) {
    return { ok: false, error: "文件是空的。" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: `文件不是合法的 JSON：${error instanceof Error ? error.message : String(error)}`
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "文件内容不是备份格式（顶层应该是一个对象，不是数组或其它类型）。" };
  }

  const shape = parsed as Partial<BackupShape>;

  if (!Array.isArray(shape.courses)) {
    return { ok: false, error: "文件里没有 courses 列表，不像是课表备份。" };
  }
  if (!Array.isArray(shape.schedules)) {
    return { ok: false, error: "文件里没有 schedules 列表，不像是课表备份。" };
  }
  if (shape.schedules.length > 0 && shape.courses.length === 0) {
    return { ok: false, error: "文件里有日程但没有任何课程，数据结构不完整。" };
  }

  return {
    ok: true,
    text,
    courses: shape.courses.length,
    schedules: shape.schedules.length
  };
};
