---
date: 2026-11-20
classification: build-plan
action: Run AgentProof's demo, then sketch how one UIPE snapshot tool call would emit a signed {url, ts, dom_hash, screenshot_hash} record
source_brief: briefs/2026-11-20.md
---

## TL;DR
Don't put signing in UIPE. AgentProof's Claude Code plugin already signs **every** MCP tool call, UIPE's included, using Ed25519 and a SHA-256 hash chain. It does that from a PostToolUse hook, without UIPE knowing about it. What it signs is opaque, though: `output_sha256` is a hash of the whole JSON `tool_response`, so nobody can tell from it *which page* the agent saw, and a third party can't recompute it from a PNG file. So the gap is small. UIPE should put a plain, unsigned `{url, ts, scene_hash, screenshot_sha256}` text block into the `get_screenshot` result. AgentProof's hook then signs it along with everything else. That's about 15 lines in one file and no key management. Also, UIPE has no `snapshot` tool. The real targets are `get_screenshot` and `get_scene`.

## Key findings
- The demo signs one typed action in your browser (WebCrypto `subtle.generateKey/sign/verify`, Ed25519). The whole proof travels in the link, so editing the action breaks verification. The ladder is free demo → plugin → $490 two-week pilot with a hosted verify page. (source: https://agentproofchain.com/try/)
- The Claude Code plugin logs each tool call as tool name, `input_sha256`, `output_sha256`, session id, tool-use id and duration, written to `~/.agentproof/agent.jsonl`. Raw I/O is not stored. Install is `/plugin marketplace add https://agentproofchain.com/claude/agentproof.git`. (source: https://agentproofchain.com/claude/)
- The page is explicit about the limit: it "proves what was signed and that nothing changed afterwards. It does not prove a tool told the truth." UIPE can't close that gap either. A record of what UIPE saw is still a claim made by UIPE.
- Entry format, from `agentproof_local.py`: `{type, data, prev_hash, signed_at, entry_hash, signature}`. Canonicalization is Python `json.dumps(sort_keys=True)`, which is **not** RFC 8785. If a TS signer in UIPE tried to match those bytes, it would diverge on non-ASCII text (Python escapes it to `\uXXXX`, JS `JSON.stringify` does not) and on float formatting. That alone argues against UIPE signing in a compatible format. (source: https://agentproofchain.com/dl/agentproof_local.py)
- `record_event` is exposed as an MCP tool, so an agent could sign UIPE's record explicitly with no UIPE code at all. The cost is one extra tool call per action, and the agent can forget to make it.
- **Name collision:** on PyPI, `agentproof` is an unrelated package from praxiumlabs ("pytest-based behavioral testing framework"). The `pip install agentproof` on AgentProof's page may install that package instead, so use the plugin or `agentproof_local.py`. (source: https://pypi.org/pypi/agentproof/json)
- The UIPE `get_screenshot` handler returns only an image block today (`packages/core/src/mcp/server.ts:230-247`). `node:crypto` `createHash` is already used in `dataset/recorder/dedup.ts`.

## Existing players / prior art
- AgentProof: signed tool-call log, hosted verifier MCP at `https://agentproofchain.com/mcp` — https://agentproofchain.com/claude/
- AgentMall: approval bound to an exact basket, which is the same "proof of action" idea applied to commerce (from today's brief)
- UIPE envelope work (`actions/2026-11-15`, `2026-11-16`): the existing thread on trust envelopes. This record should live under the same name.

## Concrete next steps for Dirk
1. **5 min:** open https://agentproofchain.com/try/, sign an action, edit one character, and watch verification fail. That's the demo.
2. **15 min, the sketch:** in `get_screenshot` (`server.ts:237`), after `runtime.screenshot()`, add a second content block containing `JSON.stringify({url, ts: new Date().toISOString(), scene_hash, screenshot_sha256})`. `screenshot_sha256` is `sha256` of the raw PNG bytes, not the base64. Hash UIPE's serialized scene for `scene_hash`, not raw DOM, because raw DOM churns on dynamic ids and attribute order. The scene is what the agent actually saw. `// ponytail: unsigned; AgentProof hook signs the whole response`.
3. **10 min, the check:** install the AgentProof plugin, make one `get_screenshot` call, then run `/agentproof:verify`. Save the PNG yourself and confirm that its `shasum -a 256` matches `screenshot_sha256` in the response. If it matches, a "perception receipt" works end to end without UIPE owning any crypto.
4. Only add a native signer to UIPE (Ed25519 via `node:crypto`, about 30 lines) if a customer needs receipts *without* AgentProof installed. Wait until someone actually asks.

## Open questions
- Does the PostToolUse `tool_response` that Claude Code passes to hooks include MCP image blocks verbatim, or a truncated or placeholder form? If it's a placeholder, `output_sha256` doesn't cover the screenshot, and the explicit `screenshot_sha256` becomes the only binding.
- Should `ts` be UIPE's capture time or the hook's `signed_at`? The two can drift apart by the tool's duration.
- How stable does `scene_hash` stay across two identical renders? Test that before treating it as evidence.
