import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { Graph } from "#graph/graph";
import { Resolver } from "#graph/resolver";
import {
  listEntities,
  getEntity,
  getAnchor,
  getRelations,
  analyzeImpact,
  checkSyncStatus,
  type ToolContext,
} from "../../src/mcp/tools.js";

const FIXTURES_DIR = join(__dirname, "../fixtures/sample-graph");
const SOURCE_DIR = join(__dirname, "../fixtures/sample-project/src");

/**
 * Integration tests for MCP tool implementations.
 *
 * These tests verify that MCP tools work correctly with
 * the full Graph and Resolver integration.
 */
describe("MCP Tools Integration", () => {
  let ctx: ToolContext;

  beforeAll(async () => {
    const graph = new Graph(FIXTURES_DIR);
    await graph.load();
    const resolver = new Resolver(graph, [SOURCE_DIR]);
    ctx = { graph, resolver };
  });

  describe("listEntities", () => {
    it("returns all entities with metadata", () => {
      const result = listEntities(ctx);
      const data = JSON.parse(result.content[0].text);

      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      const user = data.find((e: any) => e.name === "User");
      expect(user).toBeDefined();
      expect(user.fieldCount).toBeGreaterThan(0);
      expect(typeof user.relationCount).toBe("number");
    });

    it("includes description when available", () => {
      const result = listEntities(ctx);
      const data = JSON.parse(result.content[0].text);

      const user = data.find((e: any) => e.name === "User");
      expect(user.description).toBeDefined();
    });

    it("includes relationCount for entities with relations", () => {
      const result = listEntities(ctx);
      const data = JSON.parse(result.content[0].text);

      const order = data.find((e: any) => e.name === "Order");
      expect(order.relationCount).toBeGreaterThan(0);
    });
  });

  describe("getEntity", () => {
    it("returns full entity details", () => {
      const result = getEntity(ctx, "User");
      const entity = JSON.parse(result.content[0].text);

      expect(entity.name).toBe("User");
      expect(entity.fields).toBeDefined();
      expect(Array.isArray(entity.fields)).toBe(true);
    });

    it("returns error for non-existent entity", () => {
      const result = getEntity(ctx, "NonExistent");

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });

    it("includes relations when present", () => {
      const result = getEntity(ctx, "Order");
      const entity = JSON.parse(result.content[0].text);

      expect(entity.relations).toBeDefined();
      expect(entity.relations.length).toBeGreaterThan(0);
    });

    it("includes code_refs when present", () => {
      const result = getEntity(ctx, "User");
      const entity = JSON.parse(result.content[0].text);

      expect(entity.code_refs).toBeDefined();
      expect(entity.code_refs.model).toBeDefined();
    });
  });

  describe("getAnchor", () => {
    it("returns anchor location and content", async () => {
      const result = await getAnchor(ctx, "@graph:User.model");
      const anchor = JSON.parse(result.content[0].text);

      expect(anchor.anchor).toBe("@graph:User.model");
      expect(anchor.file).toContain("user.ts");
      expect(anchor.line).toBeGreaterThan(0);
      expect(anchor.content).toBeDefined();
    });

    it("returns error for non-existent anchor", async () => {
      const result = await getAnchor(ctx, "@graph:NonExistent.model");

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });

    it("includes endLine for anchor range", async () => {
      const result = await getAnchor(ctx, "@graph:User.model");
      const anchor = JSON.parse(result.content[0].text);

      expect(anchor.endLine).toBeGreaterThanOrEqual(anchor.line);
    });
  });

  describe("getRelations", () => {
    it("returns all relations when no entity specified", () => {
      const result = getRelations(ctx);
      const relations = JSON.parse(result.content[0].text);

      expect(Array.isArray(relations)).toBe(true);
      // Order has a relation to User
      const orderToUser = relations.find(
        (r: any) => r.from === "Order" && r.to === "User"
      );
      expect(orderToUser).toBeDefined();
      expect(orderToUser.type).toBe("belongs_to");
    });

    it("returns relations for specific entity", () => {
      const result = getRelations(ctx, "Order");
      const data = JSON.parse(result.content[0].text);

      expect(data.entity).toBe("Order");
      expect(data.relations.length).toBeGreaterThan(0);
    });

    it("returns empty array for entity without relations", () => {
      const result = getRelations(ctx, "User");
      const data = JSON.parse(result.content[0].text);

      expect(data.entity).toBe("User");
      expect(Array.isArray(data.relations)).toBe(true);
    });

    it("returns error for non-existent entity", () => {
      const result = getRelations(ctx, "NonExistent");

      expect(result.isError).toBe(true);
    });

    it("includes relation metadata in all relations list", () => {
      const result = getRelations(ctx);
      const relations = JSON.parse(result.content[0].text);

      const orderToUser = relations.find((r: any) => r.from === "Order");
      expect(orderToUser.name).toBeDefined();
      expect(orderToUser.type).toBeDefined();
    });
  });

  describe("analyzeImpact", () => {
    it("returns impact analysis for rename_field", async () => {
      const result = await analyzeImpact(ctx, "User", {
        type: "rename_field",
        field: "email",
        newName: "emailAddress",
      });
      const impact = JSON.parse(result.content[0].text);

      expect(impact.entity).toBe("User");
      expect(impact.affected).toBeDefined();
      expect(impact.suggestedSteps).toBeDefined();
      expect(impact.suggestedSteps.length).toBeGreaterThan(0);
    });

    it("includes related entities in impact", async () => {
      const result = await analyzeImpact(ctx, "User", {
        type: "remove_field",
        field: "id",
      });
      const impact = JSON.parse(result.content[0].text);

      // Order has relation to User
      expect(impact.relatedEntities.length).toBeGreaterThan(0);
    });

    it("returns error for non-existent entity", async () => {
      const result = await analyzeImpact(ctx, "NonExistent", {
        type: "remove_field",
        field: "x",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });

    it("includes change spec in result", async () => {
      const change = {
        type: "add_field" as const,
        field: "phone",
        fieldType: "string",
      };
      const result = await analyzeImpact(ctx, "User", change);
      const impact = JSON.parse(result.content[0].text);

      expect(impact.change).toEqual(change);
    });
  });

  describe("checkSyncStatus", () => {
    it("returns sync status with counts", async () => {
      const result = await checkSyncStatus(ctx);
      const status = JSON.parse(result.content[0].text);

      expect(typeof status.inSync).toBe("boolean");
      expect(typeof status.entityCount).toBe("number");
      expect(typeof status.anchorCount).toBe("number");
    });

    it("entityCount matches loaded entities", async () => {
      const result = await checkSyncStatus(ctx);
      const status = JSON.parse(result.content[0].text);

      const entities = ctx.graph.getAllEntities();
      expect(status.entityCount).toBe(entities.length);
    });

    it("reports issues array when out of sync", async () => {
      const result = await checkSyncStatus(ctx);
      const status = JSON.parse(result.content[0].text);

      if (!status.inSync) {
        expect(status.issues).toBeDefined();
        expect(Array.isArray(status.issues)).toBe(true);
        expect(status.issues.length).toBeGreaterThan(0);
      }
    });

    it("issues is undefined when in sync", async () => {
      const result = await checkSyncStatus(ctx);
      const status = JSON.parse(result.content[0].text);

      if (status.inSync) {
        expect(status.issues).toBeUndefined();
      }
    });
  });
});

describe("Tool Response Format", () => {
  let ctx: ToolContext;

  beforeAll(async () => {
    const graph = new Graph(FIXTURES_DIR);
    await graph.load();
    const resolver = new Resolver(graph, [SOURCE_DIR]);
    ctx = { graph, resolver };
  });

  it("all tools return content array with text type", () => {
    const result = listEntities(ctx);

    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe("text");
    expect(typeof result.content[0].text).toBe("string");
  });

  it("error responses include isError flag", () => {
    const result = getEntity(ctx, "NonExistent");

    expect(result.isError).toBe(true);
  });

  it("successful responses do not have isError flag", () => {
    const result = listEntities(ctx);

    expect(result.isError).toBeUndefined();
  });

  it("content text is valid JSON", () => {
    const result = listEntities(ctx);

    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });
});
