// @graph:Todo.model
/**
 * Todo model - represents a todo item belonging to a user
 *
 * This model is defined in .graph/entities/todo.yaml
 * Fields and relations must match the graph specification.
 */

export type Priority = "low" | "medium" | "high";

export interface Todo {
  id: string; // uuid, primary key
  title: string;
  description: string | null;
  completed: boolean;
  due_date: Date | null;
  priority: Priority;
  user_id: string; // FK to User
  category_id: string | null; // FK to Category
  created_at: Date;
  updated_at: Date;
}

// Prisma-style model definition
export const TodoModel = {
  name: "Todo",
  fields: {
    id: { type: "uuid", primaryKey: true, default: "uuid()" },
    title: { type: "string" },
    description: { type: "text", nullable: true },
    completed: { type: "boolean", default: false },
    due_date: { type: "date", nullable: true },
    priority: { type: "enum", values: ["low", "medium", "high"], default: "medium" },
    user_id: { type: "uuid" },
    category_id: { type: "uuid", nullable: true },
    created_at: { type: "timestamp", default: "now()" },
    updated_at: { type: "timestamp", default: "now()", onUpdate: "now()" },
  },
  relations: {
    user: { type: "belongsTo", model: "User", foreignKey: "user_id" },
    category: { type: "belongsTo", model: "Category", foreignKey: "category_id" },
  },
} as const;
// @end:Todo.model
