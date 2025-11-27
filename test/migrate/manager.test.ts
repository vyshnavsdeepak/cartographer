import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { MigrationManager } from "../../src/migrate/manager.js";
import type { Entity } from "../../src/types/index.js";

describe("MigrationManager", () => {
  const testDir = join(process.cwd(), "test-migrations-temp");

  beforeEach(async () => {
    // Clean up before each test
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true });
    }
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up after each test
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true });
    }
  });

  describe("loadState", () => {
    it("returns empty state when no file exists", async () => {
      const manager = new MigrationManager(testDir);
      const state = await manager.loadState();

      expect(state.version).toBe(1);
      expect(state.lastSnapshot).toEqual([]);
      expect(state.history).toEqual([]);
    });

    it("loads existing state from file", async () => {
      const stateFile = join(testDir, "migrations.json");
      await writeFile(
        stateFile,
        JSON.stringify({
          version: 1,
          lastSnapshot: [{ name: "User", fields: [] }],
          history: [{ name: "test", appliedAt: "2024-01-01", hash: "abc", direction: "up" }],
        })
      );

      const manager = new MigrationManager(testDir);
      const state = await manager.loadState();

      expect(state.lastSnapshot.length).toBe(1);
      expect(state.history.length).toBe(1);
    });
  });

  describe("baseline", () => {
    it("saves current entities as baseline", async () => {
      const manager = new MigrationManager(testDir);
      const entities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "email", type: "string" },
          ],
        },
      ];

      await manager.baseline(entities);
      const state = await manager.loadState();

      expect(state.lastSnapshot.length).toBe(1);
      expect(state.lastSnapshot[0].name).toBe("User");
      expect(state.history.length).toBe(1);
      expect(state.history[0].name).toBe("baseline");
    });
  });

  describe("generateMigration", () => {
    it("returns null when no changes", async () => {
      const manager = new MigrationManager(testDir);
      const entities: Entity[] = [
        {
          name: "User",
          fields: [{ name: "id", type: "uuid", primary: true }],
        },
      ];

      await manager.baseline(entities);
      const migration = await manager.generateMigration(entities);

      expect(migration).toBeNull();
    });

    it("generates migration when entities change", async () => {
      const manager = new MigrationManager(testDir);
      const oldEntities: Entity[] = [
        {
          name: "User",
          fields: [{ name: "id", type: "uuid", primary: true }],
        },
      ];
      const newEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "email", type: "string", nullable: true },
          ],
        },
      ];

      await manager.baseline(oldEntities);
      const migration = await manager.generateMigration(newEntities);

      expect(migration).not.toBeNull();
      expect(migration!.output.up.length).toBeGreaterThan(0);
      expect(migration!.content).toContain("ADD COLUMN");
    });

    it("uses custom migration name", async () => {
      const manager = new MigrationManager(testDir);
      const entities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "email", type: "string" },
          ],
        },
      ];

      const migration = await manager.generateMigration(entities, "add_users");

      expect(migration!.name).toBe("add_users");
    });
  });

  describe("saveMigration", () => {
    it("saves migration file and updates state", async () => {
      const manager = new MigrationManager(testDir);
      const entities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "email", type: "string" },
          ],
        },
      ];

      const migration = await manager.generateMigration(entities, "add_users");
      const filepath = await manager.saveMigration(migration!, entities);

      expect(existsSync(filepath)).toBe(true);

      const content = await readFile(filepath, "utf-8");
      expect(content).toContain("Migration: add_users");
      expect(content).toContain("CREATE TABLE");

      // Check state was updated
      const state = await manager.loadState();
      expect(state.lastSnapshot.length).toBe(1);
    });

    it("creates migrations directory if needed", async () => {
      const manager = new MigrationManager(testDir);
      const entities: Entity[] = [
        {
          name: "Post",
          fields: [{ name: "id", type: "uuid", primary: true }],
        },
      ];

      const migration = await manager.generateMigration(entities);
      await manager.saveMigration(migration!, entities);

      expect(existsSync(join(testDir, "migrations"))).toBe(true);
    });
  });

  describe("getStatus", () => {
    it("returns status without baseline", async () => {
      const manager = new MigrationManager(testDir);
      const status = await manager.getStatus();

      expect(status.hasSnapshot).toBe(false);
      expect(status.lastSnapshotEntities).toBe(0);
      expect(status.appliedCount).toBe(0);
    });

    it("returns status with baseline", async () => {
      const manager = new MigrationManager(testDir);
      const entities: Entity[] = [
        {
          name: "User",
          fields: [{ name: "id", type: "uuid", primary: true }],
        },
        {
          name: "Post",
          fields: [{ name: "id", type: "uuid", primary: true }],
        },
      ];

      await manager.baseline(entities);
      const status = await manager.getStatus();

      expect(status.hasSnapshot).toBe(true);
      expect(status.lastSnapshotEntities).toBe(2);
      expect(status.appliedCount).toBe(1); // baseline counts as applied
      expect(status.lastApplied).not.toBeNull();
      expect(status.lastApplied!.name).toBe("baseline");
    });
  });

  describe("dialect support", () => {
    it("uses specified dialect", async () => {
      const manager = new MigrationManager(testDir, "mysql");
      expect(manager.getDialect()).toBe("mysql");
    });

    it("defaults to postgresql", async () => {
      const manager = new MigrationManager(testDir);
      expect(manager.getDialect()).toBe("postgresql");
    });

    it("allows dialect change", async () => {
      const manager = new MigrationManager(testDir);
      manager.setDialect("sqlite");
      expect(manager.getDialect()).toBe("sqlite");
    });
  });

  describe("recordApplied", () => {
    it("records applied migration", async () => {
      const manager = new MigrationManager(testDir);
      await manager.recordApplied("test_migration", "up", "CREATE TABLE test;");

      const state = await manager.loadState();
      expect(state.history.length).toBe(1);
      expect(state.history[0].name).toBe("test_migration");
      expect(state.history[0].direction).toBe("up");
    });
  });

  describe("getPendingMigrations", () => {
    it("returns empty when no migrations directory", async () => {
      const manager = new MigrationManager(testDir);
      const pending = await manager.getPendingMigrations();

      expect(pending).toEqual([]);
    });

    it("returns migration files not in history", async () => {
      const manager = new MigrationManager(testDir);
      const migrationsDir = join(testDir, "migrations");
      await mkdir(migrationsDir, { recursive: true });
      await writeFile(
        join(migrationsDir, "2024-01-01T00-00-00_add_users.sql"),
        "CREATE TABLE users;"
      );
      await writeFile(
        join(migrationsDir, "2024-01-02T00-00-00_add_posts.sql"),
        "CREATE TABLE posts;"
      );

      const pending = await manager.getPendingMigrations();

      expect(pending.length).toBe(2);
    });
  });
});
