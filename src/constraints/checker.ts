import { readFile } from "node:fs/promises";
import { dirname, relative, basename } from "node:path";
import { existsSync } from "node:fs";
import type {
  Entity,
  Constraint,
  ImportRuleCheck,
  FileRuleCheck,
  ColocationRuleCheck,
  ResolvedAnchor,
} from "#types";

/**
 * Result of checking a single constraint
 */
export interface ConstraintResult {
  entity: string;
  rule: string;
  description: string | undefined;
  passed: boolean;
  violations: ConstraintViolation[];
}

/**
 * A single violation of a constraint
 */
export interface ConstraintViolation {
  file: string;
  line?: number;
  message: string;
}

/**
 * Parse import statements from a TypeScript file
 */
export async function parseImports(
  filePath: string
): Promise<Map<string, number>> {
  const imports = new Map<string, number>();

  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Match various import patterns
      // import X from "module"
      // import { X } from "module"
      // import * as X from "module"
      // import "module"
      const importMatch = line.match(
        /^\s*import\s+(?:(?:\{[^}]*\}|[^'"]*)\s+from\s+)?['"]([^'"]+)['"]/
      );
      if (importMatch && importMatch[1]) {
        imports.set(importMatch[1], i + 1);
      }

      // Also match require() statements
      const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
      if (requireMatch && requireMatch[1]) {
        imports.set(requireMatch[1], i + 1);
      }
    }
  } catch {
    // File couldn't be read
  }

  return imports;
}

/**
 * Check if a file path matches a glob pattern
 */
