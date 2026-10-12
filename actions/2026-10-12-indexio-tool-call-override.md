---
date: 2026-10-12
classification: research
action: Clone Indexio and read how it forces tool-call override against Claude Code's built-ins — the pattern UIPE/MCPAASTA needs to intercept an agent's default behavior.
source_brief: briefs/2026-10-12.md
---

## TL;DR
The "override" is **not** an MCP-protocol trick — MCP gives a server zero authority over a host's built-in tools. Indexio's interception lives entirely in the **harness hook layer**: `indexio hook install` writes `PreToolUse` hooks into `~/.claude/settings.json` that *deny* built-in `Bash`/`Read` calls on indexed files and name the indexio tool that replaces them. There are two layers — soft steering (tool descriptions say "use me instead of Grep") and hard enforcement (the deny hook). For UIPE this means: the hard part isn't an MCP feature you can ship — it's a separately-installed, harness-specific hook. Plan for a per-harness adapter and an escape hatch from day one.

## Key findings
- **No MCP-level override exists.** The server can only *suggest* via tool descriptions + the server `instructions` field ("the server tells Claude which built-in tool each indexio tool replaces"). Routing is still the model's choice. (source: https://raw.githubusercontent.com/IOServicesLabs/indexio/main/README.md, §"The tools")
- **The hard override is a `PreToolUse` deny hook.** `hook read` takes Claude Code's hook JSON on stdin and prints `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<names the indexio tool>"}}` on stdout, exit 0. The deny reason is fed back to the model, steering it to the MCP tool. (source: crates/indexio/src/hook.rs:945-1120)
- **Four hooks, installed into user config:** `PreToolUse/Bash` (refuses `cat/sed/head/grep/rg/find` on indexed files; scripts & builds still run), `PreToolUse/Read` (refuses whole-file Read, names `file_outline`/`read_span`), `PreCompact`, `SessionStart`. (source: README §"Install the hooks")
- **Escape hatch is mandatory.** A refused command runs as typed with a trailing `# raw` or `INDEXIO_RAW=1` — without this you brick the agent when the index is wrong/stale. (source: README)
- **Non-portable.** "The hook ships tuned for Claude Code; the `PreToolUse` contract is the one other harnesses are converging on, but only Claude Code is tested." (source: README §"Team indexing")

## Existing players / prior art
- **Indexio** — Rust code-search MCP server; the override reference impl — https://github.com/IOServicesLabs/indexio
- **Claude Code hooks** — the actual enforcement primitive (`permissionDecision: deny`), not Indexio-specific — any MCPAASTA tool rides the same contract.

## Concrete next steps for Dirk
1. Read `hook.rs:945-1120` (the two `hook read` deny entry points) + README §"Install the hooks". That's ~40 lines + one table — the whole mechanism. Skip the Rust index/embed crates.
2. Prototype the override in **any language**: a ~15-line script that reads PreToolUse JSON on stdin and emits the `permissionDecision:"deny"` object. Indexio's Rust is irrelevant to the pattern.
3. For UIPE, treat the **deny-reason copy as the product** — that steering text is the only lever that moves the model to your tool. Write it before any indexing logic.
4. Decide the `# raw` escape hatch and a settings.json installer now; defer the index.

## Open questions
- Compliance rate: does a deny-reason reliably make the model call the MCP tool, or does it sometimes retry/abandon? Indexio logs usage but quotes no adherence %.
- What's the `PreToolUse` contract for the non-Claude harnesses UIPE wants to target? Indexio tested only Claude Code — portability is unproven.
