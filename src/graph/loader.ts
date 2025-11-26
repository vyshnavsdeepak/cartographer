import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { EntitySchema, type Entity } from "#types";

/**
 * Load and validate an entity from a YAML file
 */
export async function loadEntity(filePath: string): Promise<Entity> {
  const content = await readFile(filePath, "utf-8");
  const data: unknown = parse(content);
  return EntitySchema.parse(data);
}
