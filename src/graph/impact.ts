import { z } from "zod/v4";
import type { Entity, ResolvedAnchor } from "#types";
import type { Graph } from "./graph.js";
import type { Resolver, SyncStatus } from "./resolver.js";

// Change types for impact analysis
export const ChangeTypeSchema = z.enum([
  "rename_field",
  "remove_field",
  "add_field",
  "change_type",
  "add_relation",
  "remove_relation",
]);

export type ChangeType = z.infer<typeof ChangeTypeSchema>;

// Change specification
export const ChangeSpecSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("rename_field"),
    field: z.string(),
    newName: z.string(),
  }),
  z.object({
    type: z.literal("remove_field"),
    field: z.string(),
  }),
  z.object({
    type: z.literal("add_field"),
    field: z.string(),
    fieldType: z.string(),
    nullable: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("change_type"),
    field: z.string(),
    newType: z.string(),
  }),
  z.object({
    type: z.literal("add_relation"),
    name: z.string(),
    targetEntity: z.string(),
    relationType: z.string(),
  }),
  z.object({
    type: z.literal("remove_relation"),
    name: z.string(),
  }),
]);

export type ChangeSpec = z.infer<typeof ChangeSpecSchema>;

// Impact analysis result
export interface AffectedAnchor {
  anchor: string;
  file: string;
  line: number;
  endLine: number;
  category: string;
}

export interface RelatedEntity {
  entity: string;
  relation: string;
  reason: string;
}

export interface ImpactResult {
  entity: string;
  change: ChangeSpec;
  affected: AffectedAnchor[];
  relatedEntities: RelatedEntity[];
  suggestedSteps: string[];
}

/**
 * Analyzes the impact of changes to an entity
 */
export class ImpactAnalyzer {
  constructor(
    private graph: Graph,
    private resolver: Resolver
  ) {}

  /**
   * Analyze the impact of a proposed change to an entity
   */
  async analyze(entityName: string, change: ChangeSpec): Promise<ImpactResult> {
    const entity = this.graph.getEntity(entityName);
    if (!entity) {
      throw new Error(`Entity '${entityName}' not found`);
    }

    const status = await this.resolver.resolve();

    // Get all affected anchors for this entity
    const affected = this.getAffectedAnchors(entity, status);

    // Get related entities through relations
    const relatedEntities = this.getRelatedEntities(entityName, change);

    // Generate suggested steps
    const suggestedSteps = this.generateSuggestedSteps(entity, change, affected);

    return {
      entity: entityName,
      change,
      affected,
      relatedEntities,
      suggestedSteps,
    };
  }

  /**
   * Get all anchors that would be affected by changes to this entity
   */
  private getAffectedAnchors(entity: Entity, status: SyncStatus): AffectedAnchor[] {
    const affected: AffectedAnchor[] = [];

    const resolved = status.resolved.find((r) => r.entity.name === entity.name);
    if (!resolved) return affected;

    for (const [category, anchor] of resolved.anchors) {
      affected.push({
        anchor: anchor.anchor,
        file: anchor.file,
        line: anchor.line,
        endLine: anchor.endLine,
        category,
      });
    }

    return affected;
  }

  /**
   * Find entities that are related to this one
   */
  private getRelatedEntities(entityName: string, change: ChangeSpec): RelatedEntity[] {
    const related: RelatedEntity[] = [];

    // Find entities that have relations pointing TO this entity
    for (const entity of this.graph.getAllEntities()) {
      if (!entity.relations) continue;

      for (const relation of entity.relations) {
        if (relation.entity === entityName) {
          related.push({
            entity: entity.name,
            relation: relation.name,
            reason: `has ${relation.type} relation to ${entityName}`,
          });
        }
      }
    }

    // For relation changes, also include the target entity
    if (change.type === "add_relation" || change.type === "remove_relation") {
      if (change.type === "add_relation") {
        const targetExists = this.graph.hasEntity(change.targetEntity);
        if (targetExists) {
          related.push({
            entity: change.targetEntity,
            relation: change.name,
            reason: "target of new relation",
          });
        }
      }
    }

    return related;
  }

  /**
   * Generate suggested steps for the change
   */
  private generateSuggestedSteps(
    entity: Entity,
    change: ChangeSpec,
    affected: AffectedAnchor[]
  ): string[] {
    const steps: string[] = [];
    const entityName = entity.name;

    switch (change.type) {
      case "rename_field":
        steps.push(`1. Update ${entityName} entity spec (${change.field} → ${change.newName})`);
        for (const anchor of affected) {
          steps.push(`2. Update ${anchor.anchor} in ${anchor.file}:${anchor.line}`);
        }
        steps.push(`${steps.length + 1}. Run database migration to rename column`);
        steps.push(`${steps.length + 1}. Update any API consumers`);
        break;

      case "remove_field":
        steps.push(`1. Verify ${change.field} is not used by dependent code`);
        steps.push(`2. Update ${entityName} entity spec (remove ${change.field})`);
        for (const anchor of affected) {
          steps.push(`${steps.length + 1}. Remove ${change.field} from ${anchor.anchor}`);
        }
        steps.push(`${steps.length + 1}. Run database migration to drop column`);
        break;

      case "add_field":
        steps.push(`1. Update ${entityName} entity spec (add ${change.field}: ${change.fieldType})`);
        for (const anchor of affected) {
          steps.push(`${steps.length + 1}. Add ${change.field} to ${anchor.anchor}`);
        }
        if (!change.nullable) {
          steps.push(`${steps.length + 1}. Add database migration with default value for existing rows`);
        } else {
          steps.push(`${steps.length + 1}. Add database migration for nullable column`);
        }
        break;

      case "change_type":
        steps.push(`1. Update ${entityName} entity spec (${change.field}: ... → ${change.newType})`);
        for (const anchor of affected) {
          steps.push(`${steps.length + 1}. Update ${change.field} type in ${anchor.anchor}`);
        }
        steps.push(`${steps.length + 1}. Create data migration if type conversion needed`);
        steps.push(`${steps.length + 1}. Update validation schemas`);
        break;

      case "add_relation":
        steps.push(`1. Update ${entityName} entity spec (add ${change.name} relation)`);
        steps.push(`2. Verify ${change.targetEntity} entity exists`);
        for (const anchor of affected) {
          if (anchor.category === "model") {
            steps.push(`${steps.length + 1}. Add relation to ${anchor.anchor}`);
          }
        }
        steps.push(`${steps.length + 1}. Add foreign key migration if needed`);
        break;

      case "remove_relation":
        steps.push(`1. Verify ${change.name} relation is not used by dependent code`);
        steps.push(`2. Update ${entityName} entity spec (remove ${change.name} relation)`);
        for (const anchor of affected) {
          if (anchor.category === "model") {
            steps.push(`${steps.length + 1}. Remove relation from ${anchor.anchor}`);
          }
        }
        steps.push(`${steps.length + 1}. Consider foreign key cleanup migration`);
        break;
    }

    // Re-number steps properly
    return steps.map((step, i) => {
      const content = step.replace(/^\d+\.\s*/, "");
      return `${i + 1}. ${content}`;
    });
  }
}
