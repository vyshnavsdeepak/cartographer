import type { Position, Range } from "vscode-languageserver-textdocument";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parse as parseYaml } from "yaml";

export interface EntityReference {
  name: string;
  range: Range;
  type: "entity-name" | "relation-entity" | "constraint-entity";
}

/**
 * Get the word at a position in the document
 */
export function getWordAtPosition(document: TextDocument, position: Position): string | null {
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  });

  // Find word boundaries
  let start = position.character;
  let end = position.character;

  while (start > 0 && /[\w]/.test(line.charAt(start - 1))) {
    start--;
  }

  while (end < line.length && /[\w]/.test(line.charAt(end))) {
    end++;
  }

  if (start === end) return null;

  return line.substring(start, end);
}

/**
 * Get the range of a word at a position
 */
export function getWordRangeAtPosition(document: TextDocument, position: Position): Range | null {
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  });

  let start = position.character;
  let end = position.character;

  while (start > 0 && /[\w]/.test(line.charAt(start - 1))) {
    start--;
  }

  while (end < line.length && /[\w]/.test(line.charAt(end))) {
    end++;
  }

  if (start === end) return null;

  return {
    start: { line: position.line, character: start },
    end: { line: position.line, character: end },
  };
}

/**
 * Find the context at a position (what YAML key we're in)
 */
export function getYamlContext(document: TextDocument, position: Position): {
  key: string | null;
  parentKey: string | null;
  value: string | null;
} {
  const text = document.getText();
  const lines = text.split("\n");
  const line = lines[position.line];

  if (!line) {
    return { key: null, parentKey: null, value: null };
  }

  // Simple regex-based context detection
  // Check if we're on a line like "  entity: User"
  const keyValueMatch = line.match(/^\s*(\w+):\s*(.*)$/);
  if (keyValueMatch) {
    const key = keyValueMatch[1] ?? null;
    const rawValue = keyValueMatch[2];

    // Find parent key by looking at indentation
    const currentIndent = line.search(/\S/);
    let parentKey: string | null = null;

    for (let i = position.line - 1; i >= 0; i--) {
      const prevLine = lines[i];
      if (!prevLine) continue;
      const prevIndent = prevLine.search(/\S/);
      if (prevIndent >= 0 && prevIndent < currentIndent) {
        const parentMatch = prevLine.match(/^\s*-?\s*(\w+):/);
        if (parentMatch && parentMatch[1]) {
          parentKey = parentMatch[1];
          break;
        }
      }
    }

    return { key, parentKey, value: rawValue?.trim() || null };
  }

  return { key: null, parentKey: null, value: null };
}

/**
 * Check if position is on an entity reference
 */
export function isEntityReference(document: TextDocument, position: Position): boolean {
  const context = getYamlContext(document, position);

  // entity: SomeEntity in relations
  if (context.key === "entity" && context.parentKey === "relations") {
    return true;
  }

  // name: EntityName at top level (entity definition itself)
  if (context.key === "name" && context.parentKey === null) {
    return true;
  }

  return false;
}

/**
 * Get the entity name at position if it's an entity reference
 */
export function getEntityNameAtPosition(document: TextDocument, position: Position): string | null {
  if (!isEntityReference(document, position)) {
    return null;
  }

  return getWordAtPosition(document, position);
}

/**
 * Find all entity references in a document
 */
export function findAllEntityReferences(document: TextDocument): EntityReference[] {
  const references: EntityReference[] = [];
  const text = document.getText();
  const lines = text.split("\n");

  let inRelations = false;
  let currentIndent = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    if (!line) continue;

    const trimmed = line.trim();

    // Track if we're in the relations section
    if (trimmed.startsWith("relations:")) {
      inRelations = true;
      currentIndent = line.search(/\S/);
      continue;
    }

    // Check if we've exited relations section
    if (inRelations) {
      const lineIndent = line.search(/\S/);
      if (lineIndent >= 0 && lineIndent <= currentIndent && !trimmed.startsWith("-")) {
        inRelations = false;
      }
    }

    // Top-level name field (entity name definition)
    const nameMatch = line.match(/^name:\s*(\w+)/);
    if (nameMatch) {
      const name = nameMatch[1];
      if (name) {
        const startChar = line.indexOf(name);
        references.push({
          name,
          range: {
            start: { line: lineNum, character: startChar },
            end: { line: lineNum, character: startChar + name.length },
          },
          type: "entity-name",
        });
      }
      continue;
    }

    // Entity reference in relations
    if (inRelations) {
      const entityMatch = line.match(/entity:\s*(\w+)/);
      if (entityMatch) {
        const name = entityMatch[1];
        if (name) {
          const entityKeyIndex = line.indexOf("entity:");
          const startChar = line.indexOf(name, entityKeyIndex);
          references.push({
            name,
            range: {
              start: { line: lineNum, character: startChar },
              end: { line: lineNum, character: startChar + name.length },
            },
            type: "relation-entity",
          });
        }
      }
    }
  }

  return references;
}

/**
 * Parse YAML document and extract entity name
 */
export function getEntityNameFromDocument(document: TextDocument): string | null {
  try {
    const text = document.getText();
    const parsed = parseYaml(text) as { name?: string } | null;
    return parsed?.name || null;
  } catch {
    return null;
  }
}
