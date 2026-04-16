---
date: 2026-04-16
classification: build-plan
action: Prototype an MCP config linter — validate CLAUDE.md syntax, flag common gotchas, ship as CLI + MCP server
source_brief: briefs/2026-04-16.md
---

## TL;DR

No CLAUDE.md linter exists today — npm, GitHub, and the Claude Code issue tracker are empty. The pain is real: users report instructions silently ignored after compaction, conflicting rules across scopes, and the 200-line limit being mistranslated as 500 in non-English docs. A standalone CLI that validates CLAUDE.md files against known gotchas, with an optional MCP server wrapper, is a clean weekend project with a warm audience. Ship the CLI first; the MCP server is a thin wrapper on top.

## Key findings

- **No existing tools.** Zero results on npm, GitHub, or community repos for a CLAUDE.md linter/validator. The closest thing is `/init`, which generates a CLAUDE.md but doesn't validate existing ones. (source: npm search, GitHub search)
- **Real user pain.** The Claude Code issue tracker surfaces recurring complaints: CLAUDE.md instructions ignored after `/compact`, conflicting instructions across project/user/local scopes, and language-locale instructions being overridden. Issue titles include "Post-compaction CLAUDE.md drift" and "PATTERN: Claude repeatedly violates the same explicit rules." (source: github.com/anthropics/claude-code/issues)
- **Official guidance exists to lint against.** Anthropic docs specify: target under 200 lines per file, use markdown headers/bullets, write specific verifiable instructions, understand scope precedence (managed > local > project > user). The docs also cover `.claude/rules/` for path-specific rules and `@import` for splitting large files. (source: docs.anthropic.com/en/docs/claude-code/memory)
- **Settings.json is a parallel surface.** Beyond CLAUDE.md, `settings.json` controls permissions, hooks, MCP servers, plugins, and sandbox config across 4 scopes. A linter that only checks CLAUDE.md misses half the config surface. (source: docs.anthropic.com/en/docs/claude-code/settings)
- **MCP server is trivial to add.** MCP tools are just JSON-RPC handlers with a schema. A `lint` tool that takes a file path and returns diagnostics is ~50 lines on top of the core logic. (source: modelcontextprotocol.io/docs/concepts/tools)

## Existing players / prior art

- **`/init` command** — built-in Claude Code command that generates/improves CLAUDE.md, but doesn't validate or lint — anthropic built-in
- **eslint / markdownlint** — general markdown linting; no CLAUDE.md-specific rules — npmjs.com
- **mcp-server-eslint** — community MCP server wrapping eslint, demonstrates the pattern — github.com

## Concrete next steps for Dirk

1. **Define the rule set (1 hour).** Catalog the top 10 gotchas from Anthropic docs + issue tracker: line count > 200, missing headers, conflicting instructions across scopes, typos in known tool names (Read/Edit/Bash/Grep/Glob/Write/Agent), permission rules referencing nonexistent tools, `@import` paths that don't resolve, `.claude/rules/` globs that match nothing, settings.json referencing unknown config keys.
2. **Build the CLI first (weekend).** TypeScript + Bun. Parse CLAUDE.md as markdown AST (use `unified`/`remark`). Each rule is a visitor function. Output: JSON diagnostics or pretty-printed terminal output. Ship as `npx claude-lint` or `bunx claude-lint`. Target: zero dependencies beyond remark.
3. **Add the MCP server wrapper (2 hours).** Use `@modelcontextprotocol/sdk`. Expose one tool: `lint(path?: string)` that returns diagnostics. Register in `.mcp.json`. This lets Claude itself run the linter during a session.
4. **Validate against real configs.** Lint your own `~/.claude/CLAUDE.md`, this repo's CLAUDE.md, and 5-10 public CLAUDE.md files from GitHub to calibrate false-positive rate.
5. **Ship to npm + announce.** Post to the Claude Code GitHub discussions and r/ClaudeAI. The "CLAUDE.md is being ignored" crowd is the target audience.

## Open questions

- Should the linter also validate `settings.json` and `.mcp.json`, or stay focused on CLAUDE.md only? Broader scope = more useful but harder to ship fast.
- Is there an official schema for `settings.json`? The docs describe it narratively but I didn't find a JSON Schema definition.
- Should rules be configurable (like eslint rules) or opinionated-by-default? Opinionated ships faster; configurable gets adopted by teams.
- Would Anthropic accept a PR to add `/lint` as a built-in command? The `/init` precedent suggests they might.
