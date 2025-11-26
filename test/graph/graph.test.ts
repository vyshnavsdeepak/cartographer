import { describe, it, expect, beforeEach } from "vitest";
import { join } from "node:path";
import { Graph } from "#graph/graph";

const FIXTURES_DIR = join(__dirname, "../fixtures/sample-graph");

describe("Graph", () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph(FIXTURES_DIR);
  });

  describe("load", () => {
    it("loads entities from the graph directory", async () => {
      await graph.load();
      expect(graph.listEntities()).toContain("User");
    });

    it("can be called multiple times without duplicating", async () => {
      await graph.load();
      await graph.load();
      const entities = graph.listEntities().filter((n) => n === "User");
      expect(entities).toHaveLength(1);
    });
  });

  describe("getEntity", () => {
    beforeEach(async () => {
      await graph.load();
    });

    it("returns entity by name", () => {
      const user = graph.getEntity("User");
      expect(user).toBeDefined();
      expect(user?.name).toBe("User");
    });

    it("returns undefined for unknown entity", () => {
      const unknown = graph.getEntity("NonExistent");
      expect(unknown).toBeUndefined();
    });

    it("includes entity fields", () => {
      const user = graph.getEntity("User");
      expect(user?.fields).toBeDefined();
      expect(user?.fields.length).toBeGreaterThan(0);
    });

    it("includes entity code_refs", () => {
      const user = graph.getEntity("User");
      expect(user?.code_refs).toBeDefined();
      expect(user?.code_refs?.model?.anchor).toBe("@graph:User.model");
    });
  });

  describe("listEntities", () => {
    it("returns empty array before load", () => {
      expect(graph.listEntities()).toEqual([]);
    });

    it("returns entity names after load", async () => {
      await graph.load();
      const names = graph.listEntities();
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBeGreaterThan(0);
    });
  });

  describe("getAllEntities", () => {
    beforeEach(async () => {
      await graph.load();
    });

    it("returns all entities", () => {
      const entities = graph.getAllEntities();
      expect(entities.length).toBeGreaterThan(0);
      expect(entities.every((e) => e.name && e.fields)).toBe(true);
    });
  });

  describe("hasEntity", () => {
    beforeEach(async () => {
      await graph.load();
    });

    it("returns true for existing entity", () => {
      expect(graph.hasEntity("User")).toBe(true);
    });

    it("returns false for non-existing entity", () => {
      expect(graph.hasEntity("NonExistent")).toBe(false);
    });
  });

  describe("getLoadErrors", () => {
    it("returns empty array before load", () => {
      expect(graph.getLoadErrors()).toEqual([]);
    });

    it("collects errors for invalid YAML files", async () => {
      await graph.load();
      const errors = graph.getLoadErrors();
      // invalid.yaml should cause a validation error
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].file).toContain("invalid.yaml");
    });

    it("still loads valid entities when some files fail", async () => {
      await graph.load();
      // User should be loaded despite invalid.yaml failing
      expect(graph.hasEntity("User")).toBe(true);
    });
  });
});
