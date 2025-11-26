// @graph:Category.model
/**
 * Category model - represents a category for organizing todos
 *
 * This model is defined in .graph/entities/category.yaml
 * Fields and relations must match the graph specification.
 */

export interface Category {
  id: string; // uuid, primary key
  name: string;
  color: string; // hex color code
  user_id: string; // FK to User
  created_at: Date;
}

// Prisma-style model definition
export const CategoryModel = {
  name: "Category",
  fields: {
    id: { type: "uuid", primaryKey: true, default: "uuid()" },
    name: { type: "string" },
    color: { type: "string", default: "#808080" },
    user_id: { type: "uuid" },
    created_at: { type: "timestamp", default: "now()" },
  },
  relations: {
    user: { type: "belongsTo", model: "User", foreignKey: "user_id" },
    todos: { type: "hasMany", model: "Todo", foreignKey: "category_id" },
  },
} as const;
// @end:Category.model
