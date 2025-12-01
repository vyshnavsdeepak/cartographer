import type { Position } from "vscode-languageserver-textdocument";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Hover, MarkupKind } from "vscode-languageserver";
import { Graph } from "../../graph/graph.js";
import { getWordAtPosition, getWordRangeAtPosition } from "../yaml-utils.js";

/**
 * Provide hover information for entity references
 */
export function hoverProvider(
  document: TextDocument,
  position: Position,
  graph: Graph
): Hover | null {
  const word = getWordAtPosition(document, position);
  if (!word) return null;

  // Check if this word is an entity name
  const entity = graph.getEntity(word);
  if (!entity) return null;

  const range = getWordRangeAtPosition(document, position);

  // Build hover content
  const lines: string[] = [];

  // Entity name and description
  lines.push(`### ${entity.name}`);
  if (entity.description) {
    lines.push("");
    lines.push(entity.description);
  }

  // Fields summary
  if (entity.fields && entity.fields.length > 0) {
    lines.push("");
    lines.push("**Fields:**");
    for (const field of entity.fields.slice(0, 5)) {
      const markers: string[] = [];
      if (field.primary) markers.push("PK");
      if (field.unique) markers.push("unique");
      if (field.nullable) markers.push("nullable");
      const markerStr = markers.length > 0 ? ` (${markers.join(", ")})` : "";
      lines.push(`- \`${field.name}\`: ${field.type}${markerStr}`);
    }
    if (entity.fields.length > 5) {
      lines.push(`- *...and ${entity.fields.length - 5} more*`);
    }
  }

  // Relations summary
  if (entity.relations && entity.relations.length > 0) {
    lines.push("");
    lines.push("**Relations:**");
    for (const relation of entity.relations.slice(0, 3)) {
      lines.push(`- \`${relation.name}\`: ${relation.type} → ${relation.entity}`);
    }
    if (entity.relations.length > 3) {
      lines.push(`- *...and ${entity.relations.length - 3} more*`);
    }
  }

  const hover: Hover = {
    contents: {
      kind: MarkupKind.Markdown,
      value: lines.join("\n"),
    },
  };

  if (range) {
    hover.range = range;
  }

  return hover;
}
