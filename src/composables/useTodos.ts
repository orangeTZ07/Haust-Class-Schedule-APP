import { computed, readonly, ref } from "vue";
import * as todoService from "@/services/todoService";
import type { Todo, TodoCreateInput, TodoMoveInput } from "@/types/todo";

const todos = ref<Todo[]>([]);
const pendingTodos = ref<Todo[]>([]);
const completedTodos = ref<Todo[]>([]);
const loading = ref(false);
const error = ref<Error | null>(null);
let loadPromise: Promise<Todo[]> | null = null;
let mutationPromise: Promise<void> = Promise.resolve();

function applyTodos(nextTodos: Todo[]) {
  todos.value = nextTodos;
  pendingTodos.value = todoService.sortTodosByQueue(nextTodos, "pending");
  completedTodos.value = todoService.sortTodosByQueue(nextTodos, "completed");
}

function enqueueMutation<T>(mutation: () => Promise<Todo[]>): Promise<T> {
  const run = mutationPromise
    .catch(() => undefined)
    .then(async () => {
      error.value = null;
      const nextTodos = await mutation();
      applyTodos(nextTodos);
      return nextTodos as T;
    })
    .catch(e => {
      error.value = e instanceof Error ? e : new Error(String(e));
      throw e;
    });

  mutationPromise = run.then(() => undefined, () => undefined);
  return run;
}

export function useTodos() {
  const pendingCount = computed(() => pendingTodos.value.length);
  const completedCount = computed(() => completedTodos.value.length);

  const load = async (): Promise<Todo[]> => {
    if (loadPromise) return loadPromise;

    loading.value = true;
    error.value = null;
    loadPromise = todoService.loadTodos()
      .then(loadedTodos => {
        applyTodos(loadedTodos);
        return loadedTodos;
      })
      .catch(e => {
        error.value = e instanceof Error ? e : new Error(String(e));
        throw e;
      })
      .finally(() => {
        loading.value = false;
        loadPromise = null;
      });

    return loadPromise;
  };

  const add = async (input: TodoCreateInput | string, dueAt?: string | null): Promise<Todo[]> => {
    const todoInput = typeof input === "string" ? { title: input, dueAt } : input;
    return enqueueMutation(() => todoService.addTodo(todoInput));
  };

  const move = async (input: TodoMoveInput): Promise<Todo[]> => {
    return enqueueMutation(() => todoService.moveTodo(input));
  };

  const complete = async (id: number): Promise<Todo[]> => {
    return move({ id, targetList: "completed" });
  };

  const reopen = async (id: number): Promise<Todo[]> => {
    return move({ id, targetList: "pending" });
  };

  const deleteMany = async (ids: number[]): Promise<Todo[]> => {
    return enqueueMutation(() => todoService.deleteTodos(ids));
  };

  return {
    todos: readonly(todos),
    pendingTodos: readonly(pendingTodos),
    completedTodos: readonly(completedTodos),
    pendingCount,
    completedCount,
    loading: readonly(loading),
    error: readonly(error),
    load,
    add,
    move,
    complete,
    reopen,
    deleteMany
  };
}
