import { describe, it, expect } from "vitest";
import { generateMigration, formatMigrationFile } from "../../src/migrate/sql-generator.js";
import { diffEntities } from "../../src/migrate/differ.js";
import type { Entity } from "../../src/types/index.js";

describe("generateMigration", () => {
  describe("CREATE TABLE", () => {
    it("generates CREATE TABLE for new entity", () => {
      const oldEntities: Entity[] = [];
      const newEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "email", type: "string", unique: true },
            { name: "name", type: "string", nullable: true },
          ],
        },
      ];

      const diff = diffEntities(oldEntities, newEntities);
      const migration = generateMigration(diff, newEntities, "postgresql");

      expect(migration.up.length).toBeGreaterThan(0);
      expect(migration.up[0]).toContain("CREATE TABLE users");
      expect(migration.up[0]).toContain("id UUID PRIMARY KEY");
      expect(migration.up[0]).toContain("email VARCHAR(255) NOT NULL UNIQUE");
      expect(migration.up[0]).toContain("name VARCHAR(255)");
      expect(migration.up[0]).toContain("created_at");
      expect(migration.up[0]).toContain("updated_at");
    });

    it("generates correct types for MySQL", () => {
      const newEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "active", type: "boolean" },
            { name: "data", type: "json" },
          ],
        },
      ];

      const diff = diffEntities([], newEntities);
      const migration = generateMigration(diff, newEntities, "mysql");

      expect(migration.up[0]).toContain("CHAR(36)"); // UUID in MySQL
      expect(migration.up[0]).toContain("TINYINT(1)"); // boolean in MySQL
      expect(migration.up[0]).toContain("JSON");
    });

    it("generates correct types for SQLite", () => {
      const newEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "count", type: "integer" },
            { name: "amount", type: "decimal" },
          ],
        },
      ];

      const diff = diffEntities([], newEntities);
      const migration = generateMigration(diff, newEntities, "sqlite");

      expect(migration.up[0]).toContain("TEXT"); // UUID in SQLite
      expect(migration.up[0]).toContain("INTEGER");
      expect(migration.up[0]).toContain("REAL"); // decimal in SQLite
    });
  });

  describe("DROP TABLE", () => {
    it("generates DROP TABLE for removed entity", () => {
      const oldEntities: Entity[] = [
        {
          name: "User",
          fields: [{ name: "id", type: "uuid", primary: true }],
        },
      ];
      const newEntities: Entity[] = [];

      const diff = diffEntities(oldEntities, newEntities);
      const migration = generateMigration(diff, newEntities, "postgresql");

      expect(migration.up.some((s) => s.includes("DROP TABLE"))).toBe(true);
      expect(migration.up.some((s) => s.includes("users"))).toBe(true);
      expect(migration.hasDestructiveChanges).toBe(true);
      expect(migration.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("ADD COLUMN", () => {
    it("generates ADD COLUMN for new field", () => {
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

      const diff = diffEntities(oldEntities, newEntities);
      const migration = generateMigration(diff, newEntities, "postgresql");

      expect(migration.up.some((s) => s.includes("ADD COLUMN"))).toBe(true);
      expect(migration.up.some((s) => s.includes("email"))).toBe(true);
    });

    it("generates ADD COLUMN with default value", () => {
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
            { name: "role", type: "string", default: "user" },
          ],
        },
      ];

      const diff = diffEntities(oldEntities, newEntities);
      const migration = generateMigration(diff, newEntities, "postgresql");

      expect(migration.up.some((s) => s.includes("DEFAULT 'user'"))).toBe(true);
    });
  });

  describe("DROP COLUMN", () => {
    it("generates DROP COLUMN for removed field", () => {
      const oldEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "email", type: "string" },
          ],
        },
      ];
      const newEntities: Entity[] = [
        {
          name: "User",
          fields: [{ name: "id", type: "uuid", primary: true }],
        },
      ];

      const diff = diffEntities(oldEntities, newEntities);
      const migration = generateMigration(diff, newEntities, "postgresql");

      expect(migration.up.some((s) => s.includes("DROP COLUMN"))).toBe(true);
      expect(migration.up.some((s) => s.includes("email"))).toBe(true);
      expect(migration.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("ALTER COLUMN TYPE", () => {
    it("generates ALTER COLUMN TYPE for PostgreSQL", () => {
      const oldEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "bio", type: "string" },
          ],
        },
      ];
      const newEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "bio", type: "text" },
          ],
        },
      ];

      const diff = diffEntities(oldEntities, newEntities);
      const migration = generateMigration(diff, newEntities, "postgresql");

      expect(migration.up.some((s) => s.includes("ALTER COLUMN"))).toBe(true);
      expect(migration.up.some((s) => s.includes("TYPE TEXT"))).toBe(true);
    });

    it("generates MODIFY COLUMN for MySQL", () => {
      const oldEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "bio", type: "string" },
          ],
        },
      ];
      const newEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "bio", type: "text" },
          ],
        },
      ];

      const diff = diffEntities(oldEntities, newEntities);
      const migration = generateMigration(diff, newEntities, "mysql");

      expect(migration.up.some((s) => s.includes("MODIFY COLUMN"))).toBe(true);
    });
  });

  describe("nullable changes", () => {
    it("generates SET NOT NULL for PostgreSQL", () => {
      const oldEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "email", type: "string", nullable: true },
          ],
        },
      ];
      const newEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "email", type: "string", nullable: false },
          ],
        },
      ];

      const diff = diffEntities(oldEntities, newEntities);
      const migration = generateMigration(diff, newEntities, "postgresql");

      expect(migration.up.some((s) => s.includes("SET NOT NULL"))).toBe(true);
    });

    it("generates DROP NOT NULL for PostgreSQL", () => {
      const oldEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "email", type: "string", nullable: false },
          ],
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

      const diff = diffEntities(oldEntities, newEntities);
      const migration = generateMigration(diff, newEntities, "postgresql");

      expect(migration.up.some((s) => s.includes("DROP NOT NULL"))).toBe(true);
    });
  });

  describe("default value changes", () => {
    it("generates SET DEFAULT", () => {
      const oldEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "role", type: "string", default: "user" },
          ],
        },
      ];
      const newEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "role", type: "string", default: "member" },
          ],
        },
      ];

      const diff = diffEntities(oldEntities, newEntities);
      const migration = generateMigration(diff, newEntities, "postgresql");

      expect(migration.up.some((s) => s.includes("SET DEFAULT"))).toBe(true);
      expect(migration.up.some((s) => s.includes("'member'"))).toBe(true);
    });

    it("generates DROP DEFAULT", () => {
      const oldEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "role", type: "string", default: "user" },
          ],
        },
      ];
      const newEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "role", type: "string" },
          ],
        },
      ];

      const diff = diffEntities(oldEntities, newEntities);
      const migration = generateMigration(diff, newEntities, "postgresql");

      expect(migration.up.some((s) => s.includes("DROP DEFAULT"))).toBe(true);
    });
  });

  describe("table naming", () => {
    it("converts PascalCase to snake_case plural", () => {
      const newEntities: Entity[] = [
        {
          name: "UserProfile",
          fields: [{ name: "id", type: "uuid", primary: true }],
        },
      ];

      const diff = diffEntities([], newEntities);
      const migration = generateMigration(diff, newEntities, "postgresql");

      expect(migration.up[0]).toContain("user_profiles");
    });

    it("handles -y pluralization", () => {
      const newEntities: Entity[] = [
        {
          name: "Category",
          fields: [{ name: "id", type: "uuid", primary: true }],
        },
      ];

      const diff = diffEntities([], newEntities);
      const migration = generateMigration(diff, newEntities, "postgresql");

      expect(migration.up[0]).toContain("categories");
    });
  });

  describe("down migrations", () => {
    it("generates reverse for ADD COLUMN", () => {
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
            { name: "email", type: "string" },
          ],
        },
      ];

      const diff = diffEntities(oldEntities, newEntities);
      const migration = generateMigration(diff, newEntities, "postgresql");

      expect(migration.down.some((s) => s.includes("DROP COLUMN"))).toBe(true);
    });

    it("generates reverse for type changes", () => {
      const oldEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "bio", type: "string" },
          ],
        },
      ];
      const newEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "bio", type: "text" },
          ],
        },
      ];

      const diff = diffEntities(oldEntities, newEntities);
      const migration = generateMigration(diff, newEntities, "postgresql");

      // Down should reverse back to VARCHAR
      expect(migration.down.some((s) => s.includes("VARCHAR(255)"))).toBe(true);
    });
  });
});

describe("formatMigrationFile", () => {
  it("formats migration with header", () => {
    const migration = {
      up: ["CREATE TABLE users (id UUID PRIMARY KEY);"],
      down: ["DROP TABLE users;"],
      description: "Add users table",
      hasDestructiveChanges: false,
      warnings: [],
    };

    const content = formatMigrationFile(migration, "add_users");

    expect(content).toContain("-- Migration: add_users");
    expect(content).toContain("-- Description: Add users table");
    expect(content).toContain("-- Up Migration");
    expect(content).toContain("-- Down Migration");
    expect(content).toContain("CREATE TABLE users");
    expect(content).toContain("DROP TABLE users");
  });

  it("includes warnings in output", () => {
    const migration = {
      up: ["DROP TABLE users;"],
      down: [],
      description: "Drop users",
      hasDestructiveChanges: true,
      warnings: ["⚠️  Dropping table users - this will DELETE ALL DATA!"],
    };

    const content = formatMigrationFile(migration, "drop_users");

    expect(content).toContain("WARNINGS");
    expect(content).toContain("DELETE ALL DATA");
  });
});
