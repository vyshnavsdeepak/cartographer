#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { Graph } from "#graph/graph";
import { Resolver } from "#graph/resolver";
import { startServer } from "../mcp/server.js";
import {
  findAllCandidates,
  insertAnchors,
  previewInsertions,
  type AnchorCandidate,
} from "../annotate/index.js";
import {
  scanForEntities,
  generateEntityFiles,
  previewGeneration,
  formatEntitySummary,
} from "../infer/index.js";
import {
  checkConstraints,
  formatConstraintResults,
  type ConstraintResult,
} from "../constraints/index.js";

const GRAPH_DIR = ".graph";
const ENTITIES_DIR = "entities";
const CONFIG_FILE = "config.yaml";

interface Config {
  sourceRoots: string[];
}

/**
 * Recursively find all files matching extensions in a directory
 */
async function findFiles(
  dir: string,
  extensions: string[] = [".ts", ".tsx"]
): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir);

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);

      // Skip node_modules and hidden directories
      if (entry === "node_modules" || entry.startsWith(".")) continue;

      const stats = await stat(fullPath);
      if (stats.isDirectory()) {
        await walk(fullPath);
      } else if (extensions.some((ext) => entry.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
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
  console.log(`  2. Add ${c.cyan("// @" + "graph:YourEntity.model")} comments to your code`);
  console.log(`  3. Run: ${c.cyan(`cartographer scan`)}`);
}

async function scan(quiet = false) {
  const graphPath = join(process.cwd(), GRAPH_DIR);

  if (!existsSync(graphPath)) {
    console.error(c.red(`✗ No ${GRAPH_DIR}/ found`));
    if (!quiet) {
      console.error(c.dim(`\n  Initialize Cartographer first:`));
      console.error(c.dim(`  cartographer init`));
    }
    process.exit(1);
  }

  const graph = new Graph(graphPath);
  await graph.load();

  const loadErrors = graph.getLoadErrors();
  if (loadErrors.length > 0) {
    console.error(c.red(`✗ Failed to load some entities:`));
    for (const err of loadErrors) {
      const relPath = relative(process.cwd(), err.file);
      console.error(c.red(`  ${relPath}`));
      if (!quiet) {
        console.error(c.dim(`    ${err.error.message.split("\n")[0]}`));
      }
    }
  }

  const relationErrors = graph.getRelationErrors();
  if (relationErrors.length > 0) {
    console.error(c.red(`✗ Invalid relations (referencing non-existent entities):`));
    for (const err of relationErrors) {
      console.error(c.red(`  ${err.entity}.${err.relation} → ${err.referencedEntity}`));
      if (!quiet) {
        console.error(c.dim(`    Create ${GRAPH_DIR}/entities/${err.referencedEntity.toLowerCase()}.yaml or fix the relation`));
      }
    }
  }

  const entities = graph.getAllEntities();
  if (entities.length === 0) {
    console.error(c.red(`✗ No entities found in ${GRAPH_DIR}/entities/`));
    if (!quiet) {
      console.error(c.dim(`\n  Create an entity definition:`));
      console.error(c.dim(`  ${GRAPH_DIR}/entities/user.yaml`));
    }
    process.exit(1);
  }

  // Load config and resolve source roots
  const config = await loadConfig(graphPath);
  const sourceRoots = config.sourceRoots
    .map((root) => join(process.cwd(), root))
    .filter(existsSync);

  if (sourceRoots.length === 0) {
    console.error(c.red(`✗ No source directories found`));
    if (!quiet) {
      console.error(c.dim(`\n  Configured roots: ${config.sourceRoots.join(", ")}`));
      console.error(c.dim(`  Update sourceRoots in: ${GRAPH_DIR}/${CONFIG_FILE}`));
    }
    process.exit(1);
  }

  const resolver = new Resolver(graph, sourceRoots);
  const status = await resolver.resolve();

  // Report results
  const totalAnchors = status.resolved.reduce((sum, r) => sum + r.anchors.size, 0);
  const totalMissing = status.resolved.reduce((sum, r) => sum + r.missing.length, 0);

  // Only show summary in non-quiet mode
  if (!quiet) {
    console.log(`\n${c.bold("Scan Results")}`);
    console.log(`  Entities: ${c.cyan(String(entities.length))}`);
    console.log(`  Anchors:  ${c.cyan(String(totalAnchors))}`);
  }

  if (totalMissing > 0) {
    console.error(c.red(`✗ Missing anchors (defined in graph, not found in code):`));
    for (const resolved of status.resolved) {
      if (resolved.missing.length > 0) {
        for (const anchor of resolved.missing) {
          console.error(c.red(`  ${anchor}`));
          if (!quiet) {
            // Suggest how to fix
            const [entity, category] = anchor.replace("@graph:", "").split(".");
            console.error(c.dim(`    Add this comment to your code where ${entity} ${category} is defined:`));
            console.error(c.dim(`    // ${anchor}`));
          }
        }
      }
    }
  }

  if (status.orphanedAnchors.length > 0) {
    console.error(c.yellow(`? Orphaned anchors (in code but not referenced in graph):`));
    for (const anchor of status.orphanedAnchors) {
      console.error(c.yellow(`  ${anchor.anchor}`));
      if (!quiet) {
        const relPath = relative(process.cwd(), anchor.file);
        console.error(c.dim(`    ${relPath}:${anchor.line}`));
      }
    }
  }

  const hasErrors = totalMissing > 0 || status.orphanedAnchors.length > 0 || loadErrors.length > 0 || relationErrors.length > 0;
  if (!hasErrors) {
    if (!quiet) {
      console.log(c.green(`\n✓ All anchors in sync`));
    }
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

async function annotate(dryRun = false, minConfidence = 0.7) {
  const graphPath = join(process.cwd(), GRAPH_DIR);

  if (!existsSync(graphPath)) {
    console.error(c.red(`✗ No ${GRAPH_DIR}/ found`));
    console.error(c.dim(`\n  Initialize Cartographer first:`));
    console.error(c.dim(`  cartographer init`));
    process.exit(1);
  }

  const graph = new Graph(graphPath);
  await graph.load();

  const entities = graph.getAllEntities();
  if (entities.length === 0) {
    console.error(c.red(`✗ No entities found in ${GRAPH_DIR}/entities/`));
    process.exit(1);
  }

  // Load config and find source files
  const config = await loadConfig(graphPath);
  const sourceRoots = config.sourceRoots
    .map((root) => join(process.cwd(), root))
    .filter(existsSync);

  if (sourceRoots.length === 0) {
    console.error(c.red(`✗ No source directories found`));
    process.exit(1);
  }

  // Find all TypeScript files
  const allFiles: string[] = [];
  for (const root of sourceRoots) {
    const files = await findFiles(root);
    allFiles.push(...files);
  }

  console.log(
    c.dim(`Scanning ${allFiles.length} files in ${sourceRoots.length} source roots...\n`)
  );

  // First, resolve existing anchors to find what's missing
  const resolver = new Resolver(graph, sourceRoots);
  const status = await resolver.resolve();

  // Collect missing anchors by entity
  const missingByEntity = new Map<
    string,
    Array<{ category: string; anchor: string }>
  >();

  for (const resolved of status.resolved) {
    if (resolved.missing.length > 0) {
      const missing: Array<{ category: string; anchor: string }> = [];
      for (const anchor of resolved.missing) {
        const parts = anchor.replace("@graph:", "").split(".");
        const category = parts[1];
        if (parts.length >= 2 && category) {
          missing.push({ category, anchor });
        }
      }
      if (missing.length > 0) {
        missingByEntity.set(resolved.entity.name, missing);
      }
    }
  }

  if (missingByEntity.size === 0) {
    console.log(c.green(`✓ All anchors are already present in code`));
    return;
  }

  // Find candidates for all missing anchors
  const allCandidates: AnchorCandidate[] = [];
  let totalMissing = 0;

  for (const [entityName, missingAnchors] of missingByEntity) {
    totalMissing += missingAnchors.length;
    const entity = graph.getEntity(entityName);
    if (!entity) continue;

    const candidates = await findAllCandidates(allFiles, entity, missingAnchors);

    for (const [anchor, anchorCandidates] of candidates) {
      // Only take the best candidate if confidence >= threshold
      const best = anchorCandidates.find((c) => c.confidence >= minConfidence);
      if (best) {
        allCandidates.push(best);
      } else if (anchorCandidates.length > 0) {
        // Report low-confidence matches
        console.log(c.yellow(`? ${anchor} (needs manual review)`));
        for (const candidate of anchorCandidates.slice(0, 3)) {
          const relPath = relative(process.cwd(), candidate.file);
          console.log(
            c.dim(
              `    ${relPath}:${candidate.line + 1} - ${candidate.matchType} (${Math.round(candidate.confidence * 100)}%)`
            )
          );
        }
      } else {
        console.log(c.red(`✗ ${anchor} - no candidates found`));
      }
    }
  }

  if (allCandidates.length === 0) {
    console.log(
      c.yellow(`\n? Found ${totalMissing} missing anchors but no high-confidence candidates`)
    );
    console.log(c.dim(`  Try lowering --min-confidence or add anchors manually`));
    process.exit(1);
  }

  // Preview or apply
  if (dryRun) {
    console.log(c.bold(`\nWould add ${allCandidates.length} anchors:\n`));
    const previews = previewInsertions(allCandidates);
    for (const [file, lines] of previews) {
      const relPath = relative(process.cwd(), file);
      console.log(c.cyan(relPath));
      for (const line of lines) {
        console.log(c.dim(`  ${line}`));
      }
    }
    console.log(c.bold(`\nRun without --dry-run to apply changes`));
  } else {
    console.log(c.bold(`\nAdding ${allCandidates.length} anchors...\n`));
    const results = await insertAnchors(allCandidates);

    let successCount = 0;
    let failCount = 0;

    for (const result of results) {
      const relPath = relative(process.cwd(), result.file);
      if (result.success) {
        console.log(c.green(`✓ ${result.anchor}`));
        console.log(c.dim(`    ${relPath}:${result.line + 1}`));
        successCount++;
      } else {
        console.log(c.red(`✗ ${result.anchor}`));
        console.log(c.dim(`    ${result.error}`));
        failCount++;
      }
    }

    console.log(
      `\n${c.green(`${successCount} added`)}${failCount > 0 ? `, ${c.red(`${failCount} failed`)}` : ""}`
    );

    if (successCount > 0) {
      console.log(c.dim(`\nRun ${c.cyan("cartographer scan")} to verify`));
    }
  }
}

async function check(quiet = false) {
  const graphPath = join(process.cwd(), GRAPH_DIR);

  if (!existsSync(graphPath)) {
    console.error(c.red(`✗ No ${GRAPH_DIR}/ found`));
    if (!quiet) {
      console.error(c.dim(`\n  Initialize Cartographer first:`));
      console.error(c.dim(`  cartographer init`));
    }
    process.exit(1);
  }

  const graph = new Graph(graphPath);
  await graph.load();

  const entities = graph.getAllEntities();
  if (entities.length === 0) {
    console.error(c.red(`✗ No entities found in ${GRAPH_DIR}/entities/`));
    process.exit(1);
  }

  // Load config and find source files
  const config = await loadConfig(graphPath);
  const sourceRoots = config.sourceRoots
    .map((root) => join(process.cwd(), root))
    .filter(existsSync);

  if (sourceRoots.length === 0) {
    console.error(c.red(`✗ No source directories found`));
    process.exit(1);
  }

  // Find all TypeScript files
  const allFiles: string[] = [];
  for (const root of sourceRoots) {
    const files = await findFiles(root);
    allFiles.push(...files);
  }

  // Resolve anchors first
  const resolver = new Resolver(graph, sourceRoots);
  const status = await resolver.resolve();

  // Build anchor map with full anchor strings (e.g., "@graph:User.model")
  const allAnchors = new Map<string, import("../types/index.js").ResolvedAnchor>();
  for (const resolved of status.resolved) {
    for (const [category, info] of resolved.anchors) {
      // Build the full anchor string from entity name and category
      const fullAnchor = `@graph:${resolved.entity.name}.${category}`;
      allAnchors.set(fullAnchor, info);
    }
  }

  // Check constraints for all entities
  const allResults: ConstraintResult[] = [];
  let entitiesWithConstraints = 0;

  for (const entity of entities) {
    if (entity.constraints && entity.constraints.length > 0) {
      entitiesWithConstraints++;
      const results = await checkConstraints(
        entity,
        allAnchors,
        allFiles,
        process.cwd()
      );
      allResults.push(...results);
    }
  }

  if (entitiesWithConstraints === 0) {
    if (!quiet) {
      console.log(c.yellow(`? No constraints defined in any entity`));
      console.log(c.dim(`  Add constraints to entity files to enforce architectural rules`));
    }
    return;
  }

  const { passed, failed, summary } = formatConstraintResults(allResults);

  if (!quiet) {
    console.log(`\n${c.bold("Constraint Check Results")}`);
    console.log(`  Rules checked: ${c.cyan(String(allResults.length))}`);
    console.log(`  Passed: ${c.green(String(passed))}`);
    if (failed > 0) {
      console.log(`  Failed: ${c.red(String(failed))}`);
    }
  }

  if (failed > 0) {
    console.log(c.red(`\n✗ Constraint violations found:\n`));
    for (const line of summary) {
      if (line.startsWith("  [")) {
        console.log(c.red(line));
      } else if (line.startsWith("    ") && line.includes(":")) {
        console.log(c.yellow(line));
      } else {
        console.log(c.dim(line));
      }
    }
    process.exit(1);
  } else {
    if (!quiet) {
      console.log(c.green(`\n✓ All constraints satisfied`));
    }
  }
}

async function infer(generate = false, minConfidence = 0.6) {
  const graphPath = join(process.cwd(), GRAPH_DIR);
  const entitiesPath = join(graphPath, ENTITIES_DIR);

  // Load config (use defaults if no .graph exists yet)
  let sourceRoots: string[];
  if (existsSync(graphPath)) {
    const config = await loadConfig(graphPath);
    sourceRoots = config.sourceRoots
      .map((root) => join(process.cwd(), root))
      .filter(existsSync);
  } else {
    // Default to src if no config
    const defaultRoot = join(process.cwd(), "src");
    sourceRoots = existsSync(defaultRoot) ? [defaultRoot] : [process.cwd()];
  }

  if (sourceRoots.length === 0) {
    console.error(c.red(`✗ No source directories found`));
    process.exit(1);
  }

  // Find all TypeScript files
  const allFiles: string[] = [];
  for (const root of sourceRoots) {
    const files = await findFiles(root);
    allFiles.push(...files);
  }

  console.log(
    c.dim(`Scanning ${allFiles.length} files in ${sourceRoots.length} source roots...\n`)
  );

  // Scan for entities
  const entities = await scanForEntities(allFiles);

  // Filter by confidence
  const filtered = entities.filter((e) => e.confidence >= minConfidence);

  if (filtered.length === 0) {
    console.log(c.yellow(`? No entities found with confidence >= ${Math.round(minConfidence * 100)}%`));
    console.log(c.dim(`  Try lowering --min-confidence or check your source files`));
    return;
  }

  console.log(c.bold(`Found ${filtered.length} entities:\n`));

  for (const entity of filtered) {
    console.log(formatEntitySummary(entity, process.cwd()));
    console.log();
  }

  if (!generate) {
    // Preview mode
    console.log(c.bold(`\nYAML Preview:\n`));
    const previews = previewGeneration(filtered, process.cwd());
    for (const [name, yaml] of previews) {
      console.log(c.cyan(`--- ${name.toLowerCase()}.yaml ---`));
      console.log(c.dim(yaml));
    }
    console.log(c.bold(`\nRun with --generate to create entity files`));
    return;
  }

  // Generate mode
  if (!existsSync(graphPath)) {
    console.log(c.dim(`Creating ${GRAPH_DIR}/ directory...`));
    await mkdir(entitiesPath, { recursive: true });

    // Create default config
    await writeFile(
      join(graphPath, "config.yaml"),
      `# Cartographer configuration\nsourceRoots:\n  - src\n`
    );
  }

  console.log(c.bold(`\nGenerating entity files...\n`));

  const results = await generateEntityFiles(filtered, {
    outputDir: entitiesPath,
    baseDir: process.cwd(),
  });

  let successCount = 0;
  let failCount = 0;

  for (const result of results) {
    const relPath = relative(process.cwd(), result.filePath);
    if (result.success) {
      console.log(c.green(`✓ ${result.entityName}`));
      console.log(c.dim(`    ${relPath}`));
      successCount++;
    } else {
      console.log(c.red(`✗ ${result.entityName}`));
      console.log(c.dim(`    ${result.error}`));
      failCount++;
    }
  }

  console.log(
    `\n${c.green(`${successCount} generated`)}${failCount > 0 ? `, ${c.red(`${failCount} failed`)}` : ""}`
  );

  if (successCount > 0) {
    console.log(c.dim(`\nNext steps:`));
    console.log(c.dim(`  1. Review generated files in ${c.cyan(`${GRAPH_DIR}/entities/`)}`));
    console.log(c.dim(`  2. Run ${c.cyan("cartographer annotate")} to add anchors to code`));
    console.log(c.dim(`  3. Run ${c.cyan("cartographer scan")} to verify`));
  }
}

function help() {
  console.log(`${c.bold("Cartographer")} - Architecture graph for AI agents

${c.bold("Usage:")} cartographer <command> [options]

${c.bold("Commands:")}
  ${c.cyan("init")}              Initialize .graph/ in current directory
  ${c.cyan("scan")} [--quiet]    Verify anchors match graph definitions
  ${c.cyan("check")} [--quiet]   Check architectural constraints
  ${c.cyan("annotate")}          Auto-suggest and add anchor comments to code
  ${c.cyan("infer")}             Infer entities from existing code
  ${c.cyan("serve")}             Start MCP server for AI assistants

${c.bold("Options:")}
  ${c.cyan("--quiet, -q")}       Minimal output (errors only), useful for CI/hooks
  ${c.cyan("--dry-run")}         Preview changes without modifying files (annotate)
  ${c.cyan("--generate")}        Generate YAML files from inferred entities (infer)
  ${c.cyan("--min-confidence")}  Minimum confidence threshold 0-1 (default: 0.7/0.6)

${c.bold("Examples:")}
  ${c.dim("$")} cartographer init
  ${c.dim("$")} cartographer scan
  ${c.dim("$")} cartographer scan --quiet
  ${c.dim("$")} cartographer check
  ${c.dim("$")} cartographer check --quiet
  ${c.dim("$")} cartographer annotate --dry-run
  ${c.dim("$")} cartographer annotate
  ${c.dim("$")} cartographer infer
  ${c.dim("$")} cartographer infer --generate
  ${c.dim("$")} cartographer serve
`);
}

// Main
const args = process.argv.slice(2);
const command = args[0];
const flags = new Set(args.slice(1));
const quiet = flags.has("--quiet") || flags.has("-q");
const dryRun = flags.has("--dry-run");
const generate = flags.has("--generate");

// Parse --min-confidence=X flag
let minConfidence = command === "infer" ? 0.6 : 0.7; // Default differs by command
for (const arg of args) {
  if (arg.startsWith("--min-confidence=")) {
    const valueStr = arg.split("=")[1];
    if (valueStr) {
      const value = parseFloat(valueStr);
      if (!isNaN(value) && value >= 0 && value <= 1) {
        minConfidence = value;
      }
    }
  }
}

switch (command) {
  case "init":
    init();
    break;
  case "scan":
    scan(quiet);
    break;
  case "check":
    check(quiet);
    break;
  case "serve":
    serve();
    break;
  case "annotate":
    annotate(dryRun, minConfidence);
    break;
  case "infer":
    infer(generate, minConfidence);
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
