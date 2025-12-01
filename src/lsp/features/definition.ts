import type { Position } from "vscode-languageserver-textdocument";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { Location } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { Graph } from "../../graph/graph.js";
import { getWordAtPosition, getYamlContext } from "../yaml-utils.js";

/**
 * Provide go-to-definition for entity references
 */
export function definitionProvider(
  document: TextDocument,
  position: Position,
  graph: Graph,
  workspaceRoot: string
): Location | null {
  const context = getYamlContext(document, position);
  const word = getWordAtPosition(document, position);

  if (!word) return null;

  // Case 1: On entity: SomeEntity in relations
  if (context.key === "entity") {
    return findEntityDefinition(word, graph, workspaceRoot);
  }

  // Case 2: On name field at top level - this IS the definition
  if (context.key === "name" && context.parentKey === null) {
    // Already at definition
    return null;
  }

  // Case 3: Could be on an entity name anywhere else
  // Try to find if this word matches an entity name
  const entity = graph.getEntity(word);
  if (entity) {
    return findEntityDefinition(word, graph, workspaceRoot);
  }

  return null;
}

/**
 * Find the location of an entity's definition file
 */
export function findEntityDefinition(
  entityName: string,
  graph: Graph,
  workspaceRoot: string
): Location | null {
  const entity = graph.getEntity(entityName);
  if (!entity) return null;

  // Entity files are typically named lowercase
  const possiblePaths = [
    join(workspaceRoot, ".graph", "entities", `${entityName.toLowerCase()}.yaml`),
    join(workspaceRoot, ".graph", "entities", `${entityName}.yaml`),
  ];

  for (const filePath of possiblePaths) {
    if (existsSync(filePath)) {
      return {
        uri: URI.file(filePath).toString(),
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
      };
    }
  }

  return null;
}
