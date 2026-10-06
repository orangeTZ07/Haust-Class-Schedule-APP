import { useCourses } from "@/composables/useCourses";
import { confirmAction } from "@/utils/confirm";

/// Asks before an import swaps out the whole timetable. 选文件, 粘贴备份 and 教务同步 all end in the
/// same destructive write, so they share this question instead of each deciding whether to ask:
/// only the paste route used to, which is how a file or a sync could silently wipe a timetable.
///
/// An empty timetable has nothing to lose, so it goes straight through.
export function useConfirmReplace() {
  const { courses } = useCourses();

  /// `action` finishes the sentence "…会清空当前课表", e.g. "导入这个文件".
  return async (action: string): Promise<boolean> => {
    const count = courses.value.length;
    if (count === 0) return true;

    return confirmAction({
      title: "整体替换当前课表？",
      message: `${action}会清空当前课表里的 ${count} 门课程，再写入新的内容，此操作无法撤销。`,
      confirmText: "替换",
      danger: true,
    });
  };
}
