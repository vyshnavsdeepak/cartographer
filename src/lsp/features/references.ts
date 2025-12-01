import type { Position } from "vscode-languageserver-textdocument";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Location } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { join } from "node:path";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { Graph } from "../../graph/graph.js";
import { getWordAtPosition, findAllEntityReferences, getEntityNameFromDocument } from "../yaml-utils.js";

/**
 * Provide find-all-references for entity names
 */
export function referencesProvider(
  document: TextDocument,
  position: Position,
  graph: Graph,
  workspaceRoot: string
): Location[] | null {
  const word = getWordAtPosition(document, position);
  if (!word) return null;

  // Check if this word is an entity name
  const entity = graph.getEntity(word);
  if (!entity) return null;

  return findAllReferences(word, workspaceRoot);
}

/**
 * Find all references to an entity name across all entity files
 */
export function findAllReferences(entityName: string, workspaceRoot: string): Location[] {
  const locations: Location[] = [];
  const entitiesDir = join(workspaceRoot, ".graph", "entities");

  if (!existsSync(entitiesDir)) {
    return locations;
  }

  // Scan all entity files
  const files = readdirSync(entitiesDir).filter((f) => f.endsWith(".yaml"));

  for (const file of files) {
    const filePath = join(entitiesDir, file);
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // Find references in this file
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      if (!line) continue;

      // Check for entity name definition (name: EntityName)
      const nameMatch = line.match(/^name:\s*(\w+)/);
      if (nameMatch && nameMatch[1] === entityName) {
        const startChar = line.indexOf(entityName);
        locations.push({
          uri: URI.file(filePath).toString(),
          range: {
            start: { line: lineNum, character: startChar },
            end: { line: lineNum, character: startChar + entityName.length },
          },
        });
        continue;
      }

      // Check for entity references in relations (entity: EntityName)
      const entityMatch = line.match(/entity:\s*(\w+)/);
      if (entityMatch && entityMatch[1] === entityName) {
        const entityKeyIndex = line.indexOf("entity:");
        const startChar = line.indexOf(entityName, entityKeyIndex);
        locations.push({
          uri: URI.file(filePath).toString(),
          range: {
            start: { line: lineNum, character: startChar },
            end: { line: lineNum, character: startChar + entityName.length },
          },
        });
      }
    }
  }

  return locations;
}
