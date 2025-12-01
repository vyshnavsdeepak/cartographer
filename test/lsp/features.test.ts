import { describe, it, expect, beforeEach } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Graph } from "../../src/graph/graph.js";
import { definitionProvider, findEntityDefinition } from "../../src/lsp/features/definition.js";
import { referencesProvider, findAllReferences } from "../../src/lsp/features/references.js";
import { diagnosticsProvider } from "../../src/lsp/features/diagnostics.js";
import { hoverProvider } from "../../src/lsp/features/hover.js";

function createDocument(content: string, uri = "file:///test.yaml"): TextDocument {
  return TextDocument.create(uri, "yaml", 1, content);
}

describe("LSP Features", () => {
  let testDir: string;
  let entitiesDir: string;
  let graph: Graph;

  beforeEach(async () => {
    // Create temp test directory
    testDir = join(tmpdir(), `cartographer-lsp-test-${Date.now()}`);
    entitiesDir = join(testDir, ".graph", "entities");
    mkdirSync(entitiesDir, { recursive: true });

    // Create test entity files
    writeFileSync(
      join(entitiesDir, "user.yaml"),
      `name: User
description: A user in the system
fields:
  - name: id
    type: uuid
    primary: true
  - name: email
    type: string
    unique: true
relations:
  - name: orders
    type: has_many
    entity: Order
`
    );

    writeFileSync(
      join(entitiesDir, "order.yaml"),
      `name: Order
description: A customer order
fields:
  - name: id
    type: uuid
    primary: true
  - name: total
    type: decimal
relations:
  - name: user
    type: belongs_to
    entity: User
`
    );

    // Load graph
    graph = new Graph(join(testDir, ".graph"));
    await graph.load();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("definitionProvider", () => {
    it("should find entity definition from relation reference", () => {
      const doc = createDocument(
        "relations:\n  - name: user\n    entity: User",
        "file:///order.yaml"
      );
      const location = definitionProvider(doc, { line: 2, character: 12 }, graph, testDir);
      expect(location).not.toBeNull();
      expect(location?.uri).toContain("user.yaml");
    });

    it("should return null when already at definition", () => {
      const doc = createDocument("name: User", "file:///user.yaml");
      const location = definitionProvider(doc, { line: 0, character: 6 }, graph, testDir);
      expect(location).toBeNull();
    });

    it("should return null for non-entity words", () => {
      const doc = createDocument("description: Test");
      const location = definitionProvider(doc, { line: 0, character: 13 }, graph, testDir);
      expect(location).toBeNull();
    });
  });

  describe("findEntityDefinition", () => {
    it("should find entity file by name", () => {
      const location = findEntityDefinition("User", graph, testDir);
      expect(location).not.toBeNull();
      expect(location?.uri).toContain("user.yaml");
    });

    it("should return null for non-existent entity", () => {
      const location = findEntityDefinition("NonExistent", graph, testDir);
      expect(location).toBeNull();
    });
  });

  describe("findAllReferences", () => {
    it("should find all references to an entity", () => {
      const locations = findAllReferences("User", testDir);
      expect(locations.length).toBeGreaterThanOrEqual(2);
      // Should find the definition in user.yaml and reference in order.yaml
      const uris = locations.map((l) => l.uri);
      expect(uris.some((u) => u.includes("user.yaml"))).toBe(true);
      expect(uris.some((u) => u.includes("order.yaml"))).toBe(true);
    });

    it("should return empty array for entity with no references", () => {
      const locations = findAllReferences("NonExistent", testDir);
      expect(locations).toHaveLength(0);
    });
  });

  describe("diagnosticsProvider", () => {
    it("should report error for invalid entity reference", () => {
      const doc = createDocument(
        "name: Test\nfields:\n  - name: id\nrelations:\n  - entity: InvalidEntity"
      );
      const diagnostics = diagnosticsProvider(doc, graph);
      expect(diagnostics.length).toBeGreaterThan(0);
      const invalidEntityDiag = diagnostics.find((d) =>
        d.message.includes("InvalidEntity")
      );
      expect(invalidEntityDiag).toBeDefined();
    });

    it("should suggest similar entity names", () => {
      const doc = createDocument(
        "name: Test\nfields:\n  - name: id\nrelations:\n  - entity: Uesr"
      );
      const diagnostics = diagnosticsProvider(doc, graph);
      const typodiag = diagnostics.find((d) => d.message.includes("Did you mean"));
      expect(typodiag).toBeDefined();
      expect(typodiag?.message).toContain("User");
    });

    it("should report missing name field", () => {
      const doc = createDocument("fields:\n  - name: id");
      const diagnostics = diagnosticsProvider(doc, graph);
      const nameDiag = diagnostics.find((d) => d.message.includes("name"));
      expect(nameDiag).toBeDefined();
    });

    it("should report missing fields", () => {
      const doc = createDocument("name: Test");
      const diagnostics = diagnosticsProvider(doc, graph);
      const fieldsDiag = diagnostics.find((d) => d.message.includes("fields"));
      expect(fieldsDiag).toBeDefined();
    });

    it("should report invalid YAML", () => {
      const doc = createDocument("invalid: [yaml: [broken");
      const diagnostics = diagnosticsProvider(doc, graph);
      const yamlDiag = diagnostics.find((d) => d.message.includes("Invalid YAML"));
      expect(yamlDiag).toBeDefined();
    });
  });

  describe("hoverProvider", () => {
    it("should show entity info on hover", () => {
      const doc = createDocument(
        "relations:\n  - entity: User"
      );
      const hover = hoverProvider(doc, { line: 1, character: 14 }, graph);
      expect(hover).not.toBeNull();
      expect(hover?.contents).toBeDefined();
      if ("value" in hover!.contents) {
        expect(hover!.contents.value).toContain("User");
        expect(hover!.contents.value).toContain("Fields");
      }
    });

    it("should return null for non-entity words", () => {
      const doc = createDocument("description: something");
      const hover = hoverProvider(doc, { line: 0, character: 13 }, graph);
      expect(hover).toBeNull();
    });

    it("should include entity description in hover", () => {
      const doc = createDocument("entity: User");
      const hover = hoverProvider(doc, { line: 0, character: 8 }, graph);
      expect(hover).not.toBeNull();
      if (hover && "value" in hover.contents) {
        expect(hover.contents.value).toContain("user in the system");
      }
    });

    it("should show relations in hover", () => {
      const doc = createDocument("entity: User");
      const hover = hoverProvider(doc, { line: 0, character: 8 }, graph);
      expect(hover).not.toBeNull();
      if (hover && "value" in hover.contents) {
        expect(hover.contents.value).toContain("Relations");
        expect(hover.contents.value).toContain("orders");
      }
    });
  });
});

// Import afterEach for cleanup
import { afterEach } from "vitest";
