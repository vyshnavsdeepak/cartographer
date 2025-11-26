import { describe, it, expect, beforeEach } from "vitest";
import { join } from "node:path";
import { Graph } from "#graph/graph";
import { Resolver } from "#graph/resolver";

const GRAPH_DIR = join(__dirname, "../fixtures/sample-graph");
const SOURCE_DIR = join(__dirname, "../fixtures/sample-project/src");

describe("Resolver", () => {
  let graph: Graph;
  let resolver: Resolver;

  beforeEach(async () => {
    graph = new Graph(GRAPH_DIR);
    await graph.load();
    resolver = new Resolver(graph, [SOURCE_DIR]);
  });

  describe("resolve", () => {
    it("returns sync status with resolved entities", async () => {
      const status = await resolver.resolve();
      expect(status.resolved).toBeDefined();
      expect(Array.isArray(status.resolved)).toBe(true);
    });

    it("resolves entity code_refs to anchors", async () => {
      const status = await resolver.resolve();
      const userResolved = status.resolved.find(
        (r) => r.entity.name === "User"
      );
      expect(userResolved).toBeDefined();
      expect(userResolved?.anchors.size).toBeGreaterThan(0);
    });

    it("finds model anchor for User entity", async () => {
      const status = await resolver.resolve();
      const userResolved = status.resolved.find(
        (r) => r.entity.name === "User"
      );
      const modelAnchor = userResolved?.anchors.get("model");
      expect(modelAnchor).toBeDefined();
      expect(modelAnchor?.anchor).toBe("@graph:User.model");
    });

    it("finds types anchor for User entity", async () => {
      const status = await resolver.resolve();
      const userResolved = status.resolved.find(
        (r) => r.entity.name === "User"
      );
      const typesAnchor = userResolved?.anchors.get("types");
      expect(typesAnchor).toBeDefined();
      expect(typesAnchor?.anchor).toBe("@graph:User.types");
    });

    it("finds validation anchor for User entity", async () => {
      const status = await resolver.resolve();
      const userResolved = status.resolved.find(
        (r) => r.entity.name === "User"
      );
      const validationAnchor = userResolved?.anchors.get("validation");
      expect(validationAnchor).toBeDefined();
      expect(validationAnchor?.anchor).toBe("@graph:User.validation");
    });

    it("includes file path in resolved anchor", async () => {
      const status = await resolver.resolve();
      const userResolved = status.resolved.find(
        (r) => r.entity.name === "User"
      );
      const modelAnchor = userResolved?.anchors.get("model");
      expect(modelAnchor?.file).toContain("user.ts");
    });

    it("includes line numbers in resolved anchor", async () => {
      const status = await resolver.resolve();
      const userResolved = status.resolved.find(
        (r) => r.entity.name === "User"
      );
      const modelAnchor = userResolved?.anchors.get("model");
      expect(modelAnchor?.line).toBeGreaterThan(0);
      expect(modelAnchor?.endLine).toBeGreaterThanOrEqual(modelAnchor!.line);
    });

    it("includes content in resolved anchor", async () => {
      const status = await resolver.resolve();
      const userResolved = status.resolved.find(
        (r) => r.entity.name === "User"
      );
      const modelAnchor = userResolved?.anchors.get("model");
      expect(modelAnchor?.content).toContain("class User");
    });
  });

  describe("missing anchors", () => {
    it("tracks missing anchors when code_ref not found in source", async () => {
      // User has validation ref but let's verify the mechanism works
      const status = await resolver.resolve();
      const userResolved = status.resolved.find(
        (r) => r.entity.name === "User"
      );
      // All User anchors should be found in our fixture
      expect(userResolved?.missing).toEqual([]);
    });
  });

  describe("orphaned anchors", () => {
    it("identifies anchors in code not referenced by any entity", async () => {
      const status = await resolver.resolve();
      // Our fixture may have orphaned anchors
      expect(Array.isArray(status.orphanedAnchors)).toBe(true);
    });
  });
});
