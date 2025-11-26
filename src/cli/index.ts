#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Graph } from "#graph/graph";
import { Resolver } from "#graph/resolver";
import { startServer } from "../mcp/server.js";

const GRAPH_DIR = ".graph";
const ENTITIES_DIR = "entities";

async function init() {
  const graphPath = join(process.cwd(), GRAPH_DIR);

  if (existsSync(graphPath)) {
    console.log(`✗ ${GRAPH_DIR}/ already exists`);
    process.exit(1);
  }

  await mkdir(join(graphPath, ENTITIES_DIR), { recursive: true });

  // Create config
  const config = {
    sourceRoots: ["src"],
  };
  await writeFile(
    join(graphPath, "config.yaml"),
    `# Cartographer configuration\nsourceRoots:\n  - src\n`
  );

  // Create sample entity
  const sampleEntity = `name: Example
description: Sample entity - replace with your own

fields:
  - name: id
    type: uuid
    primary: true
    description: Unique identifier

  - name: name
    type: string
    description: Display name

# Link to code with anchors:
# code_refs:
#   model:
#     anchor: "@graph:Example.model"
`;
  await writeFile(join(graphPath, ENTITIES_DIR, "example.yaml"), sampleEntity);

  console.log(`✓ Created ${GRAPH_DIR}/`);
  console.log(`  └─ entities/example.yaml`);
  console.log(`  └─ config.yaml`);
  console.log(`\nNext steps:`);
  console.log(`  1. Edit ${GRAPH_DIR}/entities/ to define your entities`);
  console.log(`  2. Add // @graph:Entity.category comments to your code`);
  console.log(`  3. Run: cartographer scan`);
}

async function scan() {
  const graphPath = join(process.cwd(), GRAPH_DIR);

  if (!existsSync(graphPath)) {
    console.log(`✗ No ${GRAPH_DIR}/ found. Run: cartographer init`);
    process.exit(1);
  }

  const graph = new Graph(graphPath);
  await graph.load();

  const loadErrors = graph.getLoadErrors();
  if (loadErrors.length > 0) {
    console.log(`✗ Failed to load some entities:`);
    for (const err of loadErrors) {
      console.log(`  ${err.file}: ${err.error.message}`);
    }
  }

  const entities = graph.getAllEntities();
  if (entities.length === 0) {
    console.log(`✗ No entities found in ${GRAPH_DIR}/entities/`);
    process.exit(1);
  }

  // Default source roots
  const sourceRoots = [join(process.cwd(), "src")].filter(existsSync);
  if (sourceRoots.length === 0) {
    console.log(`✗ No source directories found (tried: src/)`);
    process.exit(1);
  }

  const resolver = new Resolver(graph, sourceRoots);
  const status = await resolver.resolve();

  // Report results
  const totalAnchors = status.resolved.reduce((sum, r) => sum + r.anchors.size, 0);
  const totalMissing = status.resolved.reduce((sum, r) => sum + r.missing.length, 0);

  console.log(`\nEntities: ${entities.length}`);
  console.log(`Anchors found: ${totalAnchors}`);

  if (totalMissing > 0) {
    console.log(`\n✗ Missing anchors:`);
    for (const resolved of status.resolved) {
      if (resolved.missing.length > 0) {
        for (const anchor of resolved.missing) {
          console.log(`  ${anchor}`);
        }
      }
    }
  }

  if (status.orphanedAnchors.length > 0) {
    console.log(`\n? Orphaned anchors (in code but not in graph):`);
    for (const anchor of status.orphanedAnchors) {
      console.log(`  ${anchor.anchor} (${anchor.file}:${anchor.line})`);
    }
  }

  if (totalMissing === 0 && status.orphanedAnchors.length === 0 && loadErrors.length === 0) {
    console.log(`\n✓ All anchors in sync`);
  } else {
    process.exit(1);
  }
}

async function serve() {
  const graphPath = join(process.cwd(), GRAPH_DIR);

  if (!existsSync(graphPath)) {
    console.error(`✗ No ${GRAPH_DIR}/ found. Run: cartographer init`);
    process.exit(1);
  }

  // Default source roots
  const sourceRoots = [join(process.cwd(), "src")].filter(existsSync);

  await startServer(graphPath, sourceRoots);
}

function help() {
  console.log(`Cartographer - Architecture graph for AI agents

Usage: cartographer <command>

Commands:
  init    Initialize .graph/ in current directory
  scan    Verify anchors match graph definitions
  serve   Start MCP server for AI assistants

Examples:
  cartographer init
  cartographer scan
  cartographer serve
`);
}

// Main
const command = process.argv[2];

switch (command) {
  case "init":
    init();
    break;
  case "scan":
    scan();
    break;
  case "serve":
    serve();
    break;
  case "--help":
  case "-h":
  case undefined:
    help();
    break;
  default:
    console.log(`Unknown command: ${command}`);
    help();
    process.exit(1);
}
