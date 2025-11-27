import { writeFile, mkdir } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type { InferredEntity, InferredField, InferredRelation } from "./extractor.js";

/**
 * Result of generating entity files
 */
export interface GenerateResult {
  entityName: string;
  filePath: string;
  success: boolean;
  error?: string;
}

/**
 * Options for YAML generation
 */
export interface GenerateOptions {
  /** Directory to write entity YAML files */
  outputDir: string;
  /** Base directory for relative paths in descriptions */
  baseDir: string;
  /** Overwrite existing files */
  overwrite?: boolean;
}

/**
 * Convert an inferred entity to YAML format
 */
export function entityToYaml(
  entity: InferredEntity,
  baseDir: string
): string {
  const relPath = relative(baseDir, entity.sourceFile);

  // Build the entity object for YAML
  const yamlEntity: Record<string, unknown> = {
    name: entity.name,
    description: `Inferred from ${relPath}:${entity.line + 1} (${entity.sourceType})`,
  };

  // Add fields
  if (entity.fields.length > 0) {
    yamlEntity.fields = entity.fields.map((field) => {
      const fieldObj: Record<string, unknown> = {
        name: field.name,
        type: field.type,
      };

      if (field.isPrimary) fieldObj.primary = true;
      if (field.isUnique) fieldObj.unique = true;
      if (field.isNullable) fieldObj.nullable = true;
      if (field.description) fieldObj.description = field.description;

      return fieldObj;
    });
  }

  // Add relations
  if (entity.relations.length > 0) {
    yamlEntity.relations = entity.relations.map((relation) => ({
      name: relation.name,
      entity: relation.entity,
      type: relation.type,
    }));
  }

  // Add code_refs
  if (entity.suggestedRefs.size > 0) {
    const codeRefs: Record<string, { anchor: string; description?: string }> = {};
    for (const [category, ref] of entity.suggestedRefs) {
      codeRefs[category] = {
        anchor: ref.anchor,
        description: `${relPath}:${ref.line + 1}`,
      };
    }
    yamlEntity.code_refs = codeRefs;
  }

  return stringifyYaml(yamlEntity, {
    indent: 2,
    lineWidth: 0,
    defaultKeyType: "PLAIN",
    defaultStringType: "QUOTE_DOUBLE",
  });
}

/**
 * Generate YAML files for inferred entities
 */
export async function generateEntityFiles(
  entities: InferredEntity[],
  options: GenerateOptions
): Promise<GenerateResult[]> {
  const results: GenerateResult[] = [];

  // Ensure output directory exists
  await mkdir(options.outputDir, { recursive: true });

  for (const entity of entities) {
    const fileName = `${entity.name.toLowerCase()}.yaml`;
    const filePath = join(options.outputDir, fileName);

    try {
      const yaml = entityToYaml(entity, options.baseDir);
      await writeFile(filePath, yaml);

      results.push({
        entityName: entity.name,
        filePath,
        success: true,
      });
    } catch (err) {
      results.push({
        entityName: entity.name,
        filePath,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

/**
 * Preview what YAML would be generated without writing files
 */
export function previewGeneration(
  entities: InferredEntity[],
  baseDir: string
): Map<string, string> {
  const previews = new Map<string, string>();

  for (const entity of entities) {
    const yaml = entityToYaml(entity, baseDir);
    previews.set(entity.name, yaml);
  }

  return previews;
}

/**
 * Format entity summary for display
 */
export function formatEntitySummary(
  entity: InferredEntity,
  baseDir: string
): string {
  const relPath = relative(baseDir, entity.sourceFile);
  const lines: string[] = [];

  lines.push(`${entity.name} (${relPath}:${entity.line + 1})`);
  lines.push(`  Source: ${entity.sourceType} (${Math.round(entity.confidence * 100)}% confidence)`);

  if (entity.fields.length > 0) {
    const fieldNames = entity.fields.map((f) => {
      let name = f.name;
      if (f.isPrimary) name += " [PK]";
      if (f.isUnique) name += " [U]";
      return name;
    });
    lines.push(`  Fields: ${fieldNames.join(", ")}`);
  }

  if (entity.relations.length > 0) {
    const relationStrs = entity.relations.map(
      (r) => `${r.name} (${r.type} -> ${r.entity})`
    );
    lines.push(`  Relations: ${relationStrs.join(", ")}`);
  }

  return lines.join("\n");
}
