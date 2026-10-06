---
date: 2026-10-06
classification: research
action: Clone mcpward + schema-guard; study the "Claude Code hook + MCP server + CI check" tri-packaging template so UIPE can copy it.
source_brief: briefs/2026-10-06.md
---

## TL;DR
The pattern is real and worth copying, but it's **one core + N thin adapters**, not three separate products. schema-guard (`idk-arsh/schema-guard`) is the clean exemplar: a single pure checker (`check_sql(sql, snapshot)`) exposed through a Claude Code hook, an MCP server, a pre-commit hook, a CI command, **and** a paste-in rules file — all reading the same artifact. The leverage isn't the packaging, it's that every surface is ~20 lines of adapter over the same function, plus an `evals/` dir with measured numbers that makes the README credible. UIPE already has the MCP surface (the `ui-perception-engine` server); copying this means adding the hook + CI/pre-commit adapters + a rules file + an evals dir — not a rewrite. Do it, but budget most of the effort on the eval, not the plumbing.

## Key findings
- **One checker, 5 surfaces.** `pyproject.toml` declares two console entry points off the same package: `schema-guard = cli:main` and `schema-guard-mcp = mcp_server:main`. CI and pre-commit both just call the CLI. (source: https://github.com/idk-arsh/schema-guard/blob/master/pyproject.toml)
- **The hook is a 3-file add, not code.** `hooks/hooks.json` (a PreToolUse hook) + `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` give one-line install: `/plugin marketplace add idk-arsh/schema-guard`. No bespoke hook binary — it shells to the CLI. (source: https://github.com/idk-arsh/schema-guard/tree/master/.claude-plugin)
- **pre-commit is 5 lines.** `.pre-commit-hooks.yaml` is `entry: schema-guard check`, `files: \.sql$`. CI is the same CLI with a non-zero exit. (source: https://github.com/idk-arsh/schema-guard/blob/master/.pre-commit-hooks.yaml)
- **The README sells on measurement, not features.** Two eval tables (12/12 agent runs, 0 false blocks on 1,034 held-out Spider queries) with "be skeptical of this" caveats and rerun commands. That honesty is the distribution, more than the packaging. (source: https://github.com/idk-arsh/schema-guard#readme)
- **mcpward is the GitHub-Action variant.** TS/pnpm, ships a root `action.yml` so it's usable as `uses: TsvetanG2/mcpward@main` in a workflow — a cleaner CI surface than a raw CLI call, worth copying if UIPE wants drop-in Actions use. (source: https://github.com/TsvetanG2/mcpward)

## Existing players / prior art
- **schema-guard** — SQL-name hallucination guard, the template itself — https://github.com/idk-arsh/schema-guard
- **mcpward** — MCP contract/security testing, ships a GitHub Action (`action.yml`) — https://github.com/TsvetanG2/mcpward
- **data-agent-rules / show-your-sql / data-test-guard** — same author's "small, measured tool" family; the real meta-template is the *house style*, not one repo — https://github.com/idk-arsh

## Concrete next steps for Dirk
1. Refactor UIPE's core perception check into one pure function with a stable string/JSON denial format (the thing every surface reuses). This is the only non-trivial step.
2. Add the hook surface: `hooks/hooks.json` (PreToolUse) + `.claude-plugin/{plugin,marketplace}.json`, shelling to the existing UIPE CLI/MCP — copy schema-guard's three files almost verbatim.
3. Add `.pre-commit-hooks.yaml` + a CI snippet (or an `action.yml` à la mcpward) calling the same check with exit 1.
4. Write a one-screen `rules/uipe.md` paste-in for agents without hook support.
5. Build a small `evals/` dir with a reproducible number before publishing — that, not the packaging, is what made schema-guard credible.

## Open questions
- What is UIPE's "snapshot" equivalent — the committed artifact every surface reads? Without one, the hook/CI/pre-commit surfaces have nothing shared to check against.
- Is UIPE Python or TS? schema-guard (Python) uses console-script entry points; mcpward (TS) uses `action.yml`. The packaging mechanics differ — pick the exemplar that matches UIPE's language.
- Does UIPE's check run fast and offline enough to sit in a PreToolUse hook without annoying the agent? schema-guard's "stay quiet when unsure" rule is load-bearing for adoption.
