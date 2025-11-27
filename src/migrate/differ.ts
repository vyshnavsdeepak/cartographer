import type { Entity, Field, Relation, FieldType } from "#types";

/**
 * Types of changes detected between entity specs
 */
export type ChangeType =
  | "entity_added"
  | "entity_removed"
  | "field_added"
  | "field_removed"
  | "field_type_changed"
  | "field_nullable_changed"
  | "field_default_changed"
  | "relation_added"
  | "relation_removed";

/**
 * A single change between old and new spec
 */
export interface SpecChange {
  type: ChangeType;
  entity: string;
  field?: string;
  relation?: string;
  oldValue?: unknown;
  newValue?: unknown;
  breaking: boolean;
  description: string;
}

/**
 * Result of diffing two specs
 */
export interface DiffResult {
  changes: SpecChange[];
  hasBreakingChanges: boolean;
  summary: string[];
}

/**
 * Compare two sets of entities and detect changes
 */
export function diffEntities(
  oldEntities: Entity[],
  newEntities: Entity[]
): DiffResult {
  const changes: SpecChange[] = [];
  const oldMap = new Map(oldEntities.map((e) => [e.name, e]));
  const newMap = new Map(newEntities.map((e) => [e.name, e]));

  // Check for added entities
  for (const [name, entity] of newMap) {
    if (!oldMap.has(name)) {
      changes.push({
        type: "entity_added",
        entity: name,
        breaking: false,
        description: `Add entity ${name}`,
      });
      // Also add all fields as new
      for (const field of entity.fields) {
        changes.push({
          type: "field_added",
          entity: name,
          field: field.name,
          newValue: field,
          breaking: false,
          description: `Add field ${name}.${field.name} (${field.type})`,
        });
      }
    }
  }

  // Check for removed entities
  for (const [name] of oldMap) {
    if (!newMap.has(name)) {
      changes.push({
        type: "entity_removed",
        entity: name,
        breaking: true,
        description: `Remove entity ${name} (DESTRUCTIVE)`,
      });
    }
  }

  // Check for changed entities
  for (const [name, newEntity] of newMap) {
    const oldEntity = oldMap.get(name);
    if (oldEntity) {
      const entityChanges = diffEntity(oldEntity, newEntity);
      changes.push(...entityChanges);
    }
  }

  const hasBreakingChanges = changes.some((c) => c.breaking);
  const summary = generateSummary(changes);

  return { changes, hasBreakingChanges, summary };
}

/**
 * Compare two versions of the same entity
 */
function diffEntity(oldEntity: Entity, newEntity: Entity): SpecChange[] {
  const changes: SpecChange[] = [];
  const entityName = newEntity.name;

  // Compare fields
  const fieldChanges = diffFields(entityName, oldEntity.fields, newEntity.fields);
  changes.push(...fieldChanges);

  // Compare relations
  const relationChanges = diffRelations(
    entityName,
    oldEntity.relations ?? [],
    newEntity.relations ?? []
  );
  changes.push(...relationChanges);

  return changes;
}

/**
 * Compare fields between old and new entity
 */
