import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseImports,
  matchesPattern,
  checkImportRule,
  checkFileRule,
  checkColocationRule,
  checkConstraints,
  formatConstraintResults,
} from "../../src/constraints/checker.js";
import type { Entity, ResolvedAnchor } from "../../src/types/index.js";

describe("Constraint Checker", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cartographer-constraints-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("parseImports", () => {
    it("should parse ES6 default imports", async () => {
      const filePath = join(testDir, "test.ts");
      await writeFile(filePath, 'import User from "./user";');

      const imports = await parseImports(filePath);
      expect(imports.has("./user")).toBe(true);
    });

    it("should parse ES6 named imports", async () => {
      const filePath = join(testDir, "test.ts");
      await writeFile(filePath, 'import { User, Order } from "./models";');

      const imports = await parseImports(filePath);
      expect(imports.has("./models")).toBe(true);
    });

    it("should parse namespace imports", async () => {
      const filePath = join(testDir, "test.ts");
      await writeFile(filePath, 'import * as Utils from "./utils";');

      const imports = await parseImports(filePath);
      expect(imports.has("./utils")).toBe(true);
    });

    it("should parse side-effect imports", async () => {
      const filePath = join(testDir, "test.ts");
      await writeFile(filePath, 'import "./polyfills";');

      const imports = await parseImports(filePath);
      expect(imports.has("./polyfills")).toBe(true);
    });

    it("should parse require statements", async () => {
      const filePath = join(testDir, "test.ts");
      await writeFile(filePath, 'const user = require("./user");');

      const imports = await parseImports(filePath);
      expect(imports.has("./user")).toBe(true);
    });

    it("should capture line numbers", async () => {
      const filePath = join(testDir, "test.ts");
      await writeFile(filePath, '\n\nimport User from "./user";');

      const imports = await parseImports(filePath);
      expect(imports.get("./user")).toBe(3);
    });
  });

  describe("matchesPattern", () => {
    it("should match exact paths", () => {
      expect(matchesPattern("/base/src/api/users.ts", "src/api", "/base")).toBe(true);
    });

    it("should match glob patterns with **", () => {
      expect(matchesPattern("/base/src/api/v1/users.ts", "src/api/**/*.ts", "/base")).toBe(true);
    });

    it("should match glob patterns with *", () => {
      expect(matchesPattern("/base/src/users.ts", "src/*.ts", "/base")).toBe(true);
    });

    it("should not match non-matching paths", () => {
      expect(matchesPattern("/base/src/models/user.ts", "src/api/**", "/base")).toBe(false);
    });
  });

  describe("checkImportRule", () => {
    it("should detect violations of not_imported_by", async () => {
      const srcDir = join(testDir, "src");
      const apiDir = join(srcDir, "api");
      const modelsDir = join(srcDir, "models");

      await mkdir(apiDir, { recursive: true });
      await mkdir(modelsDir, { recursive: true });

      // Create model file
      const modelFile = join(modelsDir, "user.ts");
      await writeFile(modelFile, "export class User {}");

      // Create API file that imports model
      const apiFile = join(apiDir, "users.ts");
      await writeFile(apiFile, 'import { User } from "../models/user";');

      const anchor: ResolvedAnchor = {
        anchor: "@graph:User.model",
        file: modelFile,
        line: 1,
        endLine: 1,
        content: "export class User {}",
      };

      const violations = await checkImportRule(
        {
          anchor: "@graph:User.model",
          not_imported_by: "src/api/**",
        },
        anchor,
        [modelFile, apiFile],
        testDir
      );

      expect(violations.length).toBe(1);
      expect(violations[0].message).toContain("disallowed pattern");
    });

    it("should detect violations of allowed_importers", async () => {
      const srcDir = join(testDir, "src");
      const apiDir = join(srcDir, "api");
      const modelsDir = join(srcDir, "models");
      const servicesDir = join(srcDir, "services");

      await mkdir(apiDir, { recursive: true });
      await mkdir(modelsDir, { recursive: true });
      await mkdir(servicesDir, { recursive: true });

      const modelFile = join(modelsDir, "user.ts");
      await writeFile(modelFile, "export class User {}");

      // API file imports model (not allowed)
      const apiFile = join(apiDir, "users.ts");
      await writeFile(apiFile, 'import { User } from "../models/user";');

      // Service file imports model (allowed)
      const serviceFile = join(servicesDir, "users.ts");
      await writeFile(serviceFile, 'import { User } from "../models/user";');

      const anchor: ResolvedAnchor = {
        anchor: "@graph:User.model",
        file: modelFile,
        line: 1,
        endLine: 1,
        content: "export class User {}",
      };

      const violations = await checkImportRule(
        {
          anchor: "@graph:User.model",
          allowed_importers: ["src/services/**", "src/repositories/**"],
        },
        anchor,
        [modelFile, apiFile, serviceFile],
        testDir
      );

      // Only API file should be a violation
      expect(violations.length).toBe(1);
      expect(violations[0].file).toContain("api");
    });
  });

  describe("checkFileRule", () => {
    it("should detect cannot_import violations", async () => {
      const apiDir = join(testDir, "src/api");
      await mkdir(apiDir, { recursive: true });

      const apiFile = join(apiDir, "users.ts");
      await writeFile(apiFile, 'import { User } from "typeorm";');

      const violations = await checkFileRule(
        {
          files: "src/api/**/*.ts",
          cannot_import: ["typeorm", "prisma"],
        },
        [apiFile],
        testDir
      );

      expect(violations.length).toBe(1);
      expect(violations[0].message).toContain("typeorm");
    });

    it("should detect must_import violations", async () => {
      const apiDir = join(testDir, "src/api");
      await mkdir(apiDir, { recursive: true });

      const apiFile = join(apiDir, "users.ts");
      await writeFile(apiFile, 'import { validate } from "zod";');

      const violations = await checkFileRule(
        {
          files: "src/api/**/*.ts",
          must_import: ["./middleware/auth"],
        },
        [apiFile],
        testDir
      );

      expect(violations.length).toBe(1);
      expect(violations[0].message).toContain("./middleware/auth");
    });
  });

  describe("checkColocationRule", () => {
    it("should pass when sibling file exists", async () => {
      const srcDir = join(testDir, "src");
      await mkdir(srcDir, { recursive: true });

      await writeFile(join(srcDir, "user.ts"), "export class User {}");
      await writeFile(join(srcDir, "user.test.ts"), "test('user', () => {});");

      const anchor: ResolvedAnchor = {
        anchor: "@graph:User.model",
        file: join(srcDir, "user.ts"),
        line: 1,
        endLine: 1,
        content: "export class User {}",
      };

      const violations = await checkColocationRule(
        {
          anchor: "@graph:User.model",
          must_have_sibling: "*.test.ts",
        },
        anchor,
        testDir
      );

      expect(violations.length).toBe(0);
    });

    it("should fail when sibling file is missing", async () => {
      const srcDir = join(testDir, "src");
      await mkdir(srcDir, { recursive: true });

      await writeFile(join(srcDir, "user.ts"), "export class User {}");

      const anchor: ResolvedAnchor = {
        anchor: "@graph:User.model",
        file: join(srcDir, "user.ts"),
        line: 1,
        endLine: 1,
        content: "export class User {}",
      };

      const violations = await checkColocationRule(
        {
          anchor: "@graph:User.model",
          must_have_sibling: "*.test.ts",
        },
        anchor,
        testDir
      );

      expect(violations.length).toBe(1);
      expect(violations[0].message).toContain("Missing sibling file");
    });
  });

  describe("checkConstraints", () => {
    it("should check all constraints for an entity", async () => {
      const srcDir = join(testDir, "src");
      const modelsDir = join(srcDir, "models");
      await mkdir(modelsDir, { recursive: true });

      await writeFile(join(modelsDir, "user.ts"), "export class User {}");
      await writeFile(join(modelsDir, "user.test.ts"), "test()");

      const entity: Entity = {
        name: "User",
        fields: [{ name: "id", type: "uuid" }],
        constraints: [
          {
            rule: "test_coverage",
            description: "All models must have tests",
            check: [
              {
                anchor: "@graph:User.model",
                must_have_sibling: "*.test.ts",
              },
            ],
          },
        ],
      };

      const anchors = new Map<string, ResolvedAnchor>();
      anchors.set("@graph:User.model", {
        anchor: "@graph:User.model",
        file: join(modelsDir, "user.ts"),
        line: 1,
        endLine: 1,
        content: "export class User {}",
      });

      const results = await checkConstraints(
        entity,
        anchors,
        [join(modelsDir, "user.ts")],
        testDir
      );

      expect(results.length).toBe(1);
      expect(results[0].passed).toBe(true);
    });
  });

  describe("formatConstraintResults", () => {
    it("should format passing results", () => {
      const results = [
        {
          entity: "User",
          rule: "test_coverage",
          description: "All models must have tests",
          passed: true,
          violations: [],
        },
      ];

      const { passed, failed, summary } = formatConstraintResults(results);

      expect(passed).toBe(1);
      expect(failed).toBe(0);
      expect(summary.length).toBe(0);
    });

    it("should format failing results with violations", () => {
      const results = [
        {
          entity: "User",
          rule: "layer_isolation",
          description: "Models cannot be imported directly in API",
          passed: false,
          violations: [
            {
              file: "src/api/users.ts",
              line: 5,
              message: 'File matches disallowed pattern "src/api/**"',
            },
          ],
        },
      ];

      const { passed, failed, summary } = formatConstraintResults(results);

      expect(passed).toBe(0);
      expect(failed).toBe(1);
      expect(summary.length).toBeGreaterThan(0);
      expect(summary.some((s) => s.includes("User"))).toBe(true);
      expect(summary.some((s) => s.includes("layer_isolation"))).toBe(true);
    });
  });
});
