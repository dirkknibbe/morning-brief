---
date: 2026-04-14
classification: research
action: Investigate Prismor's PreToolUse hook pattern for secret scrubbing and its applicability to UIPE tool-boundary work / agent-security MCP server
source_brief: briefs/2026-04-14.md
---

## TL;DR

The PreToolUse hook is the only Claude Code hook that can **modify** tool input before execution — PostToolUse and UserPromptSubmit can only warn or block. The open-source `l-mb/claude-code-redaction-hooks` repo (13 stars) is the clearest implementation of this pattern: regex-based rules in YAML, with sha256-hashed secret matching so the rule file itself is safe to commit. The architecture gap — no output redaction — means session logs still leak secrets via tool *results*. This is both a limitation and a product opportunity: an MCP-server-based approach could intercept at a different layer (proxy between agent and tools) where both directions are writable.

## Key findings

- **PreToolUse is the only modifiable hook**: Claude Code's hook architecture allows PreToolUse to rewrite tool input JSON, but PostToolUse and UserPromptSubmit can only block or warn — they cannot modify content. This is a fundamental platform constraint. (source: https://docs.anthropic.com/en/docs/claude-code/hooks)
- **`l-mb/claude-code-redaction-hooks`** is a Python/uv-based CLI that installs as `redact`, auto-configures Claude Code hooks, and supports block/redact actions with regex patterns, tool-specific scoping (e.g., Bash only), and hashed secrets. 13 stars, 1 open issue, actively maintained. (source: https://github.com/l-mb/claude-code-redaction-hooks)
- **One-way redaction only**: The tool tracks redactions via a mapping file but cannot reverse them — responses from Claude still contain the redacted placeholder, not the original. No un-redact on output path.
- **Competitive landscape is thin but growing**: SecurityScanner (agent ecosystem scanner), agent_shield (config scanner), and Pokrov.AI (Rust proxy that sanitizes JSON payloads between agents and LLM/MCP providers) are the closest alternatives. Pokrov.AI's proxy approach is architecturally closest to what an MCP server could do.
- **Session log leakage is a real pain point**: The brief's mention of secrets in `~/.claude` session logs aligns with the problem these tools solve. PostToolUse results (e.g., `cat .env` output) flow into session JSONL files unredacted because PostToolUse hooks can't modify output.

## Existing players / prior art

- **l-mb/claude-code-redaction-hooks** — PreToolUse/PostToolUse hook-based secret blocker/redactor for Claude Code — https://github.com/l-mb/claude-code-redaction-hooks
- **Pokrov.AI** — Self-hosted Rust proxy between AI agents and LLM/MCP providers, sanitizes JSON payloads — found via GitHub search (no direct URL fetched)
- **agent_shield** — CLI security scanner for AI agent configurations and tool integrations — found via GitHub search
- **SecurityScanner** — CLI scanner detecting prompt injection, command execution risks, and secret leakage in agent ecosystems — found via GitHub search

## Concrete next steps for Dirk

1. **Clone and test `l-mb/claude-code-redaction-hooks`** on a throwaway project. Set up a rule for a fake API key, trigger a `cat .env` via Claude Code, and verify PreToolUse blocks it. Then check the session JSONL to see what still leaks via PostToolUse output — that's the gap.
2. **Prototype an MCP-proxy approach**: Instead of hooks (limited to input-side), an MCP server that sits between Claude Code and downstream tools could intercept *both* directions. Think: `claude code → redaction-mcp → actual tool`. This sidesteps the PostToolUse limitation entirely. Pokrov.AI's Rust proxy is prior art for this pattern.
3. **Validate the $5-10/month pricing assumption**: The `l-mb` repo is free and open-source. A paid product needs to offer more: managed rule sets (AWS, GCP, Stripe key patterns), team-wide policy, audit logging of what was redacted and when, and the bidirectional proxy that OSS hooks can't do. The audit log alone may justify the price for compliance-sensitive teams.

## Open questions

- Why can't PostToolUse modify output? Is this a security design choice by Anthropic (preventing hooks from altering what the LLM "sees") or a technical limitation that might change?
- Does the MCP protocol itself allow a middleware/proxy pattern, or would this require a custom transport layer?
- What's the actual volume of secret leakage in production Claude Code sessions? The `codeburn` TUI developer (from today's brief) might have data on this.
- Is "Prismor" a company/blog that wrote about this pattern, or is it a label the brief's source pipeline assigned? Could not locate a prismor.com blog post — the domain returned empty.
