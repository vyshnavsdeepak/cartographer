import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Entity } from "#types";
import { loadEntity } from "./loader.js";

/** Error that occurred while loading an entity file */
export interface LoadError {
  file: string;
  error: Error;
}

/**
 * Graph holds all entity definitions from a graph directory
 */
export class Graph {
  private entities: Map<string, Entity> = new Map();
  private graphDir: string;
  private loadErrors: LoadError[] = [];

  constructor(graphDir: string) {
    this.graphDir = graphDir;
  }

  /**
   * Load all entity YAML files from the graph directory.
   * Invalid files are skipped and errors collected.
   */
  async load(): Promise<void> {
    const entitiesDir = join(this.graphDir, "entities");
    const files = await readdir(entitiesDir);
    this.loadErrors = [];

    for (const file of files) {
      if (file.endsWith(".yaml") || file.endsWith(".yml")) {
        const filePath = join(entitiesDir, file);
        try {
          const entity = await loadEntity(filePath);
          this.entities.set(entity.name, entity);
        } catch (err) {
          this.loadErrors.push({
            file: filePath,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    }
  }

  /**
   * Get errors that occurred during loading
   */
  getLoadErrors(): LoadError[] {
    return this.loadErrors;
  }

  /**
   * Get an entity by name
   */
  getEntity(name: string): Entity | undefined {
    return this.entities.get(name);
  }

  /**
   * List all entity names
   */
  listEntities(): string[] {
    return Array.from(this.entities.keys());
  }

  /**
   * Get all entities
   */
  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Check if an entity exists
   */
  hasEntity(name: string): boolean {
    return this.entities.has(name);
  }
}
