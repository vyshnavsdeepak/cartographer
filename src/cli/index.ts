#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { Graph } from "#graph/graph";
import { Resolver } from "#graph/resolver";
import { startServer } from "../mcp/server.js";

const GRAPH_DIR = ".graph";
const ENTITIES_DIR = "entities";
const CONFIG_FILE = "config.yaml";

interface Config {
  sourceRoots: string[];
}

async function loadConfig(graphPath: string): Promise<Config> {
  const configPath = join(graphPath, CONFIG_FILE);
  const defaultConfig: Config = { sourceRoots: ["src"] };

  if (!existsSync(configPath)) {
    return defaultConfig;
  }

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = parseYaml(content) as Partial<Config>;
    return {
      sourceRoots: parsed.sourceRoots ?? defaultConfig.sourceRoots,
    };
  } catch {
    return defaultConfig;
  }
}

// ANSI colors (disabled if not TTY)
const isTTY = process.stdout.isTTY;
const c = {
  green: (s: string) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s: string) => (isTTY ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s: string) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s: string) => (isTTY ? `\x1b[36m${s}\x1b[0m` : s),
  dim: (s: string) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s),
};

async function init() {
  const graphPath = join(process.cwd(), GRAPH_DIR);

  if (existsSync(graphPath)) {
    console.log(c.red(`✗ ${GRAPH_DIR}/ already exists`));
    console.log(c.dim(`\n  To start fresh, remove it first:`));
    console.log(c.dim(`  rm -rf ${GRAPH_DIR}/`));
    process.exit(1);
  }

  await mkdir(join(graphPath, ENTITIES_DIR), { recursive: true });

  await writeFile(
    join(graphPath, "config.yaml"),
    `# Cartographer configuration\nsourceRoots:\n  - src\n`
  );

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

  console.log(c.green(`✓ Created ${GRAPH_DIR}/`));
  console.log(`  └─ entities/example.yaml`);
  console.log(`  └─ config.yaml`);
  console.log(c.bold(`\nNext steps:`));
  console.log(`  1. Edit ${c.cyan(`${GRAPH_DIR}/entities/`)} to define your entities`);
  console.log(`  2. Add ${c.cyan(`// @graph:Entity.category`)} comments to your code`);
  console.log(`  3. Run: ${c.cyan(`cartographer scan`)}`);
}

async function scan() {
  const graphPath = join(process.cwd(), GRAPH_DIR);

  if (!existsSync(graphPath)) {
    console.log(c.red(`✗ No ${GRAPH_DIR}/ found`));
    console.log(c.dim(`\n  Initialize Cartographer first:`));
    console.log(c.dim(`  cartographer init`));
    process.exit(1);
  }

  const graph = new Graph(graphPath);
  await graph.load();

  const loadErrors = graph.getLoadErrors();
  if (loadErrors.length > 0) {
    console.log(c.red(`\n✗ Failed to load some entities:`));
    for (const err of loadErrors) {
      const relPath = relative(process.cwd(), err.file);
      console.log(c.red(`  ${relPath}`));
      console.log(c.dim(`    ${err.error.message.split("\n")[0]}`));
    }
  }

  const entities = graph.getAllEntities();
  if (entities.length === 0) {
    console.log(c.red(`✗ No entities found in ${GRAPH_DIR}/entities/`));
    console.log(c.dim(`\n  Create an entity definition:`));
    console.log(c.dim(`  ${GRAPH_DIR}/entities/user.yaml`));
    process.exit(1);
  }

  // Load config and resolve source roots
  const config = await loadConfig(graphPath);
  const sourceRoots = config.sourceRoots
    .map((root) => join(process.cwd(), root))
    .filter(existsSync);

  if (sourceRoots.length === 0) {
    console.log(c.red(`✗ No source directories found`));
    console.log(c.dim(`\n  Configured roots: ${config.sourceRoots.join(", ")}`));
    console.log(c.dim(`  Update sourceRoots in: ${GRAPH_DIR}/${CONFIG_FILE}`));
    process.exit(1);
  }

  const resolver = new Resolver(graph, sourceRoots);
  const status = await resolver.resolve();

  // Report results
  const totalAnchors = status.resolved.reduce((sum, r) => sum + r.anchors.size, 0);
  const totalMissing = status.resolved.reduce((sum, r) => sum + r.missing.length, 0);

  console.log(`\n${c.bold("Scan Results")}`);
  console.log(`  Entities: ${c.cyan(String(entities.length))}`);
  console.log(`  Anchors:  ${c.cyan(String(totalAnchors))}`);

  if (totalMissing > 0) {
    console.log(c.red(`\n✗ Missing anchors (defined in graph, not found in code):`));
    for (const resolved of status.resolved) {
      if (resolved.missing.length > 0) {
        for (const anchor of resolved.missing) {
          console.log(c.red(`  ${anchor}`));
          // Suggest how to fix
          const [entity, category] = anchor.replace("@graph:", "").split(".");
          console.log(c.dim(`    Add this comment to your code where ${entity} ${category} is defined:`));
          console.log(c.dim(`    // ${anchor}`));
        }
      }
    }
  }

  if (status.orphanedAnchors.length > 0) {
    console.log(c.yellow(`\n? Orphaned anchors (in code but not referenced in graph):`));
    for (const anchor of status.orphanedAnchors) {
      const relPath = relative(process.cwd(), anchor.file);
      console.log(c.yellow(`  ${anchor.anchor}`));
      console.log(c.dim(`    ${relPath}:${anchor.line}`));
    }
  }

  if (totalMissing === 0 && status.orphanedAnchors.length === 0 && loadErrors.length === 0) {
    console.log(c.green(`\n✓ All anchors in sync`));
  } else {
    process.exit(1);
  }
}

async function serve() {
  const graphPath = join(process.cwd(), GRAPH_DIR);

  if (!existsSync(graphPath)) {
    console.error(c.red(`✗ No ${GRAPH_DIR}/ found`));
    console.error(c.dim(`\n  Initialize Cartographer first:`));
    console.error(c.dim(`  cartographer init`));
    process.exit(1);
  }

  // Load config and resolve source roots
  const config = await loadConfig(graphPath);
  const sourceRoots = config.sourceRoots
    .map((root) => join(process.cwd(), root))
    .filter(existsSync);

  await startServer(graphPath, sourceRoots);
}

function help() {
  console.log(`${c.bold("Cartographer")} - Architecture graph for AI agents

${c.bold("Usage:")} cartographer <command>

${c.bold("Commands:")}
  ${c.cyan("init")}    Initialize .graph/ in current directory
  ${c.cyan("scan")}    Verify anchors match graph definitions
  ${c.cyan("serve")}   Start MCP server for AI assistants

${c.bold("Examples:")}
  ${c.dim("$")} cartographer init
  ${c.dim("$")} cartographer scan
  ${c.dim("$")} cartographer serve
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
    console.log(c.red(`Unknown command: ${command}`));
    console.log(c.dim(`\nRun ${c.cyan("cartographer --help")} for usage\n`));
    process.exit(1);
}
