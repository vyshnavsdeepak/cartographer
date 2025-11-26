// @graph:Todo.api
/**
 * Todo API endpoints
 *
 * REST endpoints for Todo entity as defined in .graph/entities/todo.yaml
 */

import type { Todo } from "../models/todo";
import { CreateTodoSchema, UpdateTodoSchema } from "../schemas/todo";

// Mock database for demonstration
const todos: Map<string, Todo> = new Map();

/**
 * GET /todos - List all todos for a user
 */
export async function listTodos(userId: string): Promise<Todo[]> {
  return Array.from(todos.values()).filter((t) => t.user_id === userId);
}

/**
 * GET /todos/:id - Get a todo by ID
 */
export async function getTodo(id: string): Promise<Todo | null> {
  return todos.get(id) ?? null;
}

/**
 * POST /todos - Create a new todo
 */
export async function createTodo(userId: string, input: unknown): Promise<Todo> {
  const validated = CreateTodoSchema.parse(input);
  const now = new Date();

  const todo: Todo = {
    id: crypto.randomUUID(),
    title: validated.title,
    description: validated.description ?? null,
    completed: false,
    due_date: validated.due_date ?? null,
    priority: validated.priority,
    user_id: userId,
    category_id: validated.category_id ?? null,
    created_at: now,
    updated_at: now,
  };

  todos.set(todo.id, todo);
  return todo;
}

/**
 * PATCH /todos/:id - Update a todo
 */
export async function updateTodo(id: string, input: unknown): Promise<Todo | null> {
  const existing = todos.get(id);
  if (!existing) return null;

  const validated = UpdateTodoSchema.parse(input);

  const updated: Todo = {
    ...existing,
    ...(validated.title !== undefined && { title: validated.title }),
    ...(validated.description !== undefined && { description: validated.description }),
    ...(validated.completed !== undefined && { completed: validated.completed }),
    ...(validated.due_date !== undefined && { due_date: validated.due_date }),
    ...(validated.priority !== undefined && { priority: validated.priority }),
    ...(validated.category_id !== undefined && { category_id: validated.category_id }),
    updated_at: new Date(),
  };

  todos.set(id, updated);
  return updated;
}

/**
 * DELETE /todos/:id - Delete a todo
 */
export async function deleteTodo(id: string): Promise<boolean> {
  return todos.delete(id);
}

/**
 * PATCH /todos/:id/complete - Mark todo as completed
 */
export async function completeTodo(id: string): Promise<Todo | null> {
  return updateTodo(id, { completed: true });
}
// @end:Todo.api
