import { getDb } from "@/services/courseService";
import type { Todo, TodoCreateInput, TodoListType, TodoMoveInput } from "@/types/todo";

const WEB_STORAGE_KEY = "web-fallback-todos";

type TodoDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

interface TodoRow {
  id: number;
  title: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  list_type?: TodoListType | null;
  prev_id?: number | null;
  next_id?: number | null;
}

let initPromise: Promise<void> | null = null;

async function ensureTodoTable(db: TodoDb): Promise<void> {
  initPromise ??= (async () => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        due_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        list_type TEXT,
        prev_id INTEGER,
        next_id INTEGER
      );
    `);

    const columns = await db.select<Array<{ name: string }>>("PRAGMA table_info(todos)");
    const names = new Set(columns.map(column => column.name));
    if (!names.has("list_type")) {
      await db.execute("ALTER TABLE todos ADD COLUMN list_type TEXT");
    }
    if (!names.has("prev_id")) {
      await db.execute("ALTER TABLE todos ADD COLUMN prev_id INTEGER");
    }
    if (!names.has("next_id")) {
      await db.execute("ALTER TABLE todos ADD COLUMN next_id INTEGER");
    }
    await db.execute("CREATE INDEX IF NOT EXISTS idx_todos_list_links ON todos (list_type, prev_id, next_id)");
  })();

  await initPromise;
}

function normalizeTodoInput(input: TodoCreateInput): Required<TodoCreateInput> {
  const title = input.title.trim();
  if (!title) {
    throw new Error("Todo title is required");
  }

  return {
    title,
    dueAt: input.dueAt?.trim() || null
  };
}

function mapTodoRow(row: TodoRow): Todo {
  const listType = row.list_type || (row.completed_at ? "completed" : "pending");
  return {
    id: row.id,
    title: row.title,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    listType,
    prevId: row.prev_id ?? null,
    nextId: row.next_id ?? null
  };
}

function pendingFallbackSort(a: Todo, b: Todo): number {
  if (!a.dueAt && !b.dueAt) return a.createdAt.localeCompare(b.createdAt);
  if (!a.dueAt) return 1;
  if (!b.dueAt) return -1;
  const dueCompare = a.dueAt.localeCompare(b.dueAt);
  return dueCompare !== 0 ? dueCompare : a.createdAt.localeCompare(b.createdAt);
}

function completedFallbackSort(a: Todo, b: Todo): number {
  const completedCompare = (b.completedAt || "").localeCompare(a.completedAt || "");
  return completedCompare !== 0 ? completedCompare : b.createdAt.localeCompare(a.createdAt);
}

function fallbackSortFor(listType: TodoListType) {
  return listType === "pending" ? pendingFallbackSort : completedFallbackSort;
}

export function sortTodosByQueue(todos: Todo[], listType: TodoListType): Todo[] {
  const items = todos.filter(todo => todo.listType === listType);
  const ids = new Set(items.map(todo => todo.id));
  const byId = new Map(items.map(todo => [todo.id, todo]));
  const visited = new Set<number>();
  const ordered: Todo[] = [];
  const fallbackSort = fallbackSortFor(listType);
  const heads = items
    .filter(todo => todo.prevId === null || !ids.has(todo.prevId))
    .sort(fallbackSort);

  const walk = (start: Todo) => {
    let current: Todo | undefined = start;
    while (current && !visited.has(current.id)) {
      ordered.push(current);
      visited.add(current.id);
      current = current.nextId === null ? undefined : byId.get(current.nextId);
    }
  };

  heads.forEach(walk);
  items
    .filter(todo => !visited.has(todo.id))
    .sort(fallbackSort)
    .forEach(walk);

  return ordered;
}

function relinkList(todos: Todo[], listType: TodoListType, orderedIds: number[]): Todo[] {
  const positions = new Map(orderedIds.map((id, index) => [id, index]));
  return todos.map(todo => {
    if (todo.listType !== listType) return todo;

    const index = positions.get(todo.id);
    if (index === undefined) {
      return { ...todo, prevId: null, nextId: null };
    }

    return {
      ...todo,
      prevId: index > 0 ? orderedIds[index - 1] : null,
      nextId: index < orderedIds.length - 1 ? orderedIds[index + 1] : null
    };
  });
}

function relinkBothLists(todos: Todo[]): Todo[] {
  let next = relinkList(todos, "pending", sortTodosByQueue(todos, "pending").map(todo => todo.id));
  next = relinkList(next, "completed", sortTodosByQueue(next, "completed").map(todo => todo.id));
  return next;
}

function insertId(ids: number[], id: number, beforeId?: number | null): number[] {
  const withoutId = ids.filter(current => current !== id);
  if (beforeId == null || beforeId === id) return [...withoutId, id];

  const index = withoutId.indexOf(beforeId);
  if (index === -1) return [...withoutId, id];

  const next = withoutId.slice();
  next.splice(index, 0, id);
  return next;
}

function insertPendingByDueAt(todos: Todo[], todo: Todo): Todo[] {
  const pending = sortTodosByQueue([...todos, todo], "pending").filter(current => current.id !== todo.id);
  const insertIndex = pending.findIndex(current => pendingFallbackSort(todo, current) < 0);
  const orderedIds = pending.map(current => current.id);
  if (insertIndex === -1) {
    orderedIds.push(todo.id);
  } else {
    orderedIds.splice(insertIndex, 0, todo.id);
  }

  return relinkList([...todos, todo], "pending", orderedIds);
}

function moveTodoInMemory(todos: Todo[], input: TodoMoveInput): Todo[] {
  const now = new Date().toISOString();
  const moving = todos.find(todo => todo.id === input.id);
  if (!moving) return todos;

  let next = todos.map(todo => {
    if (todo.id !== input.id) return todo;
    return {
      ...todo,
      listType: input.targetList,
      completedAt: input.targetList === "completed" ? (todo.completedAt || now) : null
    };
  });

  const pendingIds = sortTodosByQueue(next, "pending")
    .filter(todo => todo.id !== input.id || input.targetList === "pending")
    .map(todo => todo.id);
  const completedIds = sortTodosByQueue(next, "completed")
    .filter(todo => todo.id !== input.id || input.targetList === "completed")
    .map(todo => todo.id);

  const targetIds = input.targetList === "pending" ? pendingIds : completedIds;
  const nextTargetIds = insertId(targetIds, input.id, input.beforeId);
  next = relinkList(next, input.targetList, nextTargetIds);
  next = relinkList(
    next,
    input.targetList === "pending" ? "completed" : "pending",
    sortTodosByQueue(next, input.targetList === "pending" ? "completed" : "pending")
      .filter(todo => todo.id !== input.id)
      .map(todo => todo.id)
  );

  return next;
}

function normalizeTodos(todos: Todo[]): Todo[] {
  return relinkBothLists(todos.map(todo => ({
    ...todo,
    listType: todo.listType || (todo.completedAt ? "completed" : "pending"),
    completedAt: todo.listType === "pending" ? null : todo.completedAt,
    prevId: todo.prevId ?? null,
    nextId: todo.nextId ?? null
  })));
}

function readStoredTodos(): Todo[] {
  try {
    const data = localStorage.getItem(WEB_STORAGE_KEY);
    const rows: Todo[] = data ? JSON.parse(data) : [];
    const normalized = normalizeTodos(rows);
    writeStoredTodos(normalized);
    return normalized;
  } catch (e) {
    console.error("Failed to read todos from localStorage", e);
    return [];
  }
}

function writeStoredTodos(todos: Todo[]): void {
  localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(todos));
}

async function selectTodos(db: TodoDb): Promise<Todo[]> {
  const rows = await db.select<TodoRow[]>(
    "SELECT id, title, due_at, completed_at, created_at, list_type, prev_id, next_id FROM todos"
  );
  return rows.map(mapTodoRow);
}

async function persistTodos(db: TodoDb, todos: Todo[]): Promise<void> {
  for (const todo of todos) {
    await db.execute(
      "UPDATE todos SET list_type = $1, prev_id = $2, next_id = $3, completed_at = $4 WHERE id = $5",
      [todo.listType, todo.prevId, todo.nextId, todo.completedAt, todo.id]
    );
  }
}

export async function loadTodos(): Promise<Todo[]> {
  const db = await getDb();
  if (db) {
    await ensureTodoTable(db);
    const todos = normalizeTodos(await selectTodos(db));
    await persistTodos(db, todos);
    return todos;
  }

  return readStoredTodos();
}

export async function addTodo(input: TodoCreateInput): Promise<Todo[]> {
  const todoInput = normalizeTodoInput(input);
  const createdAt = new Date().toISOString();

  const db = await getDb();
  if (db) {
    await ensureTodoTable(db);
    const result = await db.execute(
      "INSERT INTO todos (title, due_at, completed_at, created_at, list_type, prev_id, next_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [todoInput.title, todoInput.dueAt, null, createdAt, "pending", null, null]
    );
    const id = result.lastInsertId ?? 0;
    const todos = await selectTodos(db);
    const next = insertPendingByDueAt(
      todos.filter(todo => todo.id !== id),
      {
        id,
        title: todoInput.title,
        dueAt: todoInput.dueAt,
        completedAt: null,
        createdAt,
        listType: "pending",
        prevId: null,
        nextId: null
      }
    );
    await persistTodos(db, next);
    return next;
  }

  const todos = readStoredTodos();
  const id = todos.length > 0 ? Math.max(...todos.map(todo => todo.id)) + 1 : 1;
  const next = insertPendingByDueAt(todos, {
    id,
    title: todoInput.title,
    dueAt: todoInput.dueAt,
    completedAt: null,
    createdAt,
    listType: "pending",
    prevId: null,
    nextId: null
  });
  writeStoredTodos(next);
  return next;
}

export async function moveTodo(input: TodoMoveInput): Promise<Todo[]> {
  const db = await getDb();
  if (db) {
    await ensureTodoTable(db);
    const next = moveTodoInMemory(await loadTodos(), input);
    await persistTodos(db, next);
    return next;
  }

  const next = moveTodoInMemory(readStoredTodos(), input);
  writeStoredTodos(next);
  return next;
}

export async function deleteTodos(ids: number[]): Promise<Todo[]> {
  if (ids.length === 0) return loadTodos();

  const idSet = new Set(ids);
  const db = await getDb();
  if (db) {
    await ensureTodoTable(db);
    for (const id of ids) {
      await db.execute("DELETE FROM todos WHERE id = $1", [id]);
    }
    const next = normalizeTodos((await selectTodos(db)).filter(todo => !idSet.has(todo.id)));
    await persistTodos(db, next);
    return next;
  }

  const next = normalizeTodos(readStoredTodos().filter(todo => !idSet.has(todo.id)));
  writeStoredTodos(next);
  return next;
}
