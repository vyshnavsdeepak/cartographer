// @graph:User.schema
/**
 * User validation schemas using Zod
 *
 * These schemas validate User data according to .graph/entities/user.yaml
 */

import { z } from "zod";

// Create user input schema
export const CreateUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required").max(255),
});

// Update user input schema
export const UpdateUserSchema = z.object({
  email: z.string().email("Invalid email address").optional(),
  name: z.string().min(1).max(255).optional(),
});

// Full user schema (for responses)
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  created_at: z.coerce.date(),
});

// Types inferred from schemas
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type UserResponse = z.infer<typeof UserSchema>;
// @end:User.schema
