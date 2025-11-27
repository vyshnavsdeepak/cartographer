---
name: graph:check
description: Verify architecture spec-code synchronization and report any drift
allowed-tools:
  - mcp__plugin_cartographer_cartographer__scan
  - mcp__plugin_cartographer_cartographer__validate
  - Read
---

# Graph Check Command

Verify that the codebase is synchronized with the architecture specification in `.graph/`.

## Workflow

1. **Run the scan** using the `mcp__plugin_cartographer_cartographer__scan` tool to analyze the current state
2. **Check for drift** between specifications and implementations:
   - Missing anchor comments in code (spec defines code_ref but anchor not found)
   - Orphaned anchors (code has `@graph:` anchor but no matching spec)
   - Type mismatches between spec field types and implementation
3. **Report findings** in a clear, actionable format

## Output Format

### When Synchronized

Report success with a summary:
```
✓ Architecture synchronized

Entities: 3 checked
Code References: 8 validated
Relations: 5 verified
```

### When Drift Detected

List each issue with actionable details:
```
✗ Drift detected

1. Missing anchor: User.model
   - Expected: @graph:User.model in src/models/user.ts
   - Action: Add anchor comment wrapping the User interface

2. Orphaned anchor: @graph:Session.handler
   - Found in: src/api/session.ts:45
   - Action: Either add Session entity to .graph/ or remove anchor

3. Type mismatch: Todo.priority
   - Spec: enum (low, medium, high)
   - Code: string
   - Action: Update implementation to use enum type
```

## Error Handling

If the scan fails:
- Report the error message clearly
- Suggest checking that `.graph/` directory exists
- Recommend running `cartographer scan` directly for debugging
