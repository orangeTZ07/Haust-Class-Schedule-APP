import { useCourses } from "@/composables/useCourses";
import { confirmAction } from "@/utils/confirm";

/// Asks before an import overwrites the current timetable. Importing into a new table (the default)
/// destroys nothing and never asks; only the "覆盖当前课表" option comes through here, shared by the
/// 教务同步 and 选文件 tabs so they ask the same question.
///
/// An empty timetable has nothing to lose, so it goes straight through.
export function useConfirmReplace() {
  const { courses } = useCourses();

  /// `action` finishes the sentence "…会清空当前课表", e.g. "导入这个文件".
  return async (action: string): Promise<boolean> => {
    const count = courses.value.length;
    if (count === 0) return true;

    return confirmAction({
      title: "覆盖当前课表？",
      message: `${action}会清空当前课表里的 ${count} 门课程，再写入新的内容，此操作无法撤销。`,
      confirmText: "覆盖",
      danger: true,
    });
  };
}
