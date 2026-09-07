export type TodoListType = "pending" | "completed";

export interface Todo {
  id: number;
  title: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  listType: TodoListType;
  prevId: number | null;
  nextId: number | null;
}

export interface TodoCreateInput {
  title: string;
  dueAt?: string | null;
}

export interface TodoMoveInput {
  id: number;
  targetList: TodoListType;
  beforeId?: number | null;
}