function diffFields(
  entityName: string,
  oldFields: Field[],
  newFields: Field[]
): SpecChange[] {
  const changes: SpecChange[] = [];
  const oldMap = new Map(oldFields.map((f) => [f.name, f]));
  const newMap = new Map(newFields.map((f) => [f.name, f]));

  // Check for added fields
  for (const [name, field] of newMap) {
    if (!oldMap.has(name)) {
      // New non-nullable field without default is breaking
      const isBreaking = !field.nullable && field.default === undefined;
      changes.push({
        type: "field_added",
        entity: entityName,
        field: name,
        newValue: field,
        breaking: isBreaking,
        description: `Add field ${entityName}.${name} (${field.type})${isBreaking ? " (BREAKING: non-nullable without default)" : ""}`,
      });
    }
  }

  // Check for removed fields
  for (const [name] of oldMap) {
    if (!newMap.has(name)) {
      changes.push({
        type: "field_removed",
        entity: entityName,
        field: name,
        breaking: true,
        description: `Remove field ${entityName}.${name} (DESTRUCTIVE)`,
      });
    }
  }

  // Check for changed fields
  for (const [name, newField] of newMap) {
    const oldField = oldMap.get(name);
    if (oldField) {
      // Type change
      if (oldField.type !== newField.type) {
        const isBreaking = !isCompatibleTypeChange(oldField.type, newField.type);
        changes.push({
          type: "field_type_changed",
          entity: entityName,
          field: name,
          oldValue: oldField.type,
          newValue: newField.type,
          breaking: isBreaking,
          description: `Change ${entityName}.${name} type: ${oldField.type} -> ${newField.type}${isBreaking ? " (BREAKING)" : ""}`,
        });
      }

      // Nullable change
      if (oldField.nullable !== newField.nullable) {
        // Making non-nullable is breaking
        const isBreaking = oldField.nullable === true && newField.nullable !== true;
        changes.push({
          type: "field_nullable_changed",
          entity: entityName,
          field: name,
          oldValue: oldField.nullable,
          newValue: newField.nullable,
          breaking: isBreaking,
          description: `Change ${entityName}.${name} nullable: ${oldField.nullable ?? false} -> ${newField.nullable ?? false}${isBreaking ? " (BREAKING)" : ""}`,
        });
      }

      // Default change
      if (JSON.stringify(oldField.default) !== JSON.stringify(newField.default)) {
        changes.push({
          type: "field_default_changed",
          entity: entityName,
          field: name,
          oldValue: oldField.default,
          newValue: newField.default,
          breaking: false,
          description: `Change ${entityName}.${name} default: ${JSON.stringify(oldField.default)} -> ${JSON.stringify(newField.default)}`,
        });
      }
    }
  }

  return changes;
}

/**
 * Compare relations between old and new entity
 */
function diffRelations(
  entityName: string,
  oldRelations: Relation[],
  newRelations: Relation[]
): SpecChange[] {
  const changes: SpecChange[] = [];
  const oldMap = new Map(oldRelations.map((r) => [r.name, r]));
  const newMap = new Map(newRelations.map((r) => [r.name, r]));

  // Check for added relations
  for (const [name, relation] of newMap) {
    if (!oldMap.has(name)) {
      changes.push({
        type: "relation_added",
        entity: entityName,
        relation: name,
        newValue: relation,
        breaking: false,
        description: `Add relation ${entityName}.${name} -> ${relation.entity} (${relation.type})`,
      });
    }
  }

  // Check for removed relations
  for (const [name] of oldMap) {
    if (!newMap.has(name)) {
      changes.push({
        type: "relation_removed",
        entity: entityName,
        relation: name,
        breaking: true,
        description: `Remove relation ${entityName}.${name} (DESTRUCTIVE)`,
      });
    }
  }

  return changes;
}

/**
 * Check if a type change is compatible (non-breaking)
 */
function isCompatibleTypeChange(oldType: FieldType, newType: FieldType): boolean {
  // These type changes are generally safe (widening)
  const compatibleChanges: Record<string, string[]> = {
    string: ["text"],
    integer: ["decimal"],
  };

  return compatibleChanges[oldType]?.includes(newType) ?? false;
}

/**
 * Generate human-readable summary of changes
 */
function generateSummary(changes: SpecChange[]): string[] {
  const summary: string[] = [];

  const added = changes.filter((c) => c.type.includes("added"));
  const removed = changes.filter((c) => c.type.includes("removed"));
  const changed = changes.filter((c) => c.type.includes("changed"));
  const breaking = changes.filter((c) => c.breaking);

  if (added.length > 0) {
    summary.push(`+ ${added.length} additions`);
  }
  if (removed.length > 0) {
    summary.push(`- ${removed.length} removals`);
  }
  if (changed.length > 0) {
    summary.push(`~ ${changed.length} modifications`);
  }
  if (breaking.length > 0) {
    summary.push(`! ${breaking.length} breaking changes`);
  }

  return summary;
}
