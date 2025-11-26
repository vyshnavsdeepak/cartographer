/**
 * Tool implementations for MCP server.
 *
 * Extracted to enable direct testing without MCP protocol overhead.
 */

import type { Graph } from "#graph/graph";
import type { Resolver, SyncStatus } from "#graph/resolver";
import { ImpactAnalyzer, type ChangeSpec } from "#graph/impact";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ToolContext {
  graph: Graph;
  resolver: Resolver;
}

/**
 * List all entities in the architecture graph
 */
export function listEntities(ctx: ToolContext): ToolResult {
  const entities = ctx.graph.getAllEntities();
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          entities.map((e) => ({
            name: e.name,
            description: e.description,
            fieldCount: e.fields.length,
            relationCount: e.relations?.length ?? 0,
          })),
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Get full details of an entity
 */
export function getEntity(ctx: ToolContext, name: string): ToolResult {
  const entity = ctx.graph.getEntity(name);
  if (!entity) {
    return {
      content: [{ type: "text", text: `Entity '${name}' not found` }],
      isError: true,
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(entity, null, 2) }],
  };
}

/**
 * Get anchor location and content
 */
export async function getAnchor(
  ctx: ToolContext,
  anchor: string
): Promise<ToolResult> {
  const status = await ctx.resolver.resolve();

  // Check resolved anchors
  for (const resolved of status.resolved) {
    for (const [, anchorData] of resolved.anchors) {
      if (anchorData.anchor === anchor) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  anchor: anchorData.anchor,
                  file: anchorData.file,
                  line: anchorData.line,
                  endLine: anchorData.endLine,
                  content: anchorData.content,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  }

  // Check orphaned anchors
  for (const anchorData of status.orphanedAnchors) {
    if (anchorData.anchor === anchor) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                anchor: anchorData.anchor,
                file: anchorData.file,
                line: anchorData.line,
                endLine: anchorData.endLine,
                content: anchorData.content,
                warning: "This anchor is not referenced by any entity",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  return {
    content: [{ type: "text", text: `Anchor '${anchor}' not found in code` }],
    isError: true,
  };
}

/**
 * Get relations for an entity or all relations
 */
export function getRelations(
  ctx: ToolContext,
  entity?: string
): ToolResult {
  if (entity) {
    const entityData = ctx.graph.getEntity(entity);
    if (!entityData) {
      return {
        content: [{ type: "text", text: `Entity '${entity}' not found` }],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              entity: entity,
              relations: entityData.relations ?? [],
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Return all relations
  const allRelations = ctx.graph.getAllEntities().flatMap((e) =>
    (e.relations ?? []).map((r) => ({
      from: e.name,
      to: r.entity,
      name: r.name,
      type: r.type,
      foreign_key: r.foreign_key,
      through: r.through,
    }))
  );

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(allRelations, null, 2),
      },
    ],
  };
}

/**
 * Analyze impact of a proposed change
 */
export async function analyzeImpact(
  ctx: ToolContext,
  entity: string,
  change: ChangeSpec
): Promise<ToolResult> {
  const analyzer = new ImpactAnalyzer(ctx.graph, ctx.resolver);

  try {
    const result = await analyzer.analyze(entity, change);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: err instanceof Error ? err.message : String(err),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Check sync status between graph and code
 */
export async function checkSyncStatus(ctx: ToolContext): Promise<ToolResult> {
  const status = await ctx.resolver.resolve();
  const issues: string[] = [];

  // Check for missing anchors
  for (const resolved of status.resolved) {
    if (resolved.missing.length > 0) {
      issues.push(
        `${resolved.entity.name}: missing anchors - ${resolved.missing.join(", ")}`
      );
    }
  }

  // Check for orphaned anchors
  if (status.orphanedAnchors.length > 0) {
    issues.push(
      `Orphaned anchors (in code but not in graph): ${status.orphanedAnchors.map((a) => a.anchor).join(", ")}`
    );
  }

  // Check for load errors
  const loadErrors = ctx.graph.getLoadErrors();
  if (loadErrors.length > 0) {
    issues.push(
      `Failed to load entities: ${loadErrors.map((e) => e.file).join(", ")}`
    );
  }

  // Check for relation errors
  const relationErrors = ctx.graph.getRelationErrors();
  if (relationErrors.length > 0) {
    issues.push(
      `Invalid relations: ${relationErrors.map((e) => `${e.entity}.${e.relation} → ${e.referencedEntity}`).join(", ")}`
    );
  }

  const inSync = issues.length === 0;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            inSync,
            entityCount: status.resolved.length,
            anchorCount: status.resolved.reduce(
              (sum, r) => sum + r.anchors.size,
              0
            ),
            issues: issues.length > 0 ? issues : undefined,
          },
          null,
          2
        ),
      },
    ],
  };
}
