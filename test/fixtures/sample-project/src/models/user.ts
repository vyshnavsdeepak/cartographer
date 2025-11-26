// @graph:User.model
export class User {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
}
// @end:User.model

// @graph:User.types
export type UserStatus = "active" | "inactive" | "suspended";

export interface CreateUserInput {
  email: string;
  name: string;
}
// @end:User.types

// @graph:User.validation
export function validateEmail(email: string): boolean {
  return email.includes("@");
}
