// @graph:User.api
/**
 * User API endpoints
 *
 * REST endpoints for User entity as defined in .graph/entities/user.yaml
 */

import type { User } from "../models/user";
import { CreateUserSchema, UpdateUserSchema } from "../schemas/user";

// Mock database for demonstration
const users: Map<string, User> = new Map();

/**
 * GET /users - List all users
 */
export async function listUsers(): Promise<User[]> {
  return Array.from(users.values());
}

/**
 * GET /users/:id - Get a user by ID
 */
export async function getUser(id: string): Promise<User | null> {
  return users.get(id) ?? null;
}

/**
 * POST /users - Create a new user
 */
export async function createUser(input: unknown): Promise<User> {
  const validated = CreateUserSchema.parse(input);

  const user: User = {
    id: crypto.randomUUID(),
    email: validated.email,
    name: validated.name,
    created_at: new Date(),
  };

  users.set(user.id, user);
  return user;
}

/**
 * PATCH /users/:id - Update a user
 */
export async function updateUser(id: string, input: unknown): Promise<User | null> {
  const existing = users.get(id);
  if (!existing) return null;

  const validated = UpdateUserSchema.parse(input);

  const updated: User = {
    ...existing,
    ...(validated.email && { email: validated.email }),
    ...(validated.name && { name: validated.name }),
  };

  users.set(id, updated);
  return updated;
}

/**
 * DELETE /users/:id - Delete a user
 */
export async function deleteUser(id: string): Promise<boolean> {
  return users.delete(id);
}
// @end:User.api
