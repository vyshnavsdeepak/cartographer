import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, "..");

/**
 * Plugin Validation Test Suite
 *
 * Validates the Cartographer plugin structure against Claude Code requirements:
 * - Plugin manifest (plugin.json)
 * - MCP configuration (.mcp.json)
 * - Commands (frontmatter validation)
 * - Skills (SKILL.md validation)
 * - Hooks (hooks.json validation)
 * - Path portability (${CLAUDE_PLUGIN_ROOT} usage)
 */

describe("Plugin Structure", () => {
  describe("plugin.json manifest", () => {
    const manifestPath = join(PLUGIN_ROOT, ".claude-plugin", "plugin.json");
    let manifest: Record<string, unknown>;

    beforeAll(() => {
      expect(existsSync(manifestPath)).toBe(true);
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    });

    it("should have required name field", () => {
      expect(manifest.name).toBeDefined();
      expect(typeof manifest.name).toBe("string");
      expect(manifest.name).toMatch(/^[a-z][a-z0-9-]*$/); // kebab-case
    });

    it("should have valid version (semver)", () => {
      expect(manifest.version).toBeDefined();
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("should have description", () => {
      expect(manifest.description).toBeDefined();
      expect(typeof manifest.description).toBe("string");
      expect((manifest.description as string).length).toBeGreaterThan(10);
    });

    it("should have author information", () => {
      expect(manifest.author).toBeDefined();
      expect((manifest.author as Record<string, unknown>).name).toBeDefined();
    });

    it("should have repository URL", () => {
      expect(manifest.repository).toBeDefined();
      expect(manifest.repository).toMatch(/^https:\/\/github\.com\//);
    });

    it("should have keywords array", () => {
      expect(Array.isArray(manifest.keywords)).toBe(true);
      expect((manifest.keywords as string[]).length).toBeGreaterThan(0);
    });
  });

  describe("MCP configuration (.mcp.json)", () => {
    const mcpPath = join(PLUGIN_ROOT, ".mcp.json");
    let mcpConfig: Record<string, unknown>;

    beforeAll(() => {
      expect(existsSync(mcpPath)).toBe(true);
      mcpConfig = JSON.parse(readFileSync(mcpPath, "utf-8"));
    });

    it("should define cartographer server", () => {
      expect(mcpConfig.cartographer).toBeDefined();
    });

    it("should have command field", () => {
      const server = mcpConfig.cartographer as Record<string, unknown>;
      expect(server.command).toBeDefined();
      expect(typeof server.command).toBe("string");
    });

    it("should have args array", () => {
      const server = mcpConfig.cartographer as Record<string, unknown>;
      expect(Array.isArray(server.args)).toBe(true);
    });

    it("should use portable paths with ${CLAUDE_PLUGIN_ROOT}", () => {
      const server = mcpConfig.cartographer as Record<string, unknown>;
      const args = server.args as string[];

      // Check if any path-like args use the portable variable
      const pathArgs = args.filter(
        (arg) => arg.includes("/") || arg.includes("\\")
      );
      for (const pathArg of pathArgs) {
        expect(pathArg).toContain("${CLAUDE_PLUGIN_ROOT}");
      }
    });
  });

  describe("Directory structure", () => {
    it("should have .claude-plugin directory", () => {
      expect(existsSync(join(PLUGIN_ROOT, ".claude-plugin"))).toBe(true);
    });

    it("should have commands directory", () => {
      expect(existsSync(join(PLUGIN_ROOT, "commands"))).toBe(true);
    });

    it("should have skills directory", () => {
      expect(existsSync(join(PLUGIN_ROOT, "skills"))).toBe(true);
    });

    it("should have hooks directory", () => {
      expect(existsSync(join(PLUGIN_ROOT, "hooks"))).toBe(true);
    });

    it("should have README.md", () => {
      expect(existsSync(join(PLUGIN_ROOT, "README.md"))).toBe(true);
    });
  });
});

describe("Commands", () => {
  const commandsDir = join(PLUGIN_ROOT, "commands");

  // Helper to parse markdown frontmatter
  function parseFrontmatter(content: string): Record<string, unknown> | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    return parseYaml(match[1]);
  }

  // Get all command files
  function getCommandFiles(): string[] {
    if (!existsSync(commandsDir)) return [];
    return readdirSync(commandsDir).filter((f) => f.endsWith(".md"));
  }

  it("should have command files when commands exist", () => {
    const files = getCommandFiles();
    // This test will pass even with 0 files initially
    // Once commands are added, it validates them
    expect(Array.isArray(files)).toBe(true);
  });

  describe.each(
    getCommandFiles().length > 0 ? getCommandFiles() : ["placeholder.md"]
  )("Command: %s", (filename) => {
    // Skip placeholder test
    if (filename === "placeholder.md") {
      it.skip("no commands yet", () => {});
      return;
    }

    const filepath = join(commandsDir, filename);
    let content: string;
    let frontmatter: Record<string, unknown> | null;

    beforeAll(() => {
      content = readFileSync(filepath, "utf-8");
      frontmatter = parseFrontmatter(content);
    });

    it("should have valid YAML frontmatter", () => {
      expect(frontmatter).not.toBeNull();
    });

    it("should have name field", () => {
      expect(frontmatter?.name).toBeDefined();
      expect(typeof frontmatter?.name).toBe("string");
    });

    it("should have description field", () => {
      expect(frontmatter?.description).toBeDefined();
      expect(typeof frontmatter?.description).toBe("string");
    });

    it("should have allowed-tools array", () => {
      expect(frontmatter?.["allowed-tools"]).toBeDefined();
      expect(Array.isArray(frontmatter?.["allowed-tools"])).toBe(true);
    });

    it("should reference valid MCP tool names in allowed-tools", () => {
      const tools = frontmatter?.["allowed-tools"] as string[];
      const mcpToolPattern = /^mcp__plugin_cartographer_cartographer__\w+$/;
      const builtinTools = ["Read", "Write", "Edit", "Bash", "Grep", "Glob"];

      for (const tool of tools) {
        const isValid =
          mcpToolPattern.test(tool) || builtinTools.includes(tool);
        expect(isValid).toBe(true);
      }
    });

    it("should have content after frontmatter", () => {
      const contentAfterFrontmatter = content.replace(
        /^---\n[\s\S]*?\n---\n*/,
        ""
      );
      expect(contentAfterFrontmatter.trim().length).toBeGreaterThan(50);
    });
  });
});

describe("Skills", () => {
  const skillsDir = join(PLUGIN_ROOT, "skills");

  // Helper to parse markdown frontmatter
  function parseFrontmatter(content: string): Record<string, unknown> | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    return parseYaml(match[1]);
  }

  // Get all skill directories that have SKILL.md
  function getSkillDirs(): string[] {
    if (!existsSync(skillsDir)) return [];
    return readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .filter((d) => existsSync(join(skillsDir, d.name, "SKILL.md")))
      .map((d) => d.name);
  }

  it("should have skill directories when skills exist", () => {
    const dirs = getSkillDirs();
    expect(Array.isArray(dirs)).toBe(true);
  });

  describe.each(
    getSkillDirs().length > 0 ? getSkillDirs() : ["placeholder-skill"]
  )("Skill: %s", (skillName) => {
    // Skip placeholder test
    if (skillName === "placeholder-skill") {
      it.skip("no skills yet", () => {});
      return;
    }

    const skillPath = join(skillsDir, skillName, "SKILL.md");
    let content: string;
    let frontmatter: Record<string, unknown> | null;

    beforeAll(() => {
      content = readFileSync(skillPath, "utf-8");
      frontmatter = parseFrontmatter(content);
    });

    it("should have SKILL.md file", () => {
      expect(existsSync(skillPath)).toBe(true);
    });

    it("should have valid YAML frontmatter", () => {
      expect(frontmatter).not.toBeNull();
    });

    it("should have name field", () => {
      expect(frontmatter?.name).toBeDefined();
      expect(typeof frontmatter?.name).toBe("string");
    });

    it("should have description field with trigger keywords", () => {
      expect(frontmatter?.description).toBeDefined();
      const desc = frontmatter?.description as string;
      expect(desc.length).toBeGreaterThan(50);
      // Should contain activation trigger phrases
      expect(desc.toLowerCase()).toMatch(
        /(should be used when|activates when|triggers on)/
      );
    });

    it("should have version field", () => {
      expect(frontmatter?.version).toBeDefined();
      expect(frontmatter?.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("should have substantial content", () => {
      const contentAfterFrontmatter = content.replace(
        /^---\n[\s\S]*?\n---\n*/,
        ""
      );
      expect(contentAfterFrontmatter.trim().length).toBeGreaterThan(500);
    });
  });
});

describe("Hooks", () => {
  const hooksPath = join(PLUGIN_ROOT, "hooks", "hooks.json");

  describe("hooks.json", () => {
    // Skip if hooks.json doesn't exist yet
    if (!existsSync(hooksPath)) {
      it.skip("hooks.json not created yet", () => {});
      return;
    }

    let hooksConfig: Record<string, unknown>;

    beforeAll(() => {
      hooksConfig = JSON.parse(readFileSync(hooksPath, "utf-8"));
    });

    it("should have valid JSON structure", () => {
      expect(hooksConfig).toBeDefined();
    });

    it("should have hooks wrapper object", () => {
      expect(hooksConfig.hooks).toBeDefined();
      expect(typeof hooksConfig.hooks).toBe("object");
    });

    it("should only use valid hook events", () => {
      const validEvents = [
        "PreToolUse",
        "PostToolUse",
        "Stop",
        "SubagentStop",
        "SessionStart",
        "SessionEnd",
        "UserPromptSubmit",
        "PreCompact",
        "Notification",
      ];

      const hooks = hooksConfig.hooks as Record<string, unknown>;
      for (const event of Object.keys(hooks)) {
        expect(validEvents).toContain(event);
      }
    });

    it("should have valid hook structure for each event", () => {
      const hooks = hooksConfig.hooks as Record<string, unknown[]>;

      for (const [_event, hookArray] of Object.entries(hooks)) {
        expect(Array.isArray(hookArray)).toBe(true);

        for (const hook of hookArray) {
          const h = hook as Record<string, unknown>;
          expect(h.matcher).toBeDefined();
          expect(h.hooks).toBeDefined();
          expect(Array.isArray(h.hooks)).toBe(true);
        }
      }
    });

    it("should use portable paths in command hooks", () => {
      const hooks = hooksConfig.hooks as Record<string, unknown[]>;

      for (const hookArray of Object.values(hooks)) {
        for (const hookGroup of hookArray) {
          const group = hookGroup as Record<string, unknown>;
          const innerHooks = group.hooks as Record<string, unknown>[];

          for (const hook of innerHooks) {
            if (hook.type === "command" && typeof hook.command === "string") {
              const cmd = hook.command as string;
              // If command contains a path, it should use ${CLAUDE_PLUGIN_ROOT}
              if (cmd.includes("/") && !cmd.startsWith("npx")) {
                expect(cmd).toContain("${CLAUDE_PLUGIN_ROOT}");
              }
            }
          }
        }
      }
    });

    it("should have reasonable timeouts", () => {
      const hooks = hooksConfig.hooks as Record<string, unknown[]>;

      for (const hookArray of Object.values(hooks)) {
        for (const hookGroup of hookArray) {
          const group = hookGroup as Record<string, unknown>;
          const innerHooks = group.hooks as Record<string, unknown>[];

          for (const hook of innerHooks) {
            if (hook.timeout !== undefined) {
              const timeout = hook.timeout as number;
              expect(timeout).toBeGreaterThan(0);
              expect(timeout).toBeLessThanOrEqual(120); // Max 2 minutes
            }
          }
        }
      }
    });
  });
});

describe("Path Portability", () => {
  it("should not have hardcoded absolute paths in any config file", () => {
    const configFiles = [
      join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"),
      join(PLUGIN_ROOT, ".mcp.json"),
    ];

    const hooksPath = join(PLUGIN_ROOT, "hooks", "hooks.json");
    if (existsSync(hooksPath)) {
      configFiles.push(hooksPath);
    }

    for (const filepath of configFiles) {
      if (existsSync(filepath)) {
        const content = readFileSync(filepath, "utf-8");
        // Check for hardcoded home directory paths
        expect(content).not.toMatch(/\/Users\/\w+/);
        expect(content).not.toMatch(/\/home\/\w+/);
        expect(content).not.toMatch(/C:\\Users\\\w+/);
      }
    }
  });
});
