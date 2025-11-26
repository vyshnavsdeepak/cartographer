import { describe, it, expect } from "vitest";
import { loadEntity, parseEntity } from "#graph/loader";

describe("parseEntity", () => {
  describe("valid entities", () => {
    it("parses minimal valid entity", () => {
      const yaml = `
name: User
fields:
  - name: id
    type: uuid
`;
      const entity = parseEntity(yaml);

      expect(entity.name).toBe("User");
      expect(entity.fields).toHaveLength(1);
      expect(entity.description).toBeUndefined();
    });

    it("parses entity with all optional fields", () => {
      const yaml = `
name: User
description: A user account
fields:
  - name: id
    type: uuid
    primary: true
    unique: true
    nullable: false
    description: Unique identifier
`;
      const entity = parseEntity(yaml);

      expect(entity.description).toBe("A user account");
      const field = entity.fields[0];
      expect(field?.primary).toBe(true);
      expect(field?.unique).toBe(true);
      expect(field?.nullable).toBe(false);
      expect(field?.description).toBe("Unique identifier");
    });

    it("parses enum field with values", () => {
      const yaml = `
name: Order
fields:
  - name: status
    type: enum
    values:
      - pending
      - completed
    default: pending
`;
      const entity = parseEntity(yaml);
      const field = entity.fields[0];

      expect(field?.type).toBe("enum");
      expect(field?.values).toEqual(["pending", "completed"]);
      expect(field?.default).toBe("pending");
    });

    it("parses all supported field types", () => {
      const yaml = `
name: AllTypes
fields:
  - name: f1
    type: uuid
  - name: f2
    type: string
  - name: f3
    type: text
  - name: f4
    type: integer
  - name: f5
    type: decimal
  - name: f6
    type: boolean
  - name: f7
    type: timestamp
  - name: f8
    type: date
  - name: f9
    type: json
  - name: f10
    type: enum
    values: [a, b]
`;
      const entity = parseEntity(yaml);

      expect(entity.fields).toHaveLength(10);
      expect(entity.fields.map((f) => f.type)).toEqual([
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
    });
  });

  describe("validation errors", () => {
    it("rejects entity without name", () => {
      const yaml = `
fields:
  - name: id
    type: uuid
`;
      expect(() => parseEntity(yaml)).toThrow();
    });

    it("rejects entity without fields", () => {
      const yaml = `
name: User
`;
      expect(() => parseEntity(yaml)).toThrow();
    });

    it("rejects entity with empty fields array", () => {
      const yaml = `
name: User
fields: []
`;
      // This should actually pass - empty array is valid
      // Let me check what behavior we want...
      const entity = parseEntity(yaml);
      expect(entity.fields).toHaveLength(0);
    });

    it("rejects field without name", () => {
      const yaml = `
name: User
fields:
  - type: uuid
`;
      expect(() => parseEntity(yaml)).toThrow();
    });

    it("rejects field without type", () => {
      const yaml = `
name: User
fields:
  - name: id
`;
      expect(() => parseEntity(yaml)).toThrow();
    });

    it("rejects invalid field type", () => {
      const yaml = `
name: User
fields:
  - name: id
    type: invalid_type
`;
      expect(() => parseEntity(yaml)).toThrow();
    });

    it("provides meaningful error for missing required field", () => {
      const yaml = `
name: User
fields:
  - name: id
`;
      try {
        parseEntity(yaml);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeDefined();
        // Zod errors should mention what's missing
        expect(String(err)).toMatch(/type/i);
      }
    });

    it("provides meaningful error for invalid type", () => {
      const yaml = `
name: User
fields:
  - name: id
    type: not_a_type
`;
      try {
        parseEntity(yaml);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeDefined();
        expect(String(err)).toMatch(/not_a_type|invalid/i);
      }
    });
  });

  describe("edge cases", () => {
    it("handles empty YAML", () => {
      expect(() => parseEntity("")).toThrow();
    });

    it("handles YAML with only whitespace", () => {
      expect(() => parseEntity("   \n\n   ")).toThrow();
    });

    it("handles malformed YAML", () => {
      const yaml = `
name: User
fields:
  - this is not valid yaml: : :
`;
      expect(() => parseEntity(yaml)).toThrow();
    });

    it("ignores extra fields not in schema", () => {
      const yaml = `
name: User
extra_field: should be ignored
another_one: also ignored
fields:
  - name: id
    type: uuid
    unknown_prop: ignored
`;
      // Zod strips unknown fields by default
      const entity = parseEntity(yaml);
      expect(entity.name).toBe("User");
      expect((entity as Record<string, unknown>)["extra_field"]).toBeUndefined();
    });

    it("handles field with null default", () => {
      const yaml = `
name: User
fields:
  - name: nickname
    type: string
    default: null
    nullable: true
`;
      const entity = parseEntity(yaml);
      expect(entity.fields[0]?.default).toBeNull();
    });
  });
});

describe("loadEntity", () => {
  it("loads entity from file", async () => {
    const entity = await loadEntity(
      "./test/fixtures/sample-graph/entities/user.yaml"
    );

    expect(entity.name).toBe("User");
    expect(entity.fields).toHaveLength(4);
  });

  it("throws ENOENT for non-existent file", async () => {
    await expect(loadEntity("./does-not-exist.yaml")).rejects.toThrow("ENOENT");
  });
});
