import { readFile } from "node:fs/promises";
import { basename, relative } from "node:path";
import type { Entity, Field, Relation, FieldType } from "#types";

/**
 * Inferred entity from code analysis
 */
export interface InferredEntity {
  /** Entity name (from class/interface name) */
  name: string;
  /** Source file where entity was found */
  sourceFile: string;
  /** Line number in source file */
  line: number;
  /** Inferred fields */
  fields: InferredField[];
  /** Inferred relations */
  relations: InferredRelation[];
  /** What pattern matched (class, interface, Zod schema, etc.) */
  sourceType: string;
  /** Confidence in the inference (0-1) */
  confidence: number;
  /** Suggested code_refs */
  suggestedRefs: Map<string, { anchor: string; line: number }>;
}

export interface InferredField {
  name: string;
  type: FieldType;
  isPrimary: boolean;
  isUnique: boolean;
  isNullable: boolean;
  description?: string;
}

export interface InferredRelation {
  name: string;
  entity: string;
  type: "belongs_to" | "has_one" | "has_many" | "many_to_many";
}

/**
 * Patterns for entity inference
 */
const PATTERNS = {
  // TypeORM/MikroORM class with @Entity decorator
  entityDecorator: /^(\s*)@Entity\s*\(/,
  // Plain class definition
  classDefinition: /^(\s*)(export\s+)?(class)\s+(\w+)/,
  // Interface definition
  interfaceDefinition: /^(\s*)(export\s+)?(interface)\s+(\w+)/,
  // Type definition
  typeDefinition: /^(\s*)(export\s+)?(type)\s+(\w+)\s*=/,
  // Zod schema
  zodSchema: /^(\s*)(export\s+)?(const)\s+(\w+)(Schema)?\s*=\s*z\.object\s*\(/,
  // Drizzle table
  drizzleTable: /^(\s*)(export\s+)?(const)\s+(\w+)\s*=\s*(pg|mysql|sqlite)Table\s*\(/,
  // Prisma model (from generated types)
  prismaModel: /^(\s*)(export\s+)?(interface|type)\s+(\w+)\s*(extends|=)/,

  // Field patterns
  classField: /^\s*(@\w+\([^)]*\)\s*)*(\w+)\s*[?!]?\s*:\s*([^;=]+)/,
  interfaceField: /^\s*(\w+)\s*[?]?\s*:\s*([^;]+)/,
  zodField: /^\s*(\w+)\s*:\s*z\.(\w+)\s*\(/,
  drizzleColumn: /^\s*(\w+)\s*:\s*(varchar|text|integer|uuid|boolean|timestamp|json|serial)/,

  // Relation patterns
  oneToMany: /@OneToMany\s*\(\s*\(\)\s*=>\s*(\w+)/,
  manyToOne: /@ManyToOne\s*\(\s*\(\)\s*=>\s*(\w+)/,
  oneToOne: /@OneToOne\s*\(\s*\(\)\s*=>\s*(\w+)/,
  manyToMany: /@ManyToMany\s*\(\s*\(\)\s*=>\s*(\w+)/,
  drizzleRelation: /references\s*\(\s*\(\)\s*=>\s*(\w+)/,
};

/**
 * Map TypeScript types to FieldType
 */
function mapTsType(tsType: string): FieldType {
  const cleaned = tsType.trim().replace(/\s+/g, " ");

  // Direct type mappings
  const typeMap: Record<string, FieldType> = {
    string: "string",
    number: "integer",
    boolean: "boolean",
    Date: "timestamp",
    bigint: "integer",
  };

  // Check for direct matches
  for (const [ts, field] of Object.entries(typeMap)) {
    if (cleaned === ts || cleaned === `${ts} | null` || cleaned === `${ts}?`) {
      return field;
    }
  }

  // Check for array types (relations)
  if (cleaned.endsWith("[]") || cleaned.includes("Array<")) {
    return "json"; // Will be handled as relation
  }

  // Check for UUID patterns
  if (
    cleaned.toLowerCase().includes("uuid") ||
    cleaned.toLowerCase().includes("id")
  ) {
    return "uuid";
  }

  // Check for enum types
  if (
    cleaned.includes("|") &&
    cleaned.split("|").every((p) => p.trim().startsWith('"'))
  ) {
    return "enum";
  }

  // Default to string for unknown types
  return "string";
}

/**
 * Map Zod types to FieldType
 */
function mapZodType(zodType: string): FieldType {
  const typeMap: Record<string, FieldType> = {
    string: "string",
    number: "integer",
    boolean: "boolean",
    date: "timestamp",
    uuid: "uuid",
    enum: "enum",
    object: "json",
    array: "json",
  };

  return typeMap[zodType.toLowerCase()] || "string";
}

/**
 * Extract entities from a TypeScript file
 */
export async function extractEntities(
  filePath: string
): Promise<InferredEntity[]> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const entities: InferredEntity[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line) {
      i++;
      continue;
    }

    // Check for @Entity decorator (TypeORM/MikroORM)
    if (PATTERNS.entityDecorator.test(line)) {
      const entity = parseOrmEntity(lines, i, filePath);
      if (entity) {
        entities.push(entity);
        i = entity.line + countBraces(lines, entity.line);
        continue;
      }
    }

    // Check for class definition
    const classMatch = line.match(PATTERNS.classDefinition);
    if (classMatch && classMatch[4]) {
      const entity = parseClass(lines, i, filePath, classMatch[4]);
      if (entity) {
        entities.push(entity);
        i = entity.line + countBraces(lines, entity.line);
        continue;
      }
    }

    // Check for interface definition
    const interfaceMatch = line.match(PATTERNS.interfaceDefinition);
    if (interfaceMatch && interfaceMatch[4]) {
      const entity = parseInterface(lines, i, filePath, interfaceMatch[4]);
      if (entity) {
        entities.push(entity);
        i = entity.line + countBraces(lines, entity.line);
        continue;
      }
    }

    // Check for Zod schema
    const zodMatch = line.match(PATTERNS.zodSchema);
    if (zodMatch && zodMatch[4]) {
      const entity = parseZodSchema(lines, i, filePath, zodMatch[4]);
      if (entity) {
        entities.push(entity);
        // Skip past the schema definition
        i = findClosingParen(lines, i);
        continue;
      }
    }

    // Check for Drizzle table
    const drizzleMatch = line.match(PATTERNS.drizzleTable);
    if (drizzleMatch && drizzleMatch[4]) {
      const entity = parseDrizzleTable(lines, i, filePath, drizzleMatch[4]);
      if (entity) {
        entities.push(entity);
        i = findClosingParen(lines, i);
        continue;
      }
    }

    i++;
  }

  return entities;
}

/**
 * Parse ORM entity with decorators
 */
function parseOrmEntity(
  lines: string[],
  startLine: number,
  filePath: string
): InferredEntity | null {
  // Find class definition after decorator
  let classLine = startLine + 1;
  while (classLine < lines.length && !lines[classLine]?.match(PATTERNS.classDefinition)) {
    classLine++;
  }

  const classMatch = lines[classLine]?.match(PATTERNS.classDefinition);
  if (!classMatch || !classMatch[4]) return null;

  const name = classMatch[4];
  const fields: InferredField[] = [];
  const relations: InferredRelation[] = [];

  // Parse class body
  const endLine = classLine + countBraces(lines, classLine);

  // Track decorators for multi-line decorator + field patterns
  let pendingDecorators: string[] = [];

  for (let i = classLine + 1; i < endLine && i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Collect decorators (they may appear on lines before the field)
    if (line.trim().startsWith("@")) {
      pendingDecorators.push(line);
      continue;
    }

    // Check for relation decorators in pending decorators
    const decoratorText = pendingDecorators.join(" ");
    const oneToManyMatch = decoratorText.match(PATTERNS.oneToMany);
    if (oneToManyMatch && oneToManyMatch[1]) {
      const fieldMatch = line.match(/^\s*(\w+)\s*:/);
      if (fieldMatch && fieldMatch[1]) {
        relations.push({
          name: fieldMatch[1],
          entity: oneToManyMatch[1],
          type: "has_many",
        });
        pendingDecorators = [];
        continue;
      }
    }

    const manyToOneMatch = decoratorText.match(PATTERNS.manyToOne);
    if (manyToOneMatch && manyToOneMatch[1]) {
      const fieldMatch = line.match(/^\s*(\w+)\s*:/);
      if (fieldMatch && fieldMatch[1]) {
        relations.push({
          name: fieldMatch[1],
          entity: manyToOneMatch[1],
          type: "belongs_to",
        });
        pendingDecorators = [];
        continue;
      }
    }

    // Check for field with decorators
    const fieldMatch = line.match(PATTERNS.classField);
    if (fieldMatch && fieldMatch[2] && fieldMatch[3]) {
      const fieldName = fieldMatch[2];
      const fieldType = fieldMatch[3];

      // Skip if it's a relation field
      if (relations.some((r) => r.name === fieldName)) {
        pendingDecorators = [];
        continue;
      }

      // Check for primary/unique in both current line and pending decorators
      const allText = decoratorText + " " + line;
      const isPrimary =
        allText.includes("@PrimaryColumn") ||
        allText.includes("@PrimaryGeneratedColumn");
      const isUnique = allText.includes("@Unique") || allText.includes("unique:");

      fields.push({
        name: fieldName,
        type: mapTsType(fieldType),
        isPrimary,
        isUnique,
        isNullable: fieldType.includes("null") || allText.includes("nullable:"),
      });

      pendingDecorators = [];
    }
  }

  const suggestedRefs = new Map<string, { anchor: string; line: number }>();
  suggestedRefs.set("model", {
    anchor: `@graph:${name}.model`,
    line: startLine,
  });

  return {
    name,
    sourceFile: filePath,
    line: startLine,
    fields,
    relations,
    sourceType: "ORM entity",
    confidence: 0.95,
    suggestedRefs,
  };
}

/**
 * Parse plain TypeScript class
 */
function parseClass(
  lines: string[],
  startLine: number,
  filePath: string,
  name: string
): InferredEntity | null {
  // Skip common non-entity classes
  const skipPatterns = [
    /Service$/,
    /Controller$/,
    /Repository$/,
    /Module$/,
    /Provider$/,
    /Handler$/,
    /Middleware$/,
  ];
  if (skipPatterns.some((p) => p.test(name))) {
    return null;
  }

  const fields: InferredField[] = [];
  const endLine = startLine + countBraces(lines, startLine);

  for (let i = startLine + 1; i < endLine && i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Skip methods
    if (
      line.includes("(") &&
      (line.includes("function") ||
        line.includes("async") ||
        line.match(/^\s*\w+\s*\([^)]*\)\s*[:{]/))
    ) {
      continue;
    }

    const fieldMatch = line.match(PATTERNS.classField);
    if (fieldMatch && fieldMatch[2] && fieldMatch[3]) {
      fields.push({
        name: fieldMatch[2],
        type: mapTsType(fieldMatch[3]),
        isPrimary: fieldMatch[2].toLowerCase() === "id",
        isUnique: false,
        isNullable: fieldMatch[3].includes("null") || line.includes("?"),
      });
    }
  }

  // Only return if we found fields (likely a model)
  if (fields.length === 0) return null;

  const suggestedRefs = new Map<string, { anchor: string; line: number }>();
  suggestedRefs.set("model", {
    anchor: `@graph:${name}.model`,
    line: startLine,
  });

  return {
    name,
    sourceFile: filePath,
    line: startLine,
    fields,
    relations: [],
    sourceType: "class",
    confidence: 0.7,
    suggestedRefs,
  };
}

/**
 * Parse TypeScript interface
 */
function parseInterface(
  lines: string[],
  startLine: number,
  filePath: string,
  name: string
): InferredEntity | null {
  // Skip common non-entity interfaces
  const skipPatterns = [
    /Props$/,
    /State$/,
    /Config$/,
    /Options$/,
    /Settings$/,
    /^I[A-Z]/, // IFoo pattern
  ];
  if (skipPatterns.some((p) => p.test(name))) {
    return null;
  }

  const fields: InferredField[] = [];
  const endLine = startLine + countBraces(lines, startLine);

  for (let i = startLine + 1; i < endLine && i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Skip method signatures
    if (line.includes("(") && line.includes(")")) continue;

    const fieldMatch = line.match(PATTERNS.interfaceField);
    if (fieldMatch && fieldMatch[1] && fieldMatch[2]) {
      fields.push({
        name: fieldMatch[1],
        type: mapTsType(fieldMatch[2]),
        isPrimary: fieldMatch[1].toLowerCase() === "id",
        isUnique: false,
        isNullable: line.includes("?") || fieldMatch[2].includes("null"),
      });
    }
  }

  if (fields.length === 0) return null;

  const suggestedRefs = new Map<string, { anchor: string; line: number }>();
  suggestedRefs.set("types", {
    anchor: `@graph:${name}.types`,
    line: startLine,
  });

  return {
    name,
    sourceFile: filePath,
    line: startLine,
    fields,
    relations: [],
    sourceType: "interface",
    confidence: 0.6,
    suggestedRefs,
  };
}

/**
 * Parse Zod schema
 */
function parseZodSchema(
  lines: string[],
  startLine: number,
  filePath: string,
  name: string
): InferredEntity | null {
  // Remove "Schema" suffix for entity name
  const entityName = name.replace(/Schema$/, "");

  const fields: InferredField[] = [];
  const endLine = findClosingParen(lines, startLine);

  for (let i = startLine; i <= endLine && i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const fieldMatch = line.match(PATTERNS.zodField);
    if (fieldMatch && fieldMatch[1] && fieldMatch[2]) {
      fields.push({
        name: fieldMatch[1],
        type: mapZodType(fieldMatch[2]),
        isPrimary: fieldMatch[1].toLowerCase() === "id",
        isUnique: false,
        isNullable: line.includes(".optional()") || line.includes(".nullable()"),
      });
    }
  }

  if (fields.length === 0) return null;

  const suggestedRefs = new Map<string, { anchor: string; line: number }>();
  suggestedRefs.set("validation", {
    anchor: `@graph:${entityName}.validation`,
    line: startLine,
  });

  return {
    name: entityName,
    sourceFile: filePath,
    line: startLine,
    fields,
    relations: [],
    sourceType: "Zod schema",
    confidence: 0.85,
    suggestedRefs,
  };
}

/**
 * Parse Drizzle table definition
 */
function parseDrizzleTable(
  lines: string[],
  startLine: number,
  filePath: string,
  name: string
): InferredEntity | null {
  // Convert table name to PascalCase entity name
  const entityName = toPascalCase(name.replace(/s$/, "")); // users -> User

  const fields: InferredField[] = [];
  const relations: InferredRelation[] = [];
  const endLine = findClosingParen(lines, startLine);

  for (let i = startLine; i <= endLine && i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const columnMatch = line.match(PATTERNS.drizzleColumn);
    if (columnMatch && columnMatch[1] && columnMatch[2]) {
      const colType = columnMatch[2];
      const typeMap: Record<string, FieldType> = {
        varchar: "string",
        text: "text",
        integer: "integer",
        uuid: "uuid",
        boolean: "boolean",
        timestamp: "timestamp",
        json: "json",
        serial: "integer",
      };

      fields.push({
        name: columnMatch[1],
        type: typeMap[colType] || "string",
        isPrimary:
          line.includes("primaryKey") || columnMatch[1].toLowerCase() === "id",
        isUnique: line.includes("unique"),
        isNullable: !line.includes("notNull"),
      });
    }

    // Check for foreign key relations
    const relationMatch = line.match(PATTERNS.drizzleRelation);
    if (relationMatch && relationMatch[1]) {
      const fieldMatch = line.match(/(\w+)\s*:/);
      if (fieldMatch && fieldMatch[1]) {
        relations.push({
          name: fieldMatch[1].replace(/Id$/, ""),
          entity: toPascalCase(relationMatch[1].replace(/s$/, "")),
          type: "belongs_to",
        });
      }
    }
  }

  if (fields.length === 0) return null;

  const suggestedRefs = new Map<string, { anchor: string; line: number }>();
  suggestedRefs.set("schema", {
    anchor: `@graph:${entityName}.schema`,
    line: startLine,
  });

  return {
    name: entityName,
    sourceFile: filePath,
    line: startLine,
    fields,
    relations,
    sourceType: "Drizzle table",
    confidence: 0.9,
    suggestedRefs,
  };
}

/**
 * Count matching braces to find end of block
 */
function countBraces(lines: string[], startLine: number): number {
  let depth = 0;
  let started = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    for (const char of line) {
      if (char === "{") {
        depth++;
        started = true;
      } else if (char === "}") {
        depth--;
        if (started && depth === 0) {
          return i - startLine + 1;
        }
      }
    }
  }

  return lines.length - startLine;
}

/**
 * Find closing parenthesis for multi-line function calls
 */
function findClosingParen(lines: string[], startLine: number): number {
  let depth = 0;
  let started = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    for (const char of line) {
      if (char === "(") {
        depth++;
        started = true;
      } else if (char === ")") {
        depth--;
        if (started && depth === 0) {
          return i;
        }
      }
    }
  }

  return lines.length - 1;
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

/**
 * Scan multiple files for entities
 */
export async function scanForEntities(
  files: string[]
): Promise<InferredEntity[]> {
  const allEntities: InferredEntity[] = [];

  for (const file of files) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;

    try {
      const entities = await extractEntities(file);
      allEntities.push(...entities);
    } catch {
      // Skip files that can't be read
    }
  }

  // Sort by confidence and deduplicate by name
  const byName = new Map<string, InferredEntity>();
  for (const entity of allEntities.sort((a, b) => b.confidence - a.confidence)) {
    if (!byName.has(entity.name)) {
      byName.set(entity.name, entity);
    } else {
      // Merge fields/relations from lower confidence duplicates
      const existing = byName.get(entity.name)!;
      for (const field of entity.fields) {
        if (!existing.fields.some((f) => f.name === field.name)) {
          existing.fields.push(field);
        }
      }
      for (const relation of entity.relations) {
        if (!existing.relations.some((r) => r.name === relation.name)) {
          existing.relations.push(relation);
        }
      }
      // Merge suggestedRefs
      for (const [key, value] of entity.suggestedRefs) {
        if (!existing.suggestedRefs.has(key)) {
          existing.suggestedRefs.set(key, value);
        }
      }
    }
  }

  return Array.from(byName.values());
}
