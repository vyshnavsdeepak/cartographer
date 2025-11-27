import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findCandidates, findAllCandidates } from "../../src/annotate/matcher.js";
import type { Entity } from "../../src/types.js";

describe("Annotate Matcher", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cartographer-matcher-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  const createEntity = (name: string): Entity => ({
    name,
    fields: [{ name: "id", type: "uuid" }],
  });

  describe("findCandidates - model category", () => {
    it("should find exact class match with confidence 1.0", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(filePath, "export class User {\n  id: string;\n}");

      const candidates = await findCandidates(
        filePath,
        createEntity("User"),
        "model",
        "@graph:User.model"
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].confidence).toBe(1.0);
      expect(candidates[0].matchType).toBe("class (exact match)");
      expect(candidates[0].identifier).toBe("User");
      expect(candidates[0].line).toBe(0);
    });

    it("should find case-insensitive class match with confidence 0.9", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(filePath, "export class user {\n  id: string;\n}");

      const candidates = await findCandidates(
        filePath,
        createEntity("User"),
        "model",
        "@graph:User.model"
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].confidence).toBe(0.9);
      expect(candidates[0].matchType).toBe("class (case-insensitive)");
    });

    it("should skip lines that contain anchors", async () => {
      const filePath = join(testDir, "user.ts");
      // Anchor on line 0 - this line is skipped, but class on line 1 is still found
      // Duplicate prevention is handled by the inserter, not the matcher
      await writeFile(
        filePath,
        "// @graph:User.model\nexport class User {\n  id: string;\n}"
      );

      const candidates = await findCandidates(
        filePath,
        createEntity("User"),
        "model",
        "@graph:User.model"
      );

      // The matcher still finds the class on line 1 (inserter handles duplicates)
      expect(candidates).toHaveLength(1);
      expect(candidates[0].line).toBe(1); // Class is on line 1
    });

    it("should skip inline anchor comments", async () => {
      const filePath = join(testDir, "user.ts");
      // Class with inline anchor - this line should be skipped
      await writeFile(
        filePath,
        "export class User { // @graph:User.model\n  id: string;\n}"
      );

      const candidates = await findCandidates(
        filePath,
        createEntity("User"),
        "model",
        "@graph:User.model"
      );

      expect(candidates).toHaveLength(0);
    });

    it("should find ORM decorator with confidence 0.9", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(filePath, "@Entity()\nexport class User {}");

      const candidates = await findCandidates(
        filePath,
        createEntity("User"),
        "model",
        "@graph:User.model"
      );

      // Should find both ORM decorator and class
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      const ormCandidate = candidates.find((c) => c.matchType === "ORM decorator");
      expect(ormCandidate).toBeDefined();
      expect(ormCandidate?.confidence).toBe(0.9);
    });
  });

  describe("findCandidates - types category", () => {
    it("should find exact interface match with confidence 1.0", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(filePath, "export interface User {\n  id: string;\n}");

      const candidates = await findCandidates(
        filePath,
        createEntity("User"),
        "types",
        "@graph:User.types"
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].confidence).toBe(1.0);
      expect(candidates[0].matchType).toBe("interface (exact match)");
    });

    it("should find IUser interface pattern match", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(filePath, "export interface IUser {\n  id: string;\n}");

      const candidates = await findCandidates(
        filePath,
        createEntity("User"),
        "types",
        "@graph:User.types"
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].confidence).toBe(0.85);
      expect(candidates[0].matchType).toBe("interface (pattern match)");
    });

    it("should find UserDTO interface pattern match", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(filePath, "export interface UserDTO {\n  id: string;\n}");

      const candidates = await findCandidates(
        filePath,
        createEntity("User"),
        "types",
        "@graph:User.types"
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].matchType).toBe("interface (pattern match)");
    });

    it("should find type alias with confidence 0.8", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(filePath, "export type User = {\n  id: string;\n}");

      const candidates = await findCandidates(
        filePath,
        createEntity("User"),
        "types",
        "@graph:User.types"
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].confidence).toBe(0.8);
      expect(candidates[0].matchType).toBe("type alias");
    });
  });

  describe("findCandidates - validation category", () => {
    it("should find Zod schema with confidence 0.95", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(filePath, "export const UserSchema = z.object({\n  id: z.string()\n});");

      const candidates = await findCandidates(
        filePath,
        createEntity("User"),
        "validation",
        "@graph:User.validation"
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].confidence).toBe(0.95);
      expect(candidates[0].matchType).toBe("Zod schema");
      expect(candidates[0].identifier).toBe("UserSchema");
    });

    it("should find CreateUserSchema pattern", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(filePath, "export const CreateUserSchema = z.object({});");

      const candidates = await findCandidates(
        filePath,
        createEntity("User"),
        "validation",
        "@graph:User.validation"
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].identifier).toBe("CreateUserSchema");
    });

    it("should find validation function with confidence 0.85", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(filePath, "export function validateUser(data: unknown) {}");

      const candidates = await findCandidates(
        filePath,
        createEntity("User"),
        "validation",
        "@graph:User.validation"
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].confidence).toBe(0.85);
      expect(candidates[0].matchType).toBe("validation function");
    });
  });

  describe("findCandidates - schema category", () => {
    it("should find Drizzle table definition with confidence 0.95", async () => {
      const filePath = join(testDir, "schema.ts");
      await writeFile(filePath, "export const users = pgTable('users', {\n  id: uuid()\n});");

      const candidates = await findCandidates(
        filePath,
        createEntity("User"),
        "schema",
        "@graph:User.schema"
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].confidence).toBe(0.95);
      expect(candidates[0].matchType).toBe("Drizzle table");
      expect(candidates[0].identifier).toBe("users");
    });

    it("should match singular entity name to plural table", async () => {
      const filePath = join(testDir, "schema.ts");
      await writeFile(filePath, "export const orders = pgTable('orders', {});");

      const candidates = await findCandidates(
        filePath,
        createEntity("Order"),
        "schema",
        "@graph:Order.schema"
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].identifier).toBe("orders");
    });
  });

  describe("findAllCandidates", () => {
    it("should scan multiple files for missing anchors", async () => {
      const modelFile = join(testDir, "model.ts");
      const typesFile = join(testDir, "types.ts");
      await writeFile(modelFile, "export class User {}");
      await writeFile(typesFile, "export interface User {}");

      const entity = createEntity("User");
      const missingAnchors = [
        { category: "model", anchor: "@graph:User.model" },
        { category: "types", anchor: "@graph:User.types" },
      ];

      const results = await findAllCandidates([modelFile, typesFile], entity, missingAnchors);

      expect(results.size).toBe(2);
      expect(results.get("@graph:User.model")).toBeDefined();
      expect(results.get("@graph:User.types")).toBeDefined();
    });

    it("should return empty array for non-matching anchors", async () => {
      const filePath = join(testDir, "other.ts");
      await writeFile(filePath, "export class Other {}");

      const entity = createEntity("User");
      const missingAnchors = [{ category: "model", anchor: "@graph:User.model" }];

      const results = await findAllCandidates([filePath], entity, missingAnchors);

      expect(results.get("@graph:User.model")).toHaveLength(0);
    });

    it("should sort candidates by confidence", async () => {
      const file1 = join(testDir, "user.ts");
      const file2 = join(testDir, "models.ts");
      // Exact match in user.ts
      await writeFile(file1, "export class User {}");
      // Case-insensitive match in models.ts
      await writeFile(file2, "export class user {}");

      const entity = createEntity("User");
      const missingAnchors = [{ category: "model", anchor: "@graph:User.model" }];

      const results = await findAllCandidates([file1, file2], entity, missingAnchors);
      const candidates = results.get("@graph:User.model")!;

      expect(candidates.length).toBe(2);
      expect(candidates[0].confidence).toBe(1.0); // Exact match first
      expect(candidates[1].confidence).toBe(0.9); // Case-insensitive second
    });
  });
});
