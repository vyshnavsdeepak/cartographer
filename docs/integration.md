# Cartographer Integration Guide

This guide explains how to integrate Cartographer with AI coding assistants like Claude Code.

## Overview

Cartographer works through multiple integration layers:

| Layer | Mechanism | Enforcement Level |
|-------|-----------|-------------------|
| CLAUDE.md | Instructions for Claude | Advisory |
| Hooks | Post-edit verification | Feedback |
| MCP Tools | Query/verify the graph | Active |
| Git Hooks | Pre-commit validation | Blocking |

## Layer 1: CLAUDE.md Instructions

Create a `.claude/CLAUDE.md` file in your project to instruct Claude:

```markdown
# Project Architecture

This project uses Cartographer for spec-driven development.
The architecture is defined in `.graph/entities/`.

## Required Workflow

**Before implementing domain code:**
1. Run `list_entities` to see all defined entities
2. Run `get_entity <name>` to get the spec
3. Follow the spec exactly

**When writing implementation:**
1. Add `// @graph:EntityName.category` comments
2. Categories: model, schema, types, validation, api

**Before committing:**
1. Run `check_sync_status` to verify sync
2. Fix any missing or orphaned anchors
```

## Layer 2: Claude Code Hooks

Claude Code supports hooks that run after tool execution. Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "cartographer scan --quiet"
          }
        ]
      }
    ]
  }
}
```

### Hook Behavior

- **Exit 0**: Success - no output shown (scan passed)
- **Exit 1**: Error - output shown to Claude (scan failed)
- **Exit 2**: Blocking error - Claude stops and reports to user

### Configuration Options

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "cartographer scan --quiet",
            "timeout": 30000
          }
        ]
      }
    ]
  }
}
```

### Matching Multiple Tools

Use regex patterns to match multiple tools:

```json
{
  "matcher": "Edit|Write|Bash"
}
```

## Layer 3: MCP Tools

Cartographer exposes these MCP tools:

| Tool | Purpose |
|------|---------|
| `list_entities` | List all entities in the graph |
| `get_entity` | Get full entity spec with fields, relations |
| `get_anchor` | Find code location for an anchor |
| `get_relations` | Get entity relationships |
| `analyze_impact` | Predict impact of changes |
| `check_sync_status` | Verify graph-code sync |

### MCP Server Configuration

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "cartographer": {
      "command": "cartographer",
      "args": ["serve"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

Or with npx:

```json
{
  "mcpServers": {
    "cartographer": {
      "command": "npx",
      "args": ["cartographer", "serve"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

## Layer 4: Git Hooks

Add pre-commit validation to block commits with broken anchors:

```bash
#!/bin/sh
# .git/hooks/pre-commit

cartographer scan --quiet
if [ $? -ne 0 ]; then
  echo "Error: Graph and code are out of sync"
  echo "Run 'cartographer scan' to see details"
  exit 1
fi
```

Make it executable:

```bash
chmod +x .git/hooks/pre-commit
```

### Using Husky

If you use Husky for git hooks:

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "cartographer scan --quiet"
    }
  }
}
```

Or with lint-staged:

```json
{
  "lint-staged": {
    "**/*.{ts,js}": [
      "cartographer scan --quiet"
    ]
  }
}
```

## CLI Reference

### scan command

```bash
cartographer scan [--quiet]
```

**Options:**
- `--quiet`, `-q`: Minimal output (errors only)

**Exit codes:**
- `0`: All anchors in sync
- `1`: Sync errors found

### serve command

```bash
cartographer serve
```

Starts the MCP server for AI assistants.

## Best Practices

1. **Start with CLAUDE.md** - Low friction, immediate benefit
2. **Add hooks for enforcement** - Catches drift automatically
3. **Use git hooks for CI** - Prevents broken commits
4. **Review impact before changes** - Use `analyze_impact` tool

## Troubleshooting

### "No .graph/ found"

Initialize Cartographer first:
```bash
cartographer init
```

### "Missing anchors"

Add anchor comments to your code:
```typescript
// @graph:User.model
export class User { ... }
// @end:User.model
```

### "Orphaned anchors"

Either:
1. Add the anchor to `.graph/entities/*.yaml` under `code_refs`
2. Remove the comment from code if no longer needed

### Hooks not running

1. Check `.claude/settings.json` syntax
2. Verify cartographer is in PATH
3. Check hook matcher pattern matches tool name
