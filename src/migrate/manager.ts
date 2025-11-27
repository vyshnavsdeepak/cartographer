import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Entity } from "#types";
import { diffEntities, type DiffResult } from "./differ.js";
import { generateMigration, formatMigrationFile, type SqlDialect, type MigrationOutput } from "./sql-generator.js";

/**
 * Record of an applied migration
 */
export interface MigrationRecord {
  /** Migration name/identifier */
  name: string;
  /** When the migration was applied */
  appliedAt: string;
  /** Hash of the migration content for verification */
  hash: string;
  /** Whether this was an up or down migration */
  direction: "up" | "down";
}

/**
 * Persistent state of migrations
 */
export interface MigrationState {
  /** Version of the state format */
  version: number;
  /** Snapshot of entities at last migration */
  lastSnapshot: Entity[];
  /** History of applied migrations */
  history: MigrationRecord[];
}

/**
 * Generated migration ready to be saved
 */
export interface GeneratedMigration {
  /** Migration name */
  name: string;
  /** Timestamp for ordering */
  timestamp: string;
  /** The diff that generated this migration */
  diff: DiffResult;
  /** The SQL output */
  output: MigrationOutput;
  /** Formatted SQL content */
  content: string;
}

/**
 * Manages migration state and generation
 */
export class MigrationManager {
  private stateFile: string;
  private migrationsDir: string;
  private dialect: SqlDialect;

  constructor(graphDir: string, dialect: SqlDialect = "postgresql") {
    this.stateFile = join(graphDir, "migrations.json");
    this.migrationsDir = join(graphDir, "migrations");
    this.dialect = dialect;
  }

  /**
   * Load migration state from disk
   */
  async loadState(): Promise<MigrationState> {
    if (!existsSync(this.stateFile)) {
      return {
        version: 1,
        lastSnapshot: [],
        history: [],
      };
    }

    try {
      const content = await readFile(this.stateFile, "utf-8");
      return JSON.parse(content) as MigrationState;
    } catch {
      return {
        version: 1,
        lastSnapshot: [],
        history: [],
      };
    }
  }

  /**
   * Save migration state to disk
   */
  async saveState(state: MigrationState): Promise<void> {
    const dir = dirname(this.stateFile);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(this.stateFile, JSON.stringify(state, null, 2));
  }

  /**
   * Generate a migration from current entities compared to last snapshot
   */
  async generateMigration(
    currentEntities: Entity[],
    name?: string
  ): Promise<GeneratedMigration | null> {
    const state = await this.loadState();
    const diff = diffEntities(state.lastSnapshot, currentEntities);

    if (diff.changes.length === 0) {
      return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const migrationName = name || `migration_${timestamp}`;
    const output = generateMigration(diff, currentEntities, this.dialect);
    const content = formatMigrationFile(output, migrationName);

    return {
      name: migrationName,
      timestamp,
      diff,
      output,
      content,
    };
  }

  /**
   * Save a generated migration to disk and update state
   */
  async saveMigration(
    migration: GeneratedMigration,
    currentEntities: Entity[]
  ): Promise<string> {
    // Ensure migrations directory exists
    if (!existsSync(this.migrationsDir)) {
      await mkdir(this.migrationsDir, { recursive: true });
    }

    // Save migration file
    const filename = `${migration.timestamp}_${migration.name}.sql`;
    const filepath = join(this.migrationsDir, filename);
    await writeFile(filepath, migration.content);

    // Update state with new snapshot
    const state = await this.loadState();
    state.lastSnapshot = currentEntities;
    await this.saveState(state);

    return filepath;
  }

  /**
   * Record that a migration was applied
   */
  async recordApplied(
    name: string,
    direction: "up" | "down",
    content: string
  ): Promise<void> {
    const state = await this.loadState();
    state.history.push({
      name,
      appliedAt: new Date().toISOString(),
      hash: simpleHash(content),
      direction,
    });
    await this.saveState(state);
  }

  /**
   * Get list of pending migrations (generated but not applied)
   */
  async getPendingMigrations(): Promise<string[]> {
    if (!existsSync(this.migrationsDir)) {
      return [];
    }

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(this.migrationsDir);
    const state = await this.loadState();

    const appliedNames = new Set(
      state.history.filter((h) => h.direction === "up").map((h) => h.name)
    );

    return files
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}_/, "").replace(".sql", ""))
      .filter((name) => !appliedNames.has(name))
      .sort();
  }

  /**
   * Get migration status summary
   */
  async getStatus(): Promise<{
    hasSnapshot: boolean;
    lastSnapshotEntities: number;
    appliedCount: number;
    pendingCount: number;
    lastApplied: MigrationRecord | null;
  }> {
    const state = await this.loadState();
    const pending = await this.getPendingMigrations();
    const lastApplied = state.history.length > 0 ? state.history[state.history.length - 1] : null;

    return {
      hasSnapshot: state.lastSnapshot.length > 0,
      lastSnapshotEntities: state.lastSnapshot.length,
      appliedCount: state.history.filter((h) => h.direction === "up").length,
      pendingCount: pending.length,
      lastApplied: lastApplied ?? null,
    };
  }

  /**
   * Initialize migration state with current entities (baseline)
   */
  async baseline(entities: Entity[]): Promise<void> {
    const state = await this.loadState();
    state.lastSnapshot = entities;
    state.history.push({
      name: "baseline",
      appliedAt: new Date().toISOString(),
      hash: simpleHash(JSON.stringify(entities)),
      direction: "up",
    });
    await this.saveState(state);
  }

  /**
   * Get the SQL dialect
   */
  getDialect(): SqlDialect {
    return this.dialect;
  }

  /**
   * Set the SQL dialect
   */
  setDialect(dialect: SqlDialect): void {
    this.dialect = dialect;
  }
}

/**
 * Simple string hash for content verification
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