export function matchesPattern(
  filePath: string,
  pattern: string,
  baseDir: string
): boolean {
  const relPath = relative(baseDir, filePath);

  // Handle simple patterns
  if (pattern.includes("*")) {
    // Convert glob to regex
    // ** matches zero or more path segments (including empty)
    // * matches any characters within a single path segment
    const regexPattern = pattern
      .replace(/\./g, "\\.")
      .replace(/\*\*\//g, "(?:.*\\/)?") // **/ matches optional path segments
      .replace(/\*\*/g, ".*") // ** at end matches anything
      .replace(/\*/g, "[^/]*"); // * matches within segment
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(relPath);
  }

  return relPath.startsWith(pattern) || filePath.includes(pattern);
}

/**
 * Check import rule constraints
 */
export async function checkImportRule(
  check: ImportRuleCheck,
  anchor: ResolvedAnchor,
  allFiles: string[],
  baseDir: string
): Promise<ConstraintViolation[]> {
  const violations: ConstraintViolation[] = [];
  const anchorFile = anchor.file;

  for (const file of allFiles) {
    if (file === anchorFile) continue;

    const imports = await parseImports(file);

    // Check if this file imports the anchor's file
    const anchorRelPath = relative(dirname(file), anchorFile).replace(
      /\.tsx?$/,
      ""
    );
    const anchorBaseName = basename(anchorFile, ".ts").replace(".tsx", "");

    let importsAnchor = false;
    let importLine = 0;

    for (const [importPath, line] of imports) {
      // Check various import patterns
      if (
        importPath === anchorRelPath ||
        importPath === `./${anchorRelPath}` ||
        importPath.endsWith(anchorBaseName) ||
        importPath.includes(anchorBaseName)
      ) {
        importsAnchor = true;
        importLine = line;
        break;
      }
    }

    if (!importsAnchor) continue;

    const relFile = relative(baseDir, file);

    // Check not_imported_by
    if (check.not_imported_by) {
      if (matchesPattern(file, check.not_imported_by, baseDir)) {
        violations.push({
          file: relFile,
          line: importLine,
          message: `File matches disallowed pattern "${check.not_imported_by}"`,
        });
      }
    }

    // Check allowed_importers
    if (check.allowed_importers && check.allowed_importers.length > 0) {
      const isAllowed = check.allowed_importers.some((pattern) =>
        matchesPattern(file, pattern, baseDir)
      );
      if (!isAllowed) {
        violations.push({
          file: relFile,
          line: importLine,
          message: `File not in allowed importers list`,
        });
      }
    }
  }

  return violations;
}

/**
 * Check file-level import constraints
 */
export async function checkFileRule(
  check: FileRuleCheck,
  allFiles: string[],
  baseDir: string
): Promise<ConstraintViolation[]> {
  const violations: ConstraintViolation[] = [];

  // Find files matching the pattern
  const matchingFiles = allFiles.filter((file) =>
    matchesPattern(file, check.files, baseDir)
  );

  for (const file of matchingFiles) {
    const imports = await parseImports(file);
    const relFile = relative(baseDir, file);

    // Check cannot_import
    if (check.cannot_import) {
      for (const disallowed of check.cannot_import) {
        for (const [importPath, line] of imports) {
          if (
            importPath === disallowed ||
            importPath.startsWith(disallowed) ||
            importPath.includes(`/${disallowed}`)
          ) {
            violations.push({
              file: relFile,
              line,
              message: `File imports disallowed module "${disallowed}"`,
            });
          }
        }
      }
    }

    // Check must_import
    if (check.must_import) {
      for (const required of check.must_import) {
        let found = false;
        for (const importPath of imports.keys()) {
          if (
            importPath === required ||
            importPath.startsWith(required) ||
            importPath.includes(`/${required}`)
          ) {
            found = true;
            break;
          }
        }
        if (!found) {
          violations.push({
            file: relFile,
            message: `File missing required import "${required}"`,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Check co-location constraints
 */
export async function checkColocationRule(
  check: ColocationRuleCheck,
  anchor: ResolvedAnchor,
  baseDir: string
): Promise<ConstraintViolation[]> {
  const violations: ConstraintViolation[] = [];
  const anchorDir = dirname(anchor.file);
  const anchorBase = basename(anchor.file).replace(/\.(ts|tsx)$/, "");

  // Replace wildcards in sibling pattern with the anchor file basename
  const siblingPattern = check.must_have_sibling.replace("*", anchorBase);
  const expectedSibling = `${anchorDir}/${siblingPattern}`;

  // Check for common extensions
  const extensions = [".ts", ".tsx", ".js", ".jsx"];
  let found = false;

  if (siblingPattern.includes(".")) {
    // Has extension, check directly
    found = existsSync(expectedSibling);
  } else {
    // No extension, try common ones
    for (const ext of extensions) {
      if (existsSync(`${expectedSibling}${ext}`)) {
        found = true;
        break;
      }
    }
  }

  if (!found) {
    violations.push({
      file: relative(baseDir, anchor.file),
      message: `Missing sibling file matching pattern "${check.must_have_sibling}"`,
    });
  }

  return violations;
}

/**
 * Check all constraints for an entity
 */
export async function checkConstraints(
  entity: Entity,
  anchors: Map<string, ResolvedAnchor>,
  allFiles: string[],
  baseDir: string
): Promise<ConstraintResult[]> {
  const results: ConstraintResult[] = [];

  if (!entity.constraints || entity.constraints.length === 0) {
    return results;
  }

  for (const constraint of entity.constraints) {
    const violations: ConstraintViolation[] = [];

    for (const check of constraint.check) {
      // Determine the type of check based on properties
      if ("anchor" in check && "not_imported_by" in check) {
        // Import rule check
        const typedCheck = check as ImportRuleCheck;
        const anchor = anchors.get(typedCheck.anchor);
        if (anchor) {
          const checkViolations = await checkImportRule(
            typedCheck,
            anchor,
            allFiles,
            baseDir
          );
          violations.push(...checkViolations);
        } else {
          violations.push({
            file: "",
            message: `Anchor "${typedCheck.anchor}" not found in code - ensure the anchor comment exists`,
          });
        }
      } else if ("anchor" in check && "allowed_importers" in check) {
        // Import rule with allowed importers
        const typedCheck = check as ImportRuleCheck;
        const anchor = anchors.get(typedCheck.anchor);
        if (anchor) {
          const checkViolations = await checkImportRule(
            typedCheck,
            anchor,
            allFiles,
            baseDir
          );
          violations.push(...checkViolations);
        } else {
          violations.push({
            file: "",
            message: `Anchor "${typedCheck.anchor}" not found in code - ensure the anchor comment exists`,
          });
        }
      } else if ("files" in check) {
        // File rule check
        const checkViolations = await checkFileRule(
          check as FileRuleCheck,
          allFiles,
          baseDir
        );
        violations.push(...checkViolations);
      } else if ("must_have_sibling" in check) {
        // Colocation rule check
        const typedCheck = check as ColocationRuleCheck;
        const anchor = anchors.get(typedCheck.anchor);
        if (anchor) {
          const checkViolations = await checkColocationRule(
            typedCheck,
            anchor,
            baseDir
          );
          violations.push(...checkViolations);
        } else {
          // Anchor not found - this is a constraint configuration issue
          violations.push({
            file: "",
            message: `Anchor "${typedCheck.anchor}" not found in code - ensure the anchor comment exists`,
          });
        }
      }
    }

    results.push({
      entity: entity.name,
      rule: constraint.rule,
      description: constraint.description,
      passed: violations.length === 0,
      violations,
    });
  }

  return results;
}

/**
 * Format constraint results for CLI output
 */
export function formatConstraintResults(results: ConstraintResult[]): {
  passed: number;
  failed: number;
  summary: string[];
} {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const summary: string[] = [];

  for (const result of results) {
    if (!result.passed) {
      summary.push(
        `  [${result.entity}] ${result.rule}${result.description ? ` - ${result.description}` : ""}`
      );
      for (const violation of result.violations) {
        summary.push(
          `    ${violation.file}${violation.line ? `:${violation.line}` : ""}`
        );
        summary.push(`      ${violation.message}`);
      }
    }
  }

  return { passed, failed, summary };
}
