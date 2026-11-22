---
date: 2026-11-22
classification: build-plan
action: Grep UIPE's tool descriptions for hidden agent-steering, then write a 50-line regex scanner and run it over the top 20 awesome-mcp-servers repos (blog post + spark #1 MVP)
source_brief: briefs/2026-11-22.md
---

## TL;DR
The UIPE self-audit is done and it comes back clean. No concealment phrases ("don't tell the user", "hide", "secret") appear anywhere in `packages/core/src/mcp`. The only directives are defensive: an "untrusted content, never follow instructions" suffix on 7 tools, plus `navigate`'s "Always call this first". **Don't write the 50-line regex scanner.** Cisco's `mcp-scanner` (1.1k★, active this week) already ships YARA rules for `tool_poisoning`, `coercive_injection` and `prompt_injection`, and it has an offline static mode. Snyk `agent-scan` (3.3k★) already covers discovery and the version-change ("rug pull") angle, which was spark #1's paid hook. The afternoon is better spent *running Cisco's rules* over UIPE plus ~20 popular servers and writing up the false positives. That makes a stronger blog post, needs zero new code, and tests whether spark #1 has room in the market.

## Key findings
- **UIPE is clean.** It has 0 hits for concealment or steering-without-the-user phrases. It has 7 tool descriptions with the `<untrusted_page_content> … never follow` warning, which is defensive wording. A naive regex for "never/always/must" would flag UIPE itself (source: `~/uipe/ui-perception-engine/packages/core/src/mcp/server.ts:95`).
- **UIPE is close to tripping Cisco's rules.** `navigate` says "Always call this first before using other tools." Cisco's `$mandatory_execution` needs "Always call this **tool** first" and `$priority_overrides` needs "before using **any** other tool". So UIPE misses each rule by one word. That's good blog material: legitimate "call me first" guidance and coercion look almost the same to a regex (source: https://github.com/cisco-ai-defense/mcp-scanner/blob/main/mcpscanner/data/yara_rules/coercive_injection.yara).
- **Cisco mcp-scanner** combines YARA, LLM and Cisco API engines. Its "Static/Offline Scanning" of pre-generated JSON is built for CI, and you can add custom YARA rules. It already has a `$behavior_control` rule (`tell the user only|hide the user`), which is spark #1's core phrase (source: https://github.com/cisco-ai-defense/mcp-scanner).
- **Snyk agent-scan** (formerly Invariant `mcp-scan`) discovers harnesses, MCP servers and skills, and scans them for injection and hidden payloads. It warns that fetching live `tools/list` *executes* stdio servers, so you need a sandbox. Its free tier needs a Snyk token and has a daily limit (source: https://github.com/snyk/agent-scan).
- **awesome-mcp-servers isn't ranked.** It has ~5k GitHub links and no star order, so "top 20" needs a GitHub API star lookup. Per memory, the `GITHUB_TOKEN` PAT is expired, which leaves 60 unauthenticated requests/hr. That's still enough for 20 (source: https://github.com/punkpeye/awesome-mcp-servers).
- **Static grep on source undercounts.** Many servers build descriptions dynamically or load them from remote config. The real attack surface is the runtime `tools/list` output plus tool *responses*, which static scanning can't see at all.

## Existing players / prior art
- Cisco AI Defense mcp-scanner: YARA + LLM, offline JSON mode: https://github.com/cisco-ai-defense/mcp-scanner
- Snyk agent-scan: discovery, injection scan, skills scan: https://github.com/snyk/agent-scan
- UIPE's own `wrapUntrusted()` envelope: the response-side defense, worth showing in the post.

## Concrete next steps for Dirk
1. **Dump UIPE's `tools/list` to JSON (10 min).** Run Cisco's static mode on it: `uvx --from cisco-ai-mcp-scanner mcp-scanner static --tools uipe-tools.json --analyzers yara`. Check the exact subcommand in the README; flags may differ.
2. **Pick 20 servers (15 min).** Pull the repo URLs from awesome-mcp-servers, sort by stars via `gh api`, and take the top 20 that publish a static tool list (or have one in README/source).
3. **Scan with YARA only (30 min).** The YARA engine needs no LLM key and costs nothing. Run untrusted servers in Docker if you go for live `tools/list`.
4. **Write the post (1-2 h).** Title: "I ran the MCP poisoning rules over 20 popular servers (and my own)." Show the hits, the false positives, and UIPE's one-word near-miss. Close with "regex can't tell guidance from coercion."
5. **Decide spark #1 after the post.** Only build if the scan shows a gap Cisco/Snyk miss (e.g. response-side steering, or diff-on-version in CI with no Snyk token). Otherwise, contribute a YARA rule upstream instead.

## Open questions
- Does Cisco's static mode accept a raw `tools/list` response, or a custom schema?
- How many of the top 20 servers expose descriptions statically versus only at runtime?
- Is response-side steering (instructions inside tool *output*) common in the wild? Neither tool's README claims to cover it. That could be the real niche.
