// @graph:Todo.schema
/**
 * Todo validation schemas using Zod
 *
 * These schemas validate Todo data according to .graph/entities/todo.yaml
 */

import { z } from "zod";

// Priority enum from the graph spec
export const PrioritySchema = z.enum(["low", "medium", "high"]);

// Create todo input schema
export const CreateTodoSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().max(5000).nullable().optional(),
  due_date: z.coerce.date().nullable().optional(),
  priority: PrioritySchema.default("medium"),
  category_id: z.string().uuid().nullable().optional(),
});

// Update todo input schema
export const UpdateTodoSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  completed: z.boolean().optional(),
  due_date: z.coerce.date().nullable().optional(),
  priority: PrioritySchema.optional(),
  category_id: z.string().uuid().nullable().optional(),
});

// Full todo schema (for responses)
export const TodoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  completed: z.boolean(),
  due_date: z.coerce.date().nullable(),
  priority: PrioritySchema,
  user_id: z.string().uuid(),
  category_id: z.string().uuid().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

// Types inferred from schemas
export type Priority = z.infer<typeof PrioritySchema>;
export type CreateTodoInput = z.infer<typeof CreateTodoSchema>;
export type UpdateTodoInput = z.infer<typeof UpdateTodoSchema>;
export type TodoResponse = z.infer<typeof TodoSchema>;
// @end:Todo.schema
