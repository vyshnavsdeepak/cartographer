import { describe, it, expect } from "vitest";
import { diffEntities } from "../../src/migrate/differ.js";
import type { Entity } from "../../src/types/index.js";

describe("diffEntities", () => {
  describe("entity changes", () => {
    it("detects added entity", () => {
      const oldEntities: Entity[] = [];
      const newEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "email", type: "string" },
          ],
        },
      ];

      const result = diffEntities(oldEntities, newEntities);

      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.changes.some((c) => c.type === "entity_added")).toBe(true);
      expect(result.hasBreakingChanges).toBe(false);
    });

    it("detects removed entity as breaking", () => {
      const oldEntities: Entity[] = [
        {
          name: "User",
          fields: [{ name: "id", type: "uuid", primary: true }],
        },
      ];
      const newEntities: Entity[] = [];

      const result = diffEntities(oldEntities, newEntities);

      expect(result.changes.some((c) => c.type === "entity_removed")).toBe(true);
      expect(result.hasBreakingChanges).toBe(true);
    });
  });

  describe("field changes", () => {
    it("detects added field", () => {
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

      const result = diffEntities(oldEntities, newEntities);

      expect(result.changes.some((c) => c.type === "field_added")).toBe(true);
      expect(result.hasBreakingChanges).toBe(false); // nullable field is not breaking
    });

    it("detects non-nullable field without default as breaking", () => {
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
            { name: "email", type: "string" }, // non-nullable, no default
          ],
        },
      ];

      const result = diffEntities(oldEntities, newEntities);

      const addedField = result.changes.find(
        (c) => c.type === "field_added" && c.field === "email"
      );
      expect(addedField).toBeDefined();
      expect(addedField?.breaking).toBe(true);
    });

    it("detects removed field as breaking", () => {
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

      const result = diffEntities(oldEntities, newEntities);

      expect(result.changes.some((c) => c.type === "field_removed")).toBe(true);
      expect(result.hasBreakingChanges).toBe(true);
    });

    it("detects field type change", () => {
      const oldEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "age", type: "string" },
          ],
        },
      ];
      const newEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "age", type: "integer" },
          ],
        },
      ];

      const result = diffEntities(oldEntities, newEntities);

      const typeChange = result.changes.find(
        (c) => c.type === "field_type_changed"
      );
      expect(typeChange).toBeDefined();
      expect(typeChange?.oldValue).toBe("string");
      expect(typeChange?.newValue).toBe("integer");
    });

    it("detects safe type widening (string -> text)", () => {
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

      const result = diffEntities(oldEntities, newEntities);

      const typeChange = result.changes.find(
        (c) => c.type === "field_type_changed"
      );
      expect(typeChange).toBeDefined();
      expect(typeChange?.breaking).toBe(false);
    });

    it("detects nullable change", () => {
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

      const result = diffEntities(oldEntities, newEntities);

      const nullableChange = result.changes.find(
        (c) => c.type === "field_nullable_changed"
      );
      expect(nullableChange).toBeDefined();
      expect(nullableChange?.breaking).toBe(true); // making non-nullable is breaking
    });

    it("detects default value change", () => {
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

      const result = diffEntities(oldEntities, newEntities);

      const defaultChange = result.changes.find(
        (c) => c.type === "field_default_changed"
      );
      expect(defaultChange).toBeDefined();
      expect(defaultChange?.oldValue).toBe("user");
      expect(defaultChange?.newValue).toBe("member");
      expect(defaultChange?.breaking).toBe(false);
    });
  });

  describe("relation changes", () => {
    it("detects added relation", () => {
      const oldEntities: Entity[] = [
        {
          name: "Post",
          fields: [{ name: "id", type: "uuid", primary: true }],
          relations: [],
        },
      ];
      const newEntities: Entity[] = [
        {
          name: "Post",
          fields: [{ name: "id", type: "uuid", primary: true }],
          relations: [
            {
              name: "author",
              entity: "User",
              type: "belongs_to",
              foreign_key: "author_id",
            },
          ],
        },
      ];

      const result = diffEntities(oldEntities, newEntities);

      expect(result.changes.some((c) => c.type === "relation_added")).toBe(
        true
      );
    });

    it("detects removed relation as breaking", () => {
      const oldEntities: Entity[] = [
        {
          name: "Post",
          fields: [{ name: "id", type: "uuid", primary: true }],
          relations: [
            {
              name: "author",
              entity: "User",
              type: "belongs_to",
              foreign_key: "author_id",
            },
          ],
        },
      ];
      const newEntities: Entity[] = [
        {
          name: "Post",
          fields: [{ name: "id", type: "uuid", primary: true }],
          relations: [],
        },
      ];

      const result = diffEntities(oldEntities, newEntities);

      expect(result.changes.some((c) => c.type === "relation_removed")).toBe(
        true
      );
      expect(result.hasBreakingChanges).toBe(true);
    });
  });

  describe("summary generation", () => {
    it("generates summary with counts", () => {
      const oldEntities: Entity[] = [];
      const newEntities: Entity[] = [
        {
          name: "User",
          fields: [
            { name: "id", type: "uuid", primary: true },
            { name: "email", type: "string" },
          ],
        },
      ];

      const result = diffEntities(oldEntities, newEntities);

      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.summary.some((s) => s.includes("additions"))).toBe(true);
    });

    it("reports no changes for identical entities", () => {
      const entities: Entity[] = [
        {
          name: "User",
          fields: [{ name: "id", type: "uuid", primary: true }],
        },
      ];

      const result = diffEntities(entities, entities);

      expect(result.changes.length).toBe(0);
      expect(result.hasBreakingChanges).toBe(false);
    });
  });
});
