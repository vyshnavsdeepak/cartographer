import { readFile, writeFile } from "node:fs/promises";
import type { AnchorCandidate } from "./matcher.js";

/**
 * Result of inserting an anchor
 */
export interface InsertResult {
  anchor: string;
  file: string;
  line: number;
  success: boolean;
  error?: string;
}

/**
 * Insert an anchor comment before the specified line in a file
 */
export async function insertAnchor(
  candidate: AnchorCandidate
): Promise<InsertResult> {
  try {
    const content = await readFile(candidate.file, "utf-8");
    const lines = content.split("\n");

    // Get the indentation of the target line
    const targetLine = lines[candidate.line];
    if (targetLine === undefined) {
      return {
        anchor: candidate.anchor,
        file: candidate.file,
        line: candidate.line,
        success: false,
        error: `Line ${candidate.line} does not exist in file`,
      };
    }

    const indentMatch = targetLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : "";

    // Create the anchor comment
    const anchorComment = `${indent}// ${candidate.anchor}`;

    // Insert the anchor comment before the target line
    lines.splice(candidate.line, 0, anchorComment);

    // Write back to file
    await writeFile(candidate.file, lines.join("\n"));

    return {
      anchor: candidate.anchor,
      file: candidate.file,
      line: candidate.line,
      success: true,
    };
  } catch (err) {
    return {
      anchor: candidate.anchor,
      file: candidate.file,
      line: candidate.line,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Insert multiple anchors into files
 * Note: Must process in reverse order by line number within same file
 * to avoid line number shifts
 */
export async function insertAnchors(
  candidates: AnchorCandidate[]
): Promise<InsertResult[]> {
  // Group by file
  const byFile = new Map<string, AnchorCandidate[]>();
  for (const candidate of candidates) {
    const existing = byFile.get(candidate.file) || [];
    existing.push(candidate);
    byFile.set(candidate.file, existing);
  }

  const results: InsertResult[] = [];

  for (const [file, fileCandidates] of byFile) {
    // Sort by line number descending (insert from bottom to top)
    const sorted = [...fileCandidates].sort((a, b) => b.line - a.line);

    // Read file once
    let content: string;
    try {
      content = await readFile(file, "utf-8");
    } catch (err) {
      for (const candidate of sorted) {
        results.push({
          anchor: candidate.anchor,
          file: candidate.file,
          line: candidate.line,
          success: false,
          error: `Could not read file: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      continue;
    }

    const lines = content.split("\n");

    // Insert all anchors (from bottom to top to preserve line numbers)
    for (const candidate of sorted) {
      const targetLine = lines[candidate.line];
      if (targetLine === undefined) {
        results.push({
          anchor: candidate.anchor,
          file: candidate.file,
          line: candidate.line,
          success: false,
          error: `Line ${candidate.line} does not exist in file`,
        });
        continue;
      }

      // Check if anchor already exists
      if (lines.some((l) => l.includes(candidate.anchor))) {
        results.push({
          anchor: candidate.anchor,
          file: candidate.file,
          line: candidate.line,
          success: false,
          error: "Anchor already exists in file",
        });
        continue;
      }

      const indentMatch = targetLine.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : "";
      const anchorComment = `${indent}// ${candidate.anchor}`;

      lines.splice(candidate.line, 0, anchorComment);

      results.push({
        anchor: candidate.anchor,
        file: candidate.file,
        line: candidate.line,
        success: true,
      });
    }

    // Write file once with all changes
    try {
      await writeFile(file, lines.join("\n"));
    } catch (err) {
      // Mark all as failed if write fails
      for (const result of results) {
        if (result.file === file && result.success) {
          result.success = false;
          result.error = `Could not write file: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    }
  }

  return results;
}

/**
 * Preview what would be inserted without actually modifying files
 */
export function previewInsertions(
  candidates: AnchorCandidate[]
): Map<string, string[]> {
  const previews = new Map<string, string[]>();

  for (const candidate of candidates) {
    const existing = previews.get(candidate.file) || [];
    existing.push(
      `Line ${candidate.line + 1}: // ${candidate.anchor} (${candidate.matchType}, ${Math.round(candidate.confidence * 100)}% confidence)`
    );
    previews.set(candidate.file, existing);
  }

  return previews;
}
