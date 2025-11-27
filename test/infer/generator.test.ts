import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import {
  entityToYaml,
  generateEntityFiles,
  previewGeneration,
  formatEntitySummary,
} from "../../src/infer/generator.js";
import type { InferredEntity } from "../../src/infer/extractor.js";

describe("Entity Generator", () => {
  let testDir: string;
  let outputDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cartographer-generator-test-${Date.now()}`);
    outputDir = join(testDir, "entities");
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  const createEntity = (overrides: Partial<InferredEntity> = {}): InferredEntity => ({
    name: "User",
    sourceFile: join(testDir, "src/models/user.ts"),
    line: 10,
    fields: [
      { name: "id", type: "uuid", isPrimary: true, isUnique: false, isNullable: false },
      { name: "email", type: "string", isPrimary: false, isUnique: true, isNullable: false },
    ],
    relations: [],
    sourceType: "class",
    confidence: 0.8,
    suggestedRefs: new Map([["model", { anchor: "@graph:User.model", line: 10 }]]),
    ...overrides,
  });

  describe("entityToYaml", () => {
    it("should generate valid YAML with all fields", () => {
      const entity = createEntity();
      const yaml = entityToYaml(entity, testDir);

      const parsed = parseYaml(yaml);

      expect(parsed.name).toBe("User");
      expect(parsed.description).toContain("src/models/user.ts:11");
      expect(parsed.fields).toHaveLength(2);
      expect(parsed.fields[0].name).toBe("id");
      expect(parsed.fields[0].primary).toBe(true);
      expect(parsed.fields[1].name).toBe("email");
      expect(parsed.fields[1].unique).toBe(true);
    });

    it("should include relations in YAML", () => {
      const entity = createEntity({
        relations: [
          { name: "orders", entity: "Order", type: "has_many" },
          { name: "profile", entity: "Profile", type: "has_one" },
        ],
      });

      const yaml = entityToYaml(entity, testDir);
      const parsed = parseYaml(yaml);

      expect(parsed.relations).toHaveLength(2);
      expect(parsed.relations[0]).toEqual({
        name: "orders",
        entity: "Order",
        type: "has_many",
      });
    });

    it("should include code_refs in YAML", () => {
      const entity = createEntity();
      entity.suggestedRefs.set("types", { anchor: "@graph:User.types", line: 20 });

      const yaml = entityToYaml(entity, testDir);
      const parsed = parseYaml(yaml);

      expect(parsed.code_refs).toBeDefined();
      expect(parsed.code_refs.model.anchor).toBe("@graph:User.model");
      expect(parsed.code_refs.types.anchor).toBe("@graph:User.types");
    });

    it("should handle nullable fields", () => {
      const entity = createEntity({
        fields: [
          { name: "id", type: "uuid", isPrimary: true, isUnique: false, isNullable: false },
          { name: "nickname", type: "string", isPrimary: false, isUnique: false, isNullable: true },
        ],
      });

      const yaml = entityToYaml(entity, testDir);
      const parsed = parseYaml(yaml);

      expect(parsed.fields[1].nullable).toBe(true);
    });
  });

  describe("generateEntityFiles", () => {
    it("should create YAML files for entities", async () => {
      const entities = [
        createEntity({ name: "User" }),
        createEntity({ name: "Order" }),
      ];

      const results = await generateEntityFiles(entities, {
        outputDir,
        baseDir: testDir,
      });

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);

      const userContent = await readFile(join(outputDir, "user.yaml"), "utf-8");
      const orderContent = await readFile(join(outputDir, "order.yaml"), "utf-8");

      // YAML strings may be quoted
      expect(userContent).toMatch(/name:\s*["']?User["']?/);
      expect(orderContent).toMatch(/name:\s*["']?Order["']?/);
    });

    it("should use lowercase filenames", async () => {
      const entities = [createEntity({ name: "UserProfile" })];

      const results = await generateEntityFiles(entities, {
        outputDir,
        baseDir: testDir,
      });

      expect(results[0].filePath).toContain("userprofile.yaml");
    });

    it("should create output directory if needed", async () => {
      const newOutputDir = join(testDir, "new", "entities");
      const entities = [createEntity()];

      const results = await generateEntityFiles(entities, {
        outputDir: newOutputDir,
        baseDir: testDir,
      });

      expect(results[0].success).toBe(true);
    });
  });

  describe("previewGeneration", () => {
    it("should return YAML previews without writing files", () => {
      const entities = [
        createEntity({ name: "User" }),
        createEntity({ name: "Order" }),
      ];

      const previews = previewGeneration(entities, testDir);

      expect(previews.size).toBe(2);
      // YAML strings may be quoted
      expect(previews.get("User")).toMatch(/name:\s*["']?User["']?/);
      expect(previews.get("Order")).toMatch(/name:\s*["']?Order["']?/);
    });
  });

  describe("formatEntitySummary", () => {
    it("should format entity summary for display", () => {
      const entity = createEntity({
        relations: [{ name: "orders", entity: "Order", type: "has_many" }],
      });

      const summary = formatEntitySummary(entity, testDir);

      expect(summary).toContain("User");
      expect(summary).toContain("src/models/user.ts:11");
      expect(summary).toContain("class");
      expect(summary).toContain("80%");
      expect(summary).toContain("id [PK]");
      expect(summary).toContain("email [U]");
      expect(summary).toContain("orders (has_many -> Order)");
    });

    it("should handle entity without relations", () => {
      const entity = createEntity({ relations: [] });

      const summary = formatEntitySummary(entity, testDir);

      expect(summary).not.toContain("Relations:");
    });
  });
});
