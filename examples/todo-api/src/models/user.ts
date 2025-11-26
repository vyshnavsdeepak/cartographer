// @graph:User.model
/**
 * User model - represents an application user account
 *
 * This model is defined in .graph/entities/user.yaml
 * Fields and relations must match the graph specification.
 */

export interface User {
  id: string; // uuid, primary key
  email: string; // unique
  name: string;
  created_at: Date;
}

// Prisma-style model definition
export const UserModel = {
  name: "User",
  fields: {
    id: { type: "uuid", primaryKey: true, default: "uuid()" },
    email: { type: "string", unique: true },
    name: { type: "string" },
    created_at: { type: "timestamp", default: "now()" },
  },
  relations: {
    todos: { type: "hasMany", model: "Todo", foreignKey: "user_id" },
    categories: { type: "hasMany", model: "Category", foreignKey: "user_id" },
  },
} as const;
// @end:User.model
