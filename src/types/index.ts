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

// Code reference - points to an anchor
export const CodeRefSchema = z.object({
  anchor: z.string(),
  description: z.string().optional(),
});

// Relation types
export const RelationTypeSchema = z.enum([
  "belongs_to",
  "has_one",
  "has_many",
  "many_to_many",
]);

// A relation to another entity
export const RelationSchema = z.object({
  name: z.string(),
  entity: z.string(),
  type: RelationTypeSchema,
  foreign_key: z.string().optional(),
  through: z.string().optional(), // For many_to_many
  description: z.string().optional(),
});

// @graph:Entity.types
// An entity definition
export const EntitySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  fields: z.array(FieldSchema),
  relations: z.array(RelationSchema).optional(),
  code_refs: z
    .object({
      model: CodeRefSchema.optional(),
      schema: CodeRefSchema.optional(),
      types: CodeRefSchema.optional(),
      validation: CodeRefSchema.optional(),
      api: z.array(CodeRefSchema).optional(),
    })
    .optional(),
});

// Infer TypeScript types from schemas
export type FieldType = z.infer<typeof FieldTypeSchema>;
export type Field = z.infer<typeof FieldSchema>;
export type CodeRef = z.infer<typeof CodeRefSchema>;
export type RelationType = z.infer<typeof RelationTypeSchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type Entity = z.infer<typeof EntitySchema>;
// @end:Entity.types

// Anchor types - for code references

/** A resolved anchor found in source code */
export interface ResolvedAnchor {
  /** The anchor identifier, e.g., "@graph:User.model" */
  anchor: string;
  /** Absolute path to the file */
  file: string;
  /** Line number where anchor comment appears (1-indexed) */
  line: number;
  /** Line number where the anchored block ends */
  endLine: number;
  /** The code content following the anchor */
  content: string;
}
