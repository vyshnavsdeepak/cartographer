import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ResolvedAnchor } from "#types";

const ANCHOR_PREFIX = "@graph:";

// Matches: // @graph:Entity.category or # @graph:Entity.category
const ANCHOR_REGEX = new RegExp(
  `(?:\\/\\/|#)\\s*(${ANCHOR_PREFIX.replace(":", "\\:")}[\\w.]+)`,
  "i"
);

// Matches: // @end:Entity.category
const END_REGEX = /(?:\/\/|#)\s*@end:([\w.]+)/i;

/**
 * Scan a file for anchor comments and extract their content
 */
export async function scanFile(filePath: string): Promise<ResolvedAnchor[]> {
  const absolutePath = resolve(filePath);
  const content = await readFile(absolutePath, "utf-8");
  const lines = content.split("\n");
  const anchors: ResolvedAnchor[] = [];

  for (const [i, line] of lines.entries()) {
    const match = line.match(ANCHOR_REGEX);

    if (match?.[1]) {
      const anchorName = match[1];
      const { content, endLine } = extractContent(lines, i, anchorName);

      anchors.push({
        anchor: anchorName,
        file: absolutePath,
        line: i + 1, // 1-indexed
        endLine: endLine + 1,
        content,
      });
    }
  }

  return anchors;
}

/**
 * Extract content from anchor line until end marker or next anchor
 */
function extractContent(
  lines: string[],
  startIndex: number,
  anchorName: string
): { content: string; endLine: number } {
  const contentLines: string[] = [];
  const entityCategory = anchorName.replace(ANCHOR_PREFIX, "");
  let endLine = startIndex;

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) {
      throw new Error(`Unexpected: line ${i} is undefined in file`);
    }

    // Check for explicit end marker
    const endMatch = line.match(END_REGEX);
    if (endMatch?.[1] === entityCategory) {
      endLine = i;
      break;
    }

    // Check for next anchor (implicit end)
    if (ANCHOR_REGEX.test(line)) {
      endLine = i - 1;
      break;
    }

    contentLines.push(line);
    endLine = i;
  }

  // Trim empty lines from start and end
  while (contentLines.length > 0 && contentLines[0] === "") {
    contentLines.shift();
  }
  while (contentLines.length > 0 && contentLines[contentLines.length - 1] === "") {
    contentLines.pop();
  }

  return {
    content: contentLines.join("\n"),
    endLine,
  };
}
