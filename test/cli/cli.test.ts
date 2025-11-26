import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const CLI_PATH = join(__dirname, "../../src/cli/index.ts");

/**
 * Integration tests for CLI commands.
 *
 * These tests run the actual CLI via tsx and verify:
 * - Exit codes
 * - Stdout/stderr output
 * - File system side effects
 */

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], cwd?: string): Promise<ExecResult> {
  const tsxPath = join(__dirname, "../../node_modules/.bin/tsx");
  return new Promise((resolve) => {
    const proc = spawn(tsxPath, [CLI_PATH, ...args], {
      cwd: cwd ?? process.cwd(),
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

describe("CLI", () => {
  describe("help", () => {
    it("shows help with --help", async () => {
      const result = await runCli(["--help"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Cartographer");
      expect(result.stdout).toContain("init");
      expect(result.stdout).toContain("scan");
      expect(result.stdout).toContain("serve");
    });

    it("shows help with -h", async () => {
      const result = await runCli(["-h"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Cartographer");
    });

    it("shows help when no command given", async () => {
      const result = await runCli([]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Usage");
    });

    it("shows error for unknown command", async () => {
      const result = await runCli(["unknown"]);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain("Unknown command");
    });
  });

  describe("init", () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `cartographer-test-${randomUUID()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it("creates .graph directory", async () => {
      const result = await runCli(["init"], testDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Created .graph/");

      const files = await readdir(testDir);
      expect(files).toContain(".graph");
    });

    it("creates entities subdirectory", async () => {
      await runCli(["init"], testDir);

      const graphFiles = await readdir(join(testDir, ".graph"));
      expect(graphFiles).toContain("entities");
    });

    it("creates config.yaml", async () => {
      await runCli(["init"], testDir);

      const graphFiles = await readdir(join(testDir, ".graph"));
      expect(graphFiles).toContain("config.yaml");

      const config = await readFile(
        join(testDir, ".graph", "config.yaml"),
        "utf-8"
      );
      expect(config).toContain("sourceRoots");
    });

    it("creates example entity", async () => {
      await runCli(["init"], testDir);

      const entityFiles = await readdir(join(testDir, ".graph", "entities"));
      expect(entityFiles).toContain("example.yaml");
    });

    it("fails if .graph already exists", async () => {
      await mkdir(join(testDir, ".graph"));

      const result = await runCli(["init"], testDir);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain("already exists");
    });

    it("suggests removal command on failure", async () => {
      await mkdir(join(testDir, ".graph"));

      const result = await runCli(["init"], testDir);

      expect(result.stdout).toContain("rm -rf");
    });
  });

  describe("scan", () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `cartographer-test-${randomUUID()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it("fails if .graph does not exist", async () => {
      const result = await runCli(["scan"], testDir);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain("No .graph/ found");
    });

    it("suggests init command on missing .graph", async () => {
      const result = await runCli(["scan"], testDir);

      expect(result.stdout).toContain("cartographer init");
    });

    it("scans successfully with valid setup", async () => {
      // Set up a valid .graph directory
      await mkdir(join(testDir, ".graph", "entities"), { recursive: true });
      await mkdir(join(testDir, "src"), { recursive: true });

      await writeFile(
        join(testDir, ".graph", "config.yaml"),
        "sourceRoots:\n  - src\n"
      );

      await writeFile(
        join(testDir, ".graph", "entities", "user.yaml"),
        `name: User
fields:
  - name: id
    type: uuid
`
      );

      await writeFile(
        join(testDir, "src", "user.ts"),
        "// Some code\n"
      );

      const result = await runCli(["scan"], testDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Scan Results");
      expect(result.stdout).toContain("Entities:");
    });

    it("reports missing anchors", async () => {
      await mkdir(join(testDir, ".graph", "entities"), { recursive: true });
      await mkdir(join(testDir, "src"), { recursive: true });

      await writeFile(
        join(testDir, ".graph", "config.yaml"),
        "sourceRoots:\n  - src\n"
      );

      // Entity with code_refs but no anchors in code
      await writeFile(
        join(testDir, ".graph", "entities", "user.yaml"),
        `name: User
fields:
  - name: id
    type: uuid
code_refs:
  model:
    anchor: "@graph:User.model"
`
      );

      await writeFile(join(testDir, "src", "user.ts"), "// No anchors here\n");

      const result = await runCli(["scan"], testDir);

      expect(result.code).toBe(1);
      expect(result.stdout).toContain("Missing anchors");
      expect(result.stdout).toContain("@graph:User.model");
    });

    it("shows entity count", async () => {
      await mkdir(join(testDir, ".graph", "entities"), { recursive: true });
      await mkdir(join(testDir, "src"), { recursive: true });

      await writeFile(
        join(testDir, ".graph", "config.yaml"),
        "sourceRoots:\n  - src\n"
      );

      await writeFile(
        join(testDir, ".graph", "entities", "user.yaml"),
        `name: User
fields:
  - name: id
    type: uuid
`
      );

      await writeFile(
        join(testDir, ".graph", "entities", "order.yaml"),
        `name: Order
fields:
  - name: id
    type: uuid
`
      );

      await writeFile(join(testDir, "src", "app.ts"), "");

      const result = await runCli(["scan"], testDir);

      expect(result.stdout).toContain("Entities:");
      expect(result.stdout).toMatch(/Entities:\s*2/);
    });
  });
});
