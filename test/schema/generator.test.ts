import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { generateEntitySchema, writeSchema } from "../../src/schema/generator.js";

describe("generateEntitySchema", () => {
  it("generates valid JSON Schema structure", () => {
    const schema = generateEntitySchema();

    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(schema.$id).toBe("https://cartographer.dev/schema/entity.json");
    expect(schema.title).toBe("Cartographer Entity");
    expect(schema.type).toBe("object");
  });

  it("includes required fields array", () => {
    const schema = generateEntitySchema();

    expect(schema.required).toBeDefined();
    expect(Array.isArray(schema.required)).toBe(true);
    expect(schema.required).toContain("name");
    expect(schema.required).toContain("fields");
  });

  it("includes all entity properties", () => {
    const schema = generateEntitySchema();
    const props = schema.properties as Record<string, unknown>;

    expect(props).toBeDefined();
    expect(props.name).toBeDefined();
    expect(props.description).toBeDefined();
    expect(props.fields).toBeDefined();
    expect(props.relations).toBeDefined();
    expect(props.code_refs).toBeDefined();
    expect(props.constraints).toBeDefined();
  });

  it("includes field type enum values", () => {
    const schema = generateEntitySchema();
    const props = schema.properties as Record<string, unknown>;
    const fields = props.fields as Record<string, unknown>;
    const items = fields.items as Record<string, unknown>;
    const itemProps = items.properties as Record<string, unknown>;
    const typeField = itemProps.type as Record<string, unknown>;

    // Should have enum with all field types
    expect(typeField.enum || typeField.anyOf).toBeDefined();

    // Check for common types
    const types = typeField.enum as string[] ||
      (typeField.anyOf as Array<{const: string}>)?.map(a => a.const);
    expect(types).toContain("uuid");
    expect(types).toContain("string");
    expect(types).toContain("integer");
    expect(types).toContain("boolean");
  });

  it("includes relation type enum values", () => {
    const schema = generateEntitySchema();
    const props = schema.properties as Record<string, unknown>;
    const relations = props.relations as Record<string, unknown>;
    const items = relations.items as Record<string, unknown>;
    const itemProps = items.properties as Record<string, unknown>;
    const typeField = itemProps.type as Record<string, unknown>;

    // Should have enum with all relation types
    expect(typeField.enum || typeField.anyOf).toBeDefined();

    const types = typeField.enum as string[] ||
      (typeField.anyOf as Array<{const: string}>)?.map(a => a.const);
    expect(types).toContain("belongs_to");
    expect(types).toContain("has_one");
    expect(types).toContain("has_many");
    expect(types).toContain("many_to_many");
  });

  it("adds descriptions to properties", () => {
    const schema = generateEntitySchema();

    // Top-level description
    expect(schema.properties).toBeDefined();
    const props = schema.properties as Record<string, unknown>;
    const nameField = props.name as Record<string, unknown>;
    expect(nameField.description).toBeDefined();
    expect(typeof nameField.description).toBe("string");
  });

  describe("with knownEntities", () => {
    it("adds entity names as enum for relation validation", () => {
      const entities = ["User", "Post", "Comment"];
      const schema = generateEntitySchema(entities);

      const props = schema.properties as Record<string, unknown>;
      const relations = props.relations as Record<string, unknown>;
      const items = relations.items as Record<string, unknown>;
      const itemProps = items.properties as Record<string, unknown>;
      const entityField = itemProps.entity as Record<string, unknown>;

      expect(entityField.enum).toEqual(entities);
    });

    it("handles empty entity list", () => {
      const schema = generateEntitySchema([]);

      const props = schema.properties as Record<string, unknown>;
      const relations = props.relations as Record<string, unknown>;
      const items = relations.items as Record<string, unknown>;
      const itemProps = items.properties as Record<string, unknown>;
      const entityField = itemProps.entity as Record<string, unknown>;

      // Should not add empty enum
      expect(entityField.enum).toBeUndefined();
    });
  });
});

describe("writeSchema", () => {
  const testDir = join(process.cwd(), "test-schema-temp");

  beforeEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true });
    }
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true });
    }
  });

  it("writes valid JSON to file", async () => {
    const outputPath = join(testDir, "schema.json");
    await writeSchema(outputPath);

    expect(existsSync(outputPath)).toBe(true);

    const content = await readFile(outputPath, "utf-8");
    const parsed = JSON.parse(content);

    expect(parsed.$schema).toBeDefined();
    expect(parsed.type).toBe("object");
  });

  it("writes formatted JSON", async () => {
    const outputPath = join(testDir, "schema.json");
    await writeSchema(outputPath);

    const content = await readFile(outputPath, "utf-8");

    // Should be formatted (contains newlines and indentation)
    expect(content).toContain("\n");
    expect(content).toContain("  ");
  });

  it("includes known entities when provided", async () => {
    const outputPath = join(testDir, "schema.json");
    await writeSchema(outputPath, ["User", "Post"]);

    const content = await readFile(outputPath, "utf-8");
    const parsed = JSON.parse(content);

    const props = parsed.properties;
    const relations = props.relations;
    const items = relations.items;
    const itemProps = items.properties;
    const entityField = itemProps.entity;

    expect(entityField.enum).toEqual(["User", "Post"]);
  });
});
