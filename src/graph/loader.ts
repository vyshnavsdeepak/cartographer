import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { EntitySchema, type Entity } from "#types";

/**
 * Parse and validate an entity from a YAML string
 */
export function parseEntity(yamlContent: string): Entity {
  const data: unknown = parse(yamlContent);
  return EntitySchema.parse(data);
}

/**
 * Load and validate an entity from a YAML file
 */
export async function loadEntity(filePath: string): Promise<Entity> {
  const content = await readFile(filePath, "utf-8");
  return parseEntity(content);
}
