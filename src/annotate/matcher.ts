import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Entity } from "#types";

/**
 * A candidate location where an anchor could be placed
 */
export interface AnchorCandidate {
  /** The anchor name, e.g., "@graph:User.model" */
  anchor: string;
  /** The entity this anchor belongs to */
  entity: string;
  /** The code_ref category (model, types, validation, etc.) */
  category: string;
  /** The file where the candidate was found */
  file: string;
  /** The line number where the anchor should be inserted (0-indexed) */
  line: number;
  /** Description of what was matched */
  matchType: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** The matched code identifier */
  identifier: string;
}

/**
 * Pattern matchers for different code_ref categories
 */
const PATTERNS = {
  // Match class definitions: class User { or export class User {
  classDefinition: /^(\s*)(export\s+)?(class)\s+(\w+)/,

  // Match interface definitions: interface User { or export interface User {
  interfaceDefinition: /^(\s*)(export\s+)?(interface)\s+(\w+)/,

  // Match type definitions: type User = or export type User =
  typeDefinition: /^(\s*)(export\s+)?(type)\s+(\w+)\s*=/,

  // Match Zod schemas: const UserSchema = z.object( or export const UserSchema = z.
  zodSchema: /^(\s*)(export\s+)?(const)\s+(\w+Schema)\s*=\s*z\./,

  // Match validation functions: const validateUser = or function validateUser
  validationFunction:
    /^(\s*)(export\s+)?(const|function)\s+(validate\w+|(\w+)Validator)/,

  // Match ORM decorators: @Entity() class User
  ormDecorator: /^(\s*)@(Entity|Table|Model)\s*\(/,
};

/** Partial candidate before full population */
type PartialCandidate = Omit<AnchorCandidate, "anchor" | "entity" | "category" | "file">;

/**
 * Find candidate locations for an anchor in a file
 */
export async function findCandidates(
  filePath: string,
  entity: Entity,
  category: string,
  expectedAnchor: string
): Promise<AnchorCandidate[]> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const candidates: AnchorCandidate[] = [];
  const entityName = entity.name;
  const entityNameLower = entityName.toLowerCase();
  const fileName = basename(filePath, ".ts").toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Skip lines that already have anchors
    if (line.includes("@graph:") || line.includes("@end:")) continue;

    let partial: PartialCandidate | null = null;

    switch (category) {
      case "model":
        partial = matchModel(line, i, entityName, entityNameLower, fileName);
        break;
      case "types":
        partial = matchTypes(line, i, entityName, entityNameLower, fileName);
        break;
      case "validation":
        partial = matchValidation(
          line,
          i,
          entityName,
          entityNameLower,
          fileName
        );
        break;
      case "schema":
        partial = matchSchema(line, i, entityName, entityNameLower, fileName);
        break;
    }

    if (partial) {
      candidates.push({
        ...partial,
        anchor: expectedAnchor,
        entity: entityName,
        category,
        file: filePath,
      });
    }
  }

  // Sort by confidence (highest first)
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Match model patterns (class definitions, ORM entities)
 */
function matchModel(
  line: string,
  lineNum: number,
  entityName: string,
  entityNameLower: string,
  fileName: string
): PartialCandidate | null {
  // Check for ORM decorator on previous line
  const ormMatch = line.match(PATTERNS.ormDecorator);
  if (ormMatch && ormMatch[2]) {
    return {
      line: lineNum,
      matchType: "ORM decorator",
      confidence: 0.9,
      identifier: ormMatch[2],
    };
  }

  // Check for class definition
  const classMatch = line.match(PATTERNS.classDefinition);
  if (classMatch && classMatch[4]) {
    const className = classMatch[4];
    const classNameLower = className.toLowerCase();

    // Exact match
    if (className === entityName) {
      return {
        line: lineNum,
        matchType: "class (exact match)",
        confidence: 1.0,
        identifier: className,
      };
    }

    // Case-insensitive match
    if (classNameLower === entityNameLower) {
      return {
        line: lineNum,
        matchType: "class (case-insensitive)",
        confidence: 0.9,
        identifier: className,
      };
    }

    // File name matches entity name
    if (fileName === entityNameLower && classMatch[2]) {
      // exported
      return {
        line: lineNum,
        matchType: "class (file name match)",
        confidence: 0.7,
        identifier: className,
      };
    }
  }

  return null;
}

/**
 * Match type patterns (interface, type alias)
 */
