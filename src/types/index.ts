import { z } from "zod/v4";

// Field types supported in the graph
export const FieldTypeSchema = z.enum([
  "uuid",
  "string",
  "text",
  "integer",
  "decimal",
  "boolean",
  "timestamp",
  "date",
  "json",
  "enum",
]);

// A single field in an entity
export const FieldSchema = z.object({
  name: z.string(),
  type: FieldTypeSchema,
  description: z.string().optional(),
  primary: z.boolean().optional(),
  unique: z.boolean().optional(),
  nullable: z.boolean().optional(),
  default: z.unknown().optional(),
  // For enum type
  values: z.array(z.string()).optional(),
});

// An entity definition
export const EntitySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  fields: z.array(FieldSchema),
});

// Infer TypeScript types from schemas
export type FieldType = z.infer<typeof FieldTypeSchema>;
export type Field = z.infer<typeof FieldSchema>;
export type Entity = z.infer<typeof EntitySchema>;
