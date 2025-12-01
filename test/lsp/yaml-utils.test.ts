import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  getWordAtPosition,
  getWordRangeAtPosition,
  getYamlContext,
  findAllEntityReferences,
  getEntityNameFromDocument,
  isEntityReference,
} from "../../src/lsp/yaml-utils.js";

function createDocument(content: string): TextDocument {
  return TextDocument.create("file:///test.yaml", "yaml", 1, content);
}

describe("getWordAtPosition", () => {
  it("should return the word at cursor position", () => {
    const doc = createDocument("name: User");
    expect(getWordAtPosition(doc, { line: 0, character: 6 })).toBe("User");
    expect(getWordAtPosition(doc, { line: 0, character: 7 })).toBe("User");
    expect(getWordAtPosition(doc, { line: 0, character: 9 })).toBe("User");
  });

  it("should return null when cursor is not on a word", () => {
    const doc = createDocument("name: User");
    expect(getWordAtPosition(doc, { line: 0, character: 4 })).toBe("name");
    expect(getWordAtPosition(doc, { line: 0, character: 5 })).toBe(null);
  });

  it("should handle multi-line documents", () => {
    const doc = createDocument("name: User\ndescription: Test");
    expect(getWordAtPosition(doc, { line: 1, character: 13 })).toBe("Test");
  });
});

describe("getWordRangeAtPosition", () => {
  it("should return the correct range for a word", () => {
    const doc = createDocument("name: User");
    const range = getWordRangeAtPosition(doc, { line: 0, character: 7 });
    expect(range).toEqual({
      start: { line: 0, character: 6 },
      end: { line: 0, character: 10 },
    });
  });

  it("should return null when not on a word", () => {
    const doc = createDocument("name: ");
    const range = getWordRangeAtPosition(doc, { line: 0, character: 5 });
    expect(range).toBe(null);
  });
});

describe("getYamlContext", () => {
  it("should identify key-value pairs", () => {
    const doc = createDocument("name: User");
    const context = getYamlContext(doc, { line: 0, character: 6 });
    expect(context.key).toBe("name");
    expect(context.value).toBe("User");
    expect(context.parentKey).toBe(null);
  });

  it("should identify parent key from indentation", () => {
    // The implementation looks for parent key with less indentation
    // Note: list items with `-` prefix are handled specially
    const doc = createDocument("relations:\n    entity: Order");
    const context = getYamlContext(doc, { line: 1, character: 12 });
    expect(context.key).toBe("entity");
    expect(context.value).toBe("Order");
    expect(context.parentKey).toBe("relations");
  });

  it("should return nulls for non-key-value lines", () => {
    const doc = createDocument("---");
    const context = getYamlContext(doc, { line: 0, character: 0 });
    expect(context.key).toBe(null);
    expect(context.value).toBe(null);
    expect(context.parentKey).toBe(null);
  });
});

describe("findAllEntityReferences", () => {
  it("should find entity name at top level", () => {
    const doc = createDocument("name: User\nfields:\n  - name: id");
    const refs = findAllEntityReferences(doc);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.name).toBe("User");
    expect(refs[0]?.type).toBe("entity-name");
  });

  it("should find entity references in relations", () => {
    const doc = createDocument(
      "name: User\nrelations:\n  - name: orders\n    entity: Order"
    );
    const refs = findAllEntityReferences(doc);
    expect(refs).toHaveLength(2);
    expect(refs[0]?.name).toBe("User");
    expect(refs[0]?.type).toBe("entity-name");
    expect(refs[1]?.name).toBe("Order");
    expect(refs[1]?.type).toBe("relation-entity");
  });

  it("should return empty array for document without entities", () => {
    const doc = createDocument("some: value\nother: thing");
    const refs = findAllEntityReferences(doc);
    expect(refs).toHaveLength(0);
  });
});

describe("getEntityNameFromDocument", () => {
  it("should extract entity name from valid YAML", () => {
    const doc = createDocument("name: User\nfields:\n  - name: id");
    expect(getEntityNameFromDocument(doc)).toBe("User");
  });

  it("should return null for document without name field", () => {
    const doc = createDocument("fields:\n  - name: id");
    expect(getEntityNameFromDocument(doc)).toBe(null);
  });

  it("should return null for invalid YAML", () => {
    const doc = createDocument("invalid: [yaml: [");
    expect(getEntityNameFromDocument(doc)).toBe(null);
  });
});

describe("isEntityReference", () => {
  it("should return true for entity in relations context", () => {
    // The isEntityReference function checks for specific YAML contexts
    // It requires the parentKey to be "relations" and key to be "entity"
    const doc = createDocument("relations:\n    entity: Order");
    expect(isEntityReference(doc, { line: 1, character: 12 })).toBe(true);
  });

  it("should return true for top-level name", () => {
    const doc = createDocument("name: User");
    expect(isEntityReference(doc, { line: 0, character: 6 })).toBe(true);
  });

  it("should return false for other fields", () => {
    const doc = createDocument("description: Test user");
    expect(isEntityReference(doc, { line: 0, character: 13 })).toBe(false);
  });
});
