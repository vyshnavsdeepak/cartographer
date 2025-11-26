import { describe, it, expect, beforeEach } from "vitest";
import { join } from "node:path";
import { Graph } from "#graph/graph";
import { Resolver } from "#graph/resolver";
import { ImpactAnalyzer, ChangeSpecSchema } from "#graph/impact";

const FIXTURES_DIR = join(__dirname, "../fixtures/sample-graph");
const SOURCE_DIR = join(__dirname, "../fixtures/sample-project/src");

describe("ImpactAnalyzer", () => {
  let graph: Graph;
  let resolver: Resolver;
  let analyzer: ImpactAnalyzer;

  beforeEach(async () => {
    graph = new Graph(FIXTURES_DIR);
    await graph.load();
    resolver = new Resolver(graph, [SOURCE_DIR]);
    analyzer = new ImpactAnalyzer(graph, resolver);
  });

  describe("analyze", () => {
    it("throws for non-existent entity", async () => {
      await expect(
        analyzer.analyze("NonExistent", { type: "remove_field", field: "x" })
      ).rejects.toThrow("Entity 'NonExistent' not found");
    });

    it("returns affected anchors for entity", async () => {
      const result = await analyzer.analyze("User", {
        type: "rename_field",
        field: "email",
        newName: "emailAddress",
      });

      expect(result.entity).toBe("User");
      expect(result.affected.length).toBeGreaterThan(0);
      expect(result.affected[0].anchor).toContain("@graph:User");
    });

    it("includes related entities", async () => {
      const result = await analyzer.analyze("User", {
        type: "remove_field",
        field: "id",
      });

      // Order has a belongs_to relation to User
      const orderRelation = result.relatedEntities.find(
        (r) => r.entity === "Order"
      );
      expect(orderRelation).toBeDefined();
      expect(orderRelation?.reason).toContain("belongs_to");
    });

    it("generates suggested steps for rename_field", async () => {
      const result = await analyzer.analyze("User", {
        type: "rename_field",
        field: "email",
        newName: "emailAddress",
      });

      expect(result.suggestedSteps.length).toBeGreaterThan(0);
      expect(result.suggestedSteps[0]).toContain("email → emailAddress");
      expect(result.suggestedSteps.some((s) => s.includes("migration"))).toBe(true);
    });

    it("generates suggested steps for remove_field", async () => {
      const result = await analyzer.analyze("User", {
        type: "remove_field",
        field: "name",
      });

      expect(result.suggestedSteps.some((s) => s.includes("Verify"))).toBe(true);
      expect(result.suggestedSteps.some((s) => s.includes("drop column"))).toBe(true);
    });

    it("generates suggested steps for add_field", async () => {
      const result = await analyzer.analyze("User", {
        type: "add_field",
        field: "phone",
        fieldType: "string",
        nullable: true,
      });

      expect(result.suggestedSteps[0]).toContain("add phone: string");
      expect(result.suggestedSteps.some((s) => s.includes("nullable"))).toBe(true);
    });

    it("generates suggested steps for add_field (non-nullable)", async () => {
      const result = await analyzer.analyze("User", {
        type: "add_field",
        field: "phone",
        fieldType: "string",
        nullable: false,
      });

      expect(result.suggestedSteps.some((s) => s.includes("default value"))).toBe(true);
    });

    it("generates suggested steps for change_type", async () => {
      const result = await analyzer.analyze("User", {
        type: "change_type",
        field: "id",
        newType: "integer",
      });

      expect(result.suggestedSteps.some((s) => s.includes("type conversion"))).toBe(true);
    });

    it("generates suggested steps for add_relation", async () => {
      const result = await analyzer.analyze("User", {
        type: "add_relation",
        name: "posts",
        targetEntity: "Post",
        relationType: "has_many",
      });

      expect(result.suggestedSteps.some((s) => s.includes("add posts relation"))).toBe(true);
    });

    it("generates suggested steps for remove_relation", async () => {
      const result = await analyzer.analyze("Order", {
        type: "remove_relation",
        name: "user",
      });

      expect(result.suggestedSteps.some((s) => s.includes("Verify user relation"))).toBe(true);
      expect(result.suggestedSteps.some((s) => s.includes("foreign key"))).toBe(true);
    });
  });

  describe("change result structure", () => {
    it("includes the original change spec in result", async () => {
      const change = {
        type: "rename_field" as const,
        field: "email",
        newName: "emailAddress",
      };

      const result = await analyzer.analyze("User", change);

      expect(result.change).toEqual(change);
    });

    it("includes anchor details (file, line, category)", async () => {
      const result = await analyzer.analyze("User", {
        type: "remove_field",
        field: "id",
      });

      for (const affected of result.affected) {
        expect(affected.file).toBeDefined();
        expect(affected.line).toBeGreaterThan(0);
        expect(affected.category).toBeDefined();
      }
    });

    it("steps are numbered sequentially", async () => {
      const result = await analyzer.analyze("User", {
        type: "rename_field",
        field: "email",
        newName: "emailAddress",
      });

      for (let i = 0; i < result.suggestedSteps.length; i++) {
        expect(result.suggestedSteps[i]).toMatch(new RegExp(`^${i + 1}\\.`));
      }
    });
  });
});

describe("ChangeSpecSchema", () => {
  it("validates rename_field", () => {
    const result = ChangeSpecSchema.safeParse({
      type: "rename_field",
      field: "email",
      newName: "emailAddress",
    });
    expect(result.success).toBe(true);
  });

  it("validates remove_field", () => {
    const result = ChangeSpecSchema.safeParse({
      type: "remove_field",
      field: "email",
    });
    expect(result.success).toBe(true);
  });

  it("validates add_field", () => {
    const result = ChangeSpecSchema.safeParse({
      type: "add_field",
      field: "phone",
      fieldType: "string",
    });
    expect(result.success).toBe(true);
  });

  it("validates change_type", () => {
    const result = ChangeSpecSchema.safeParse({
      type: "change_type",
      field: "id",
      newType: "integer",
    });
    expect(result.success).toBe(true);
  });

  it("validates add_relation", () => {
    const result = ChangeSpecSchema.safeParse({
      type: "add_relation",
      name: "posts",
      targetEntity: "Post",
      relationType: "has_many",
    });
    expect(result.success).toBe(true);
  });

  it("validates remove_relation", () => {
    const result = ChangeSpecSchema.safeParse({
      type: "remove_relation",
      name: "user",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid change type", () => {
    const result = ChangeSpecSchema.safeParse({
      type: "invalid_type",
      field: "x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const result = ChangeSpecSchema.safeParse({
      type: "rename_field",
      field: "email",
      // missing newName
    });
    expect(result.success).toBe(false);
  });
});
