// 课程列表/编辑框要显示的教师。
//
// 教师现在有两层：课段自己的（`schedule.teacher`，教务导入时按行写入）和课程的（`course.teacher`，
// 一门课只有一个，导入时是"出现次数最多"投票出来的）。同一门课不同周次由不同老师上是常态，
// 所以一门课可能对应多个教师 —— 只显示投票出来那一位，就是用户说的"名字对不上"。
//
// 这里负责把课段上的教师去重后展示：一个就显示名字，多个显示「张某 等 3 位」。
// 课程级教师优先作为"代表了整门课的那一位"，它不在课段教师里时用第一个。
export const teacherLabel = (
  courseTeacher: string | undefined,
  slotTeachers: readonly (string | undefined)[]
): string => {
  const distinct: string[] = [];
  for (const value of slotTeachers) {
    const name = (value || "").trim();
    if (name && !distinct.includes(name)) distinct.push(name);
  }
  if (distinct.length === 0) return (courseTeacher || "").trim();
  if (distinct.length === 1) return distinct[0];
  const primary = (courseTeacher || "").trim();
  const head = primary && distinct.includes(primary) ? primary : distinct[0];
  return `${head} 等 ${distinct.length} 位`;
};
