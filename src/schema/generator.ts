import { z } from "zod/v4";
import { writeFile } from "node:fs/promises";
import { EntitySchema } from "#types";

/**
 * Field descriptions for JSON Schema hover documentation
 */
const descriptions: Record<string, string> = {
  // Entity level
  name: "Entity name in PascalCase (e.g., User, BlogPost)",
  description: "Human-readable description of the entity",
  fields: "List of fields that make up this entity",
  relations: "Relationships to other entities",
  code_refs: "References to code implementations",
  constraints: "Architectural rules to enforce",

  // Field level
  "fields.items.properties.name": "Field name in camelCase (e.g., userId, createdAt)",
  "fields.items.properties.type":
    "Data type: uuid, string, text, integer, decimal, boolean, timestamp, date, json, enum",
  "fields.items.properties.description": "Human-readable description of the field",
  "fields.items.properties.primary": "Mark as primary key (only one per entity)",
  "fields.items.properties.unique": "Enforce unique constraint on this field",
  "fields.items.properties.nullable": "Allow NULL values (default: false)",
  "fields.items.properties.default": "Default value when not provided",
  "fields.items.properties.values": "Enum values (required when type is 'enum')",

  // Relation level
  "relations.items.properties.name": "Relation name for code access (e.g., posts, author)",
  "relations.items.properties.entity": "Target entity name (must exist in graph)",
  "relations.items.properties.type":
    "Relation type: belongs_to, has_one, has_many, many_to_many",
  "relations.items.properties.foreign_key": "Foreign key column name (optional)",
  "relations.items.properties.through": "Join table name for many_to_many relations",
  "relations.items.properties.description": "Human-readable description of the relation",

  // Code refs
  "code_refs.properties.model": "Reference to model/ORM implementation",
  "code_refs.properties.schema": "Reference to validation schema",
  "code_refs.properties.types": "Reference to TypeScript type definitions",
  "code_refs.properties.validation": "Reference to validation logic",
  "code_refs.properties.api": "References to API endpoints",
};

/**
 * Add descriptions to a JSON Schema object recursively
 */
function addDescriptions(schema: Record<string, unknown>, path = ""): void {
  if (typeof schema !== "object" || schema === null) return;

  // Add description if we have one for this path
  const desc = descriptions[path];
  if (desc && !schema.description) {
    schema.description = desc;
  }

  // Recurse into properties
  if (schema.properties && typeof schema.properties === "object") {
    for (const [key, value] of Object.entries(schema.properties)) {
      const newPath = path ? `${path}.properties.${key}` : key;
      addDescriptions(value as Record<string, unknown>, newPath);
    }
  }

  // Recurse into items (for arrays)
  if (schema.items && typeof schema.items === "object") {
    const newPath = path ? `${path}.items` : "items";
    addDescriptions(schema.items as Record<string, unknown>, newPath);
  }

  // Recurse into definitions
  if (schema.definitions && typeof schema.definitions === "object") {
    for (const [, value] of Object.entries(schema.definitions)) {
      addDescriptions(value as Record<string, unknown>, "");
    }
  }
}

/**
 * Generate JSON Schema from Zod EntitySchema
 */
export function generateEntitySchema(knownEntities?: string[]): Record<string, unknown> {
  // Convert Zod schema to JSON Schema using Zod v4 native support
  const schema = z.toJSONSchema(EntitySchema, {
    target: "draft-7", // Most widely supported by editors
  }) as Record<string, unknown>;

  // Add metadata
  schema.$schema = "http://json-schema.org/draft-07/schema#";
  schema.$id = "https://cartographer.dev/schema/entity.json";
  schema.title = "Cartographer Entity";

  // Add descriptions for hover documentation
  addDescriptions(schema);

  // If we have known entities, add them as enum for relation validation
  if (knownEntities && knownEntities.length > 0 && schema.properties) {
    const props = schema.properties as Record<string, unknown>;
    if (props.relations && typeof props.relations === "object") {
      const relations = props.relations as Record<string, unknown>;
      if (relations.items && typeof relations.items === "object") {
        const items = relations.items as Record<string, unknown>;
        if (items.properties && typeof items.properties === "object") {
          const relProps = items.properties as Record<string, unknown>;
          if (relProps.entity && typeof relProps.entity === "object") {
            (relProps.entity as Record<string, unknown>).enum = knownEntities;
          }
        }
      }
    }
  }

  return schema;
}

/**
 * Write JSON Schema to file
 */
export async function writeSchema(outputPath: string, knownEntities?: string[]): Promise<void> {
  const schema = generateEntitySchema(knownEntities);
  await writeFile(outputPath, JSON.stringify(schema, null, 2));
}
