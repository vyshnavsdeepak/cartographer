import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { Graph } from "#graph/graph";
import { Resolver } from "#graph/resolver";

export function createServer(graphDir: string, sourceRoots: string[]) {
  const server = new McpServer({
    name: "cartographer",
    version: "1.0.0",
  });

  let graph: Graph | null = null;
  let resolver: Resolver | null = null;

  const ensureLoaded = async () => {
    if (!graph) {
      graph = new Graph(graphDir);
      await graph.load();
      resolver = new Resolver(graph, sourceRoots);
    }
    return { graph, resolver: resolver! };
  };

  // Tool: list_entities
  server.tool(
    "list_entities",
    "List all entities in the architecture graph",
    {},
    async () => {
      const { graph } = await ensureLoaded();
      const entities = graph.getAllEntities();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              entities.map((e) => ({
                name: e.name,
                description: e.description,
                fieldCount: e.fields.length,
              })),
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Tool: get_entity
  server.tool(
    "get_entity",
    "Get full details of an entity including fields and code references",
    { name: z.string().describe("Entity name") },
    async ({ name }) => {
      const { graph } = await ensureLoaded();
      const entity = graph.getEntity(name);
      if (!entity) {
        return {
          content: [{ type: "text" as const, text: `Entity '${name}' not found` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(entity, null, 2) }],
      };
    }
  );

  // Tool: get_anchor
  server.tool(
    "get_anchor",
    "Get the code location and content for an anchor",
    { anchor: z.string().describe("Anchor name, e.g., @graph:User.model") },
    async ({ anchor }) => {
      const { resolver } = await ensureLoaded();
      const status = await resolver.resolve();

      for (const resolved of status.resolved) {
        for (const [, anchorData] of resolved.anchors) {
          if (anchorData.anchor === anchor) {
            return {
              content: [
                {
                  type: "text" as const,
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

      // Check orphaned anchors too
      for (const anchorData of status.orphanedAnchors) {
        if (anchorData.anchor === anchor) {
          return {
            content: [
              {
                type: "text" as const,
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
        content: [{ type: "text" as const, text: `Anchor '${anchor}' not found in code` }],
        isError: true,
      };
    }
  );

  // Tool: check_sync_status
  server.tool(
    "check_sync_status",
    "Check if graph entities are in sync with code anchors",
    {},
    async () => {
      const { graph, resolver } = await ensureLoaded();
      const status = await resolver.resolve();

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
      const loadErrors = graph.getLoadErrors();
      if (loadErrors.length > 0) {
        issues.push(
          `Failed to load entities: ${loadErrors.map((e) => e.file).join(", ")}`
        );
      }

      const inSync = issues.length === 0;

      return {
        content: [
          {
            type: "text" as const,
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
  );

  return server;
}

export async function startServer(graphDir: string, sourceRoots: string[]) {
  const server = createServer(graphDir, sourceRoots);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
