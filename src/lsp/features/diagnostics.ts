import { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { parse as parseYaml } from "yaml";
import { Graph } from "../../graph/graph.js";
import { findAllEntityReferences } from "../yaml-utils.js";

/**
 * Provide diagnostics for entity YAML files
 */
export function diagnosticsProvider(document: TextDocument, graph: Graph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const text = document.getText();
  const entityNames = graph.getAllEntities().map((e) => e.name);

  // Find all entity references and validate them
  const references = findAllEntityReferences(document);

  for (const ref of references) {
    // Skip the entity name definition itself
    if (ref.type === "entity-name") {
      continue;
    }

    // Validate relation entity references
    if (ref.type === "relation-entity") {
      if (!entityNames.includes(ref.name)) {
        // Find similar entity names for suggestion
        const suggestion = findSimilarEntity(ref.name, entityNames);

        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: ref.range,
          message: suggestion
            ? `Entity '${ref.name}' not found. Did you mean '${suggestion}'?`
            : `Entity '${ref.name}' not found.`,
          source: "cartographer",
        });
      }
    }
  }

  // Parse and validate YAML structure
  try {
    const parsed = parseYaml(text) as Record<string, unknown>;

    // Check for required fields
    if (!parsed.name) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        message: "Missing required field 'name'",
        source: "cartographer",
      });
    }

    if (!parsed.fields || !Array.isArray(parsed.fields) || parsed.fields.length === 0) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        message: "Missing required field 'fields' (must have at least one field)",
        source: "cartographer",
      });
    }

    // Validate relations if present
    if (parsed.relations && Array.isArray(parsed.relations)) {
      for (const relation of parsed.relations) {
        if (typeof relation === "object" && relation !== null) {
          const rel = relation as Record<string, unknown>;

          // Check for circular self-references that might be unintentional
          if (rel.entity === parsed.name && rel.type === "belongs_to") {
            const lineNum = findLineNumber(text, `entity: ${rel.entity}`);
            if (lineNum !== -1) {
              const lines = text.split("\n");
              const lineText = lines[lineNum];
              const lineLength = lineText ? lineText.length : 1;
              diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                  start: { line: lineNum, character: 0 },
                  end: { line: lineNum, character: lineLength },
                },
                message: `Self-referential 'belongs_to' relation detected. Is this intentional?`,
                source: "cartographer",
              });
            }
          }
        }
      }
    }
  } catch (error) {
    // YAML parse error
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      message: `Invalid YAML: ${error instanceof Error ? error.message : "Unknown error"}`,
      source: "cartographer",
    });
  }

  return diagnostics;
}

/**
 * Find the line number containing a string
 */
function findLineNumber(text: string, search: string): number {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && line.includes(search)) {
      return i;
    }
  }
  return -1;
}

/**
 * Find a similar entity name using Levenshtein distance
 */
function findSimilarEntity(name: string, entityNames: string[]): string | null {
  const nameLower = name.toLowerCase();
  let bestMatch: string | null = null;
  let bestDistance = Infinity;

  for (const entityName of entityNames) {
    const distance = levenshteinDistance(nameLower, entityName.toLowerCase());
    if (distance < bestDistance && distance <= 3) {
      // Max 3 edits to suggest
      bestDistance = distance;
      bestMatch = entityName;
    }
  }

  return bestMatch;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  // Create matrix with proper initialization
  const matrix: number[][] = Array.from({ length: b.length + 1 }, () =>
    Array.from({ length: a.length + 1 }, () => 0)
  );

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i]![0] = i;
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    const currentRow = matrix[i]!;
    const prevRow = matrix[i - 1]!;
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        currentRow[j] = prevRow[j - 1]!;
      } else {
        currentRow[j] = Math.min(
          prevRow[j - 1]! + 1, // substitution
          currentRow[j - 1]! + 1, // insertion
          prevRow[j]! + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}
