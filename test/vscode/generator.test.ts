import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import {
  generateSettings,
  generateExtensions,
  mergeSettings,
  mergeExtensions,
  writeVSCodeConfig,
} from "../../src/vscode/generator.js";

describe("generateSettings", () => {
  it("generates settings with yaml.schemas", () => {
    const settings = generateSettings(
      ".graph/schema.json",
      ".graph/entities/*.yaml"
    );

    expect(settings["yaml.schemas"]).toBeDefined();
    expect(settings["yaml.schemas"]?.[".graph/schema.json"]).toBe(
      ".graph/entities/*.yaml"
    );
  });
});

describe("generateExtensions", () => {
  it("includes recommended extensions", () => {
    const extensions = generateExtensions();

    expect(extensions.recommendations).toBeDefined();
    expect(extensions.recommendations).toContain("redhat.vscode-yaml");
  });
});

describe("mergeSettings", () => {
  it("merges new settings into existing", () => {
    const existing = {
      "editor.fontSize": 14,
      "yaml.schemas": {
        "existing-schema.json": "*.yaml",
      },
    };

    const newSettings = {
      "yaml.schemas": {
        ".graph/schema.json": ".graph/entities/*.yaml",
      },
    };

    const merged = mergeSettings(existing, newSettings);

    expect(merged["editor.fontSize"]).toBe(14);
    expect(merged["yaml.schemas"]?.["existing-schema.json"]).toBe("*.yaml");
    expect(merged["yaml.schemas"]?.[".graph/schema.json"]).toBe(
      ".graph/entities/*.yaml"
    );
  });

  it("creates yaml.schemas if not existing", () => {
    const existing = { "editor.fontSize": 14 };
    const newSettings = {
      "yaml.schemas": {
        ".graph/schema.json": ".graph/entities/*.yaml",
      },
    };

    const merged = mergeSettings(existing, newSettings);

    expect(merged["yaml.schemas"]).toBeDefined();
    expect(merged["yaml.schemas"]?.[".graph/schema.json"]).toBe(
      ".graph/entities/*.yaml"
    );
  });
});

describe("mergeExtensions", () => {
  it("merges without duplicates", () => {
    const existing = {
      recommendations: ["ms-vscode.vscode-typescript-next"],
    };
    const newExtensions = {
      recommendations: ["redhat.vscode-yaml"],
    };

    const merged = mergeExtensions(existing, newExtensions);

    expect(merged.recommendations).toHaveLength(2);
    expect(merged.recommendations).toContain("ms-vscode.vscode-typescript-next");
    expect(merged.recommendations).toContain("redhat.vscode-yaml");
  });

  it("does not duplicate existing recommendations", () => {
    const existing = {
      recommendations: ["redhat.vscode-yaml"],
    };
    const newExtensions = {
      recommendations: ["redhat.vscode-yaml"],
    };

    const merged = mergeExtensions(existing, newExtensions);

    expect(merged.recommendations).toHaveLength(1);
  });

  it("handles empty existing recommendations", () => {
    const existing = {};
    const newExtensions = {
      recommendations: ["redhat.vscode-yaml"],
    };

    const merged = mergeExtensions(existing, newExtensions);

    expect(merged.recommendations).toContain("redhat.vscode-yaml");
  });
});

describe("writeVSCodeConfig", () => {
  const testDir = join(process.cwd(), "test-vscode-temp");

  beforeEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true });
    }
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true });
    }
  });

  it("creates .vscode directory if needed", async () => {
    const schemaPath = join(testDir, ".graph", "schema.json");
    await mkdir(join(testDir, ".graph"), { recursive: true });
    await writeFile(schemaPath, "{}");

    await writeVSCodeConfig({
      projectRoot: testDir,
      schemaPath,
      entityGlob: ".graph/entities/*.yaml",
    });

    expect(existsSync(join(testDir, ".vscode"))).toBe(true);
  });

  it("creates settings.json with yaml.schemas", async () => {
    const schemaPath = join(testDir, ".graph", "schema.json");
    await mkdir(join(testDir, ".graph"), { recursive: true });
    await writeFile(schemaPath, "{}");

    await writeVSCodeConfig({
      projectRoot: testDir,
      schemaPath,
      entityGlob: ".graph/entities/*.yaml",
    });

    const settingsPath = join(testDir, ".vscode", "settings.json");
    expect(existsSync(settingsPath)).toBe(true);

    const content = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(content);

    expect(settings["yaml.schemas"]).toBeDefined();
    expect(settings["yaml.schemas"][".graph/schema.json"]).toBe(
      ".graph/entities/*.yaml"
    );
  });

  it("creates extensions.json with recommendations", async () => {
    const schemaPath = join(testDir, ".graph", "schema.json");
    await mkdir(join(testDir, ".graph"), { recursive: true });
    await writeFile(schemaPath, "{}");

    await writeVSCodeConfig({
      projectRoot: testDir,
      schemaPath,
      entityGlob: ".graph/entities/*.yaml",
    });

    const extensionsPath = join(testDir, ".vscode", "extensions.json");
    expect(existsSync(extensionsPath)).toBe(true);

    const content = await readFile(extensionsPath, "utf-8");
    const extensions = JSON.parse(content);

    expect(extensions.recommendations).toContain("redhat.vscode-yaml");
  });

  it("preserves existing settings", async () => {
    // Create existing .vscode/settings.json
    const vscodeDir = join(testDir, ".vscode");
    await mkdir(vscodeDir, { recursive: true });
    await writeFile(
      join(vscodeDir, "settings.json"),
      JSON.stringify({ "editor.fontSize": 14 }, null, 2)
    );

    const schemaPath = join(testDir, ".graph", "schema.json");
    await mkdir(join(testDir, ".graph"), { recursive: true });
    await writeFile(schemaPath, "{}");

    await writeVSCodeConfig({
      projectRoot: testDir,
      schemaPath,
      entityGlob: ".graph/entities/*.yaml",
    });

    const content = await readFile(join(vscodeDir, "settings.json"), "utf-8");
    const settings = JSON.parse(content);

    expect(settings["editor.fontSize"]).toBe(14);
    expect(settings["yaml.schemas"]).toBeDefined();
  });

  it("returns status about created vs updated files", async () => {
    const schemaPath = join(testDir, ".graph", "schema.json");
    await mkdir(join(testDir, ".graph"), { recursive: true });
    await writeFile(schemaPath, "{}");

    const result = await writeVSCodeConfig({
      projectRoot: testDir,
      schemaPath,
      entityGlob: ".graph/entities/*.yaml",
    });

    expect(result.settingsCreated).toBe(true);
    expect(result.extensionsCreated).toBe(true);

    // Run again - should report as updated
    const result2 = await writeVSCodeConfig({
      projectRoot: testDir,
      schemaPath,
      entityGlob: ".graph/entities/*.yaml",
    });

    expect(result2.settingsCreated).toBe(false);
    expect(result2.extensionsCreated).toBe(false);
  });
});
