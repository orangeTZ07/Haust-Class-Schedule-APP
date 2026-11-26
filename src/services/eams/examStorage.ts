import type { ExamSnapshot } from "./examParser";

const storageKey = (tableId: number) => `course-mngr-exams:${tableId}`;

export const readExamSnapshot = (tableId: number): ExamSnapshot | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(tableId)) ?? "null") as ExamSnapshot | null;
    return Array.isArray(saved?.exams) ? saved : null;
  } catch {
    return null;
  }
};

export const saveExamSnapshot = (tableId: number, snapshot: ExamSnapshot) => {
  localStorage.setItem(storageKey(tableId), JSON.stringify(snapshot));
};

export const clearExamSnapshot = (tableId: number) => {
  localStorage.removeItem(storageKey(tableId));
};