function matchTypes(
  line: string,
  lineNum: number,
  entityName: string,
  entityNameLower: string,
  fileName: string
): PartialCandidate | null {
  // Check for interface definition
  const interfaceMatch = line.match(PATTERNS.interfaceDefinition);
  if (interfaceMatch && interfaceMatch[4]) {
    const interfaceName = interfaceMatch[4];
    const interfaceNameLower = interfaceName.toLowerCase();

    // Exact match
    if (interfaceName === entityName) {
      return {
        line: lineNum,
        matchType: "interface (exact match)",
        confidence: 1.0,
        identifier: interfaceName,
      };
    }

    // Common patterns: IUser, UserInterface, UserDTO
    if (
      interfaceNameLower === entityNameLower ||
      interfaceNameLower === `i${entityNameLower}` ||
      interfaceNameLower === `${entityNameLower}interface` ||
      interfaceNameLower === `${entityNameLower}dto` ||
      interfaceNameLower === `${entityNameLower}type`
    ) {
      return {
        line: lineNum,
        matchType: "interface (pattern match)",
        confidence: 0.85,
        identifier: interfaceName,
      };
    }

    // File name matches
    if (fileName === entityNameLower && interfaceMatch[2]) {
      return {
        line: lineNum,
        matchType: "interface (file name match)",
        confidence: 0.6,
        identifier: interfaceName,
      };
    }
  }

  // Check for type alias
  const typeMatch = line.match(PATTERNS.typeDefinition);
  if (typeMatch && typeMatch[4]) {
    const typeName = typeMatch[4];
    const typeNameLower = typeName.toLowerCase();

    if (
      typeName === entityName ||
      typeNameLower === entityNameLower ||
      typeNameLower === `${entityNameLower}type`
    ) {
      return {
        line: lineNum,
        matchType: "type alias",
        confidence: 0.8,
        identifier: typeName,
      };
    }
  }

  return null;
}

/**
 * Match validation patterns (Zod schemas, validation functions)
 */
function matchValidation(
  line: string,
  lineNum: number,
  entityName: string,
  entityNameLower: string,
  _fileName: string
): PartialCandidate | null {
  // Check for Zod schema
  const zodMatch = line.match(PATTERNS.zodSchema);
  if (zodMatch && zodMatch[4]) {
    const schemaName = zodMatch[4];
    const schemaNameLower = schemaName.toLowerCase();

    // Common patterns: UserSchema, userSchema, CreateUserSchema
    if (
      schemaNameLower === `${entityNameLower}schema` ||
      schemaNameLower === `create${entityNameLower}schema` ||
      schemaNameLower === `update${entityNameLower}schema`
    ) {
      return {
        line: lineNum,
        matchType: "Zod schema",
        confidence: 0.95,
        identifier: schemaName,
      };
    }
  }

  // Check for validation function
  const validationMatch = line.match(PATTERNS.validationFunction);
  if (validationMatch && validationMatch[4]) {
    const funcName = validationMatch[4];
    const funcNameLower = funcName.toLowerCase();

    if (
      funcNameLower === `validate${entityNameLower}` ||
      funcNameLower === `${entityNameLower}validator`
    ) {
      return {
        line: lineNum,
        matchType: "validation function",
        confidence: 0.85,
        identifier: funcName,
      };
    }
  }

  return null;
}

/**
 * Match schema patterns (database schemas, Prisma, Drizzle)
 */
function matchSchema(
  line: string,
  lineNum: number,
  entityName: string,
  entityNameLower: string,
  _fileName: string
): PartialCandidate | null {
  // Drizzle table definition: export const users = pgTable(
  const drizzleMatch = line.match(
    /^(\s*)(export\s+)?(const)\s+(\w+)\s*=\s*(pg|mysql|sqlite)Table\s*\(/
  );
  if (drizzleMatch && drizzleMatch[4]) {
    const tableName = drizzleMatch[4];
    const tableNameLower = tableName.toLowerCase();

    if (
      tableNameLower === entityNameLower ||
      tableNameLower === `${entityNameLower}s` || // plural
      tableNameLower === `${entityNameLower}table`
    ) {
      return {
        line: lineNum,
        matchType: "Drizzle table",
        confidence: 0.95,
        identifier: tableName,
      };
    }
  }

  return null;
}

/**
 * Scan multiple files for candidates for all missing anchors of an entity
 */
export async function findAllCandidates(
  files: string[],
  entity: Entity,
  missingAnchors: Array<{ category: string; anchor: string }>
): Promise<Map<string, AnchorCandidate[]>> {
  const results = new Map<string, AnchorCandidate[]>();

  for (const { category, anchor } of missingAnchors) {
    const allCandidates: AnchorCandidate[] = [];

    for (const file of files) {
      // Skip non-TypeScript files for now
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;

      try {
        const candidates = await findCandidates(file, entity, category, anchor);
        allCandidates.push(...candidates);
      } catch {
        // Skip files that can't be read
      }
    }

    // Sort all candidates by confidence
    allCandidates.sort((a, b) => b.confidence - a.confidence);
    results.set(anchor, allCandidates);
  }

  return results;
}
