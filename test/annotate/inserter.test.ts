import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  insertAnchor,
  insertAnchors,
  previewInsertions,
} from "../../src/annotate/inserter.js";
import type { AnchorCandidate } from "../../src/annotate/matcher.js";

describe("Annotate Inserter", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cartographer-inserter-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  const createCandidate = (
    file: string,
    line: number,
    anchor = "@graph:User.model"
  ): AnchorCandidate => ({
    anchor,
    entity: "User",
    category: "model",
    file,
    line,
    matchType: "class (exact match)",
    confidence: 1.0,
    identifier: "User",
  });

  describe("insertAnchor", () => {
    it("should insert anchor comment before target line", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(filePath, "export class User {\n  id: string;\n}");

      const candidate = createCandidate(filePath, 0);
      const result = await insertAnchor(candidate);

      expect(result.success).toBe(true);
      expect(result.line).toBe(0);

      const content = await readFile(filePath, "utf-8");
      expect(content).toBe("// @graph:User.model\nexport class User {\n  id: string;\n}");
    });

    it("should preserve indentation when inserting", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(filePath, "class Outer {\n  export class User {\n  }\n}");

      const candidate = createCandidate(filePath, 1);
      const result = await insertAnchor(candidate);

      expect(result.success).toBe(true);

      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("  // @graph:User.model\n  export class User");
    });

    it("should fail for non-existent line", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(filePath, "export class User {}");

      const candidate = createCandidate(filePath, 100);
      const result = await insertAnchor(candidate);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Line 100 does not exist");
    });

    it("should fail for non-existent file", async () => {
      const filePath = join(testDir, "nonexistent.ts");

      const candidate = createCandidate(filePath, 0);
      const result = await insertAnchor(candidate);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("insertAnchors", () => {
    it("should insert multiple anchors in same file (bottom to top)", async () => {
      const filePath = join(testDir, "models.ts");
      await writeFile(
        filePath,
        "export class User {\n}\n\nexport class Order {\n}"
      );

      const candidates: AnchorCandidate[] = [
        createCandidate(filePath, 0, "@graph:User.model"),
        { ...createCandidate(filePath, 3, "@graph:Order.model"), entity: "Order" },
      ];

      const results = await insertAnchors(candidates);

      expect(results.every((r) => r.success)).toBe(true);

      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("// @graph:User.model\nexport class User");
      expect(content).toContain("// @graph:Order.model\nexport class Order");
    });

    it("should insert anchors in multiple files", async () => {
      const file1 = join(testDir, "user.ts");
      const file2 = join(testDir, "order.ts");
      await writeFile(file1, "export class User {}");
      await writeFile(file2, "export class Order {}");

      const candidates: AnchorCandidate[] = [
        createCandidate(file1, 0, "@graph:User.model"),
        { ...createCandidate(file2, 0, "@graph:Order.model"), entity: "Order" },
      ];

      const results = await insertAnchors(candidates);

      expect(results.every((r) => r.success)).toBe(true);

      const content1 = await readFile(file1, "utf-8");
      const content2 = await readFile(file2, "utf-8");
      expect(content1).toContain("// @graph:User.model");
      expect(content2).toContain("// @graph:Order.model");
    });

    it("should skip if anchor already exists in file", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(
        filePath,
        "// @graph:User.model\nexport class User {}"
      );

      const candidate = createCandidate(filePath, 1);
      const results = await insertAnchors([candidate]);

      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe("Anchor already exists in file");
    });

    it("should handle partial failures gracefully", async () => {
      const file1 = join(testDir, "user.ts");
      const file2 = join(testDir, "order.ts");
      await writeFile(file1, "export class User {}");
      await writeFile(file2, "export class Order {}");

      const candidates: AnchorCandidate[] = [
        createCandidate(file1, 0, "@graph:User.model"),
        createCandidate(file2, 100, "@graph:Order.model"), // Invalid line
      ];

      const results = await insertAnchors(candidates);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });

  describe("previewInsertions", () => {
    it("should generate preview without modifying files", async () => {
      const filePath = join(testDir, "user.ts");
      await writeFile(filePath, "export class User {}");

      const candidates: AnchorCandidate[] = [
        createCandidate(filePath, 0, "@graph:User.model"),
      ];

      const preview = previewInsertions(candidates);

      expect(preview.size).toBe(1);
      const lines = preview.get(filePath)!;
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("Line 1");
      expect(lines[0]).toContain("@graph:User.model");
      expect(lines[0]).toContain("100% confidence");

      // Verify file wasn't modified
      const content = await readFile(filePath, "utf-8");
      expect(content).toBe("export class User {}");
    });

    it("should group previews by file", async () => {
      const file1 = join(testDir, "user.ts");
      const file2 = join(testDir, "order.ts");

      const candidates: AnchorCandidate[] = [
        createCandidate(file1, 0, "@graph:User.model"),
        createCandidate(file1, 5, "@graph:User.types"),
        createCandidate(file2, 0, "@graph:Order.model"),
      ];

      const preview = previewInsertions(candidates);

      expect(preview.size).toBe(2);
      expect(preview.get(file1)).toHaveLength(2);
      expect(preview.get(file2)).toHaveLength(1);
    });

    it("should include match type and confidence in preview", async () => {
      const filePath = join(testDir, "user.ts");

      const candidate: AnchorCandidate = {
        anchor: "@graph:User.model",
        entity: "User",
        category: "model",
        file: filePath,
        line: 5,
        matchType: "Zod schema",
        confidence: 0.95,
        identifier: "UserSchema",
      };

      const preview = previewInsertions([candidate]);
      const lines = preview.get(filePath)!;

      expect(lines[0]).toContain("Zod schema");
      expect(lines[0]).toContain("95% confidence");
    });
  });
});
