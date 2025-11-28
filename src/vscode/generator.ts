import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";

interface VSCodeSettings {
  "yaml.schemas"?: Record<string, string | string[]>;
  [key: string]: unknown;
}

interface VSCodeExtensions {
  recommendations?: string[];
}

const RECOMMENDED_EXTENSIONS = ["redhat.vscode-yaml"];

/**
 * Generate VS Code settings for YAML schema validation
 */
export function generateSettings(
  schemaPath: string,
  entityGlob: string
): VSCodeSettings {
  return {
    "yaml.schemas": {
      [schemaPath]: entityGlob,
    },
  };
}

/**
 * Generate VS Code extension recommendations
 */
export function generateExtensions(): VSCodeExtensions {
  return {
    recommendations: RECOMMENDED_EXTENSIONS,
  };
}

/**
 * Merge new settings into existing settings without overwriting user config
 */
export function mergeSettings(
  existing: VSCodeSettings,
  newSettings: VSCodeSettings
): VSCodeSettings {
  const result = { ...existing };

  // Merge yaml.schemas
  if (newSettings["yaml.schemas"]) {
    result["yaml.schemas"] = {
      ...(existing["yaml.schemas"] || {}),
      ...newSettings["yaml.schemas"],
    };
  }

  return result;
}

/**
 * Merge extension recommendations without duplicates
 */
export function mergeExtensions(
  existing: VSCodeExtensions,
  newExtensions: VSCodeExtensions
): VSCodeExtensions {
  const existingRecs = existing.recommendations || [];
  const newRecs = newExtensions.recommendations || [];

  const merged = [...new Set([...existingRecs, ...newRecs])];

  return {
    ...existing,
    recommendations: merged,
  };
}

/**
 * Write VS Code configuration files
 */
export async function writeVSCodeConfig(options: {
  projectRoot: string;
  schemaPath: string;
  entityGlob: string;
}): Promise<{
  settingsPath: string;
  extensionsPath: string;
  settingsCreated: boolean;
  extensionsCreated: boolean;
}> {
  const { projectRoot, schemaPath, entityGlob } = options;
  const vscodeDir = join(projectRoot, ".vscode");
  const settingsPath = join(vscodeDir, "settings.json");
  const extensionsPath = join(vscodeDir, "extensions.json");

  // Create .vscode directory if needed
  if (!existsSync(vscodeDir)) {
    await mkdir(vscodeDir, { recursive: true });
  }

  // Calculate relative path from project root to schema
  const relativeSchemaPath = relative(projectRoot, schemaPath);

  // Generate new config
  const newSettings = generateSettings(relativeSchemaPath, entityGlob);
  const newExtensions = generateExtensions();

  // Handle settings.json
  let existingSettings: VSCodeSettings = {};
  let settingsCreated = true;
  if (existsSync(settingsPath)) {
    settingsCreated = false;
    try {
      const content = await readFile(settingsPath, "utf-8");
      existingSettings = JSON.parse(content) as VSCodeSettings;
    } catch {
      // If parse fails, start fresh
      existingSettings = {};
    }
  }
  const mergedSettings = mergeSettings(existingSettings, newSettings);
  await writeFile(settingsPath, JSON.stringify(mergedSettings, null, 2) + "\n");

  // Handle extensions.json
  let existingExtensions: VSCodeExtensions = {};
  let extensionsCreated = true;
  if (existsSync(extensionsPath)) {
    extensionsCreated = false;
    try {
      const content = await readFile(extensionsPath, "utf-8");
      existingExtensions = JSON.parse(content) as VSCodeExtensions;
    } catch {
      existingExtensions = {};
    }
  }
  const mergedExtensions = mergeExtensions(existingExtensions, newExtensions);
  await writeFile(extensionsPath, JSON.stringify(mergedExtensions, null, 2) + "\n");

  return {
    settingsPath,
    extensionsPath,
    settingsCreated,
    extensionsCreated,
  };
}
