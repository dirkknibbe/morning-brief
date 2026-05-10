---
date: 2026-05-10
classification: build-plan
action: Install Endara locally, register UIPE as a custom MCP server, capture JS-execution-mode trace, evaluate marketplace distribution.
source_brief: briefs/2026-05-10.md
---

## TL;DR
Endara Relay is a single Rust binary at `localhost:9400` that fans-out to MCP servers via a TOML config — registering UIPE is a 5-line `[[endpoints]]` block, no SDK changes needed. JS-execution mode (`local_js_execution = true`) is the interesting bit: it collapses every tool catalog to `search_tools` / `list_tools` / `execute_tools` and runs model-authored JS in a sandboxed Boa engine. Worth a 1-2hr test today. The "marketplace distribution" framing is **aspirational, not real yet** — the org has 3 stars, the desktop repo isn't public, and there's no documented listing process. Treat this as a tech evaluation that *might* turn into a distribution channel once Endara has traction, not a distribution play today.

## Key findings
- Endara Relay v0.1.5 is Apache-2.0 Rust, supports stdio/sse/http transports, hot-reloads TOML, prefixes tools as `<endpoint>__<tool>` (source: github.com/endara-ai/endara-relay)
- JS mode runs in **Boa engine, sandboxed — no fs / no network** — only tool-call calls. Model writes JS like `await uipe__navigate({url}); await uipe__get_scene();` in one round-trip (source: endara.ai)
- Custom servers register via TOML `[[endpoints]]` with `transport`, `command`, `args`, `env` (stdio) or `url` (sse/http). No registry handshake, no Endara-side approval needed for *local* use (source: endara-relay README)
- Management API is on a per-user UNIX socket (0600 perms), not TCP — useful for scripting/inspection, e.g. `curl --unix-socket .../api.sock /api/endpoints` (source: endara-relay README)
- Marketplace = "~15 curated servers" with OAuth wiring done in-app. No public submission flow; the desktop repo (`endara-ai/endara-desktop`) is referenced but not visible on the org page (source: github.com/endara-ai)
- Tool-name collisions mean UIPE's twelve tools become `uipe__act`, `uipe__navigate`, etc. — clients have to be re-prompted accordingly

## Existing players / prior art
- **endara-relay** — the thing itself, 3★, Rust, Apache-2.0 — github.com/endara-ai/endara-relay
- **mcp-proxy / supergateway** — older relay-style projects, mostly transport bridging not catalog merging
- **Anthropic MCP Inspector** — debug UI that calls a single MCP server; complementary, not competitive
- **Cursor / Claude Desktop native MCP config** — the status quo Endara is replacing

## Concrete next steps for Dirk
1. **Install + config** (~10 min): `brew install endara-ai/tap/endara-relay`, then write `~/.endara/config.toml` with one `[[endpoints]]` block pointing at the UIPE MCP binary (whatever command line currently launches `mcp__ui-perception-engine__*` for Claude Code — copy from `~/Library/Application Support/Claude/claude_desktop_config.json` or your CC mcp config). Set `local_js_execution = true` under `[relay]`.
2. **Smoke test** (~5 min): run `endara-relay --config ~/.endara/config.toml`, then `curl --unix-socket "$TMPDIR/endara-relay-$(id -u)/api.sock" http://localhost/api/endpoints` — confirm UIPE shows up healthy with N tools.
3. **JS-mode trace capture** (~20 min): point Claude Desktop at `http://localhost:9400/mcp`. Ask it to do something multi-step that exercises UIPE's *temporal perception* angle — e.g. "navigate to vercel.com, snapshot, scroll, snapshot again, tell me what changed." Save the `execute_tools` JS payload + the relay logs (`/api/endpoints/uipe/logs`). That trace is the artifact — paste it into a notes file in this repo so you have evidence of the flow.
4. **Failure-mode probe** (~15 min): UIPE returns binary artifacts (screenshots as file paths). Verify the JS sandbox doesn't choke on Buffer/file-path returns — Boa has no fs access, so anything UIPE returns must serialize cleanly through MCP JSON. If it doesn't, that's the real finding and the dossier flips to "UIPE needs a JSON-only mode for relay use."
5. **Distribution reality check**: open an issue on endara-relay asking how custom servers get into the marketplace. Don't ship a PR — just gauge whether there's a path. If the maintainer says "we'll add yours, send a logo," you have a distribution channel. If they say "marketplace is curated by us, not open" — distribution path is closed and you go back to direct install.

## Open questions
- Does UIPE's screenshot/binary-return path survive Boa's sandbox? (Probably yes for PNG paths, no for raw Buffers — needs the smoke test to know.)
- Is `endara-ai/endara-desktop` private because pre-launch, or because the marketplace is intentionally closed-source curation? Affects whether community-driven listings are even on the table.
- Does `local_js_execution = true` work with `stdio`-transport custom servers, or only with the Endara-curated cloud ones? Docs don't say explicitly — the relay README mentions it under `[relay]` (global), the homepage shows it working over arbitrary tools, but no example combines `local_js_execution` + a `[[endpoints]] transport = "stdio"` block.
