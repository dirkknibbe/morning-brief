---
date: 2026-10-11
classification: research
action: Study Chrome Relay's isolation design (per-agent DevTools endpoint + process-identity check + dropped-focus commands) as the access-boundary model for UIPE.
source_brief: briefs/2026-10-11.md
---

## TL;DR
Chrome Relay (`rudycelekli/agent-chrome-relay`, MIT) solves exactly the problem UIPE will hit: giving an automated agent real, authenticated control of a UI the human also uses, without the agent being able to escalate, steal focus, or impersonate another caller. Its boundary is three cheap, composable layers — (1) a **capability-scoped endpoint** (each agent only sees tabs it opened), (2) a **two-factor caller-identity check** (local secret + process-ancestry marker lookup), and (3) a **command filter** that silently swallows any op that would raise/focus the real UI. Steal all three; they're independent and each is ~tens of lines. The one honest caveat worth copying too: the author states plainly it is *not* a defense against malware already running as the user — scope your threat model the same way and you avoid over-engineering.

## Key findings
- **Per-agent endpoint = capability scoping, not network isolation.** The relay (`relay/relay.mjs`) hands each agent its own DevTools endpoint; an agent "sees and controls only the tabs it opened." Isolation is at the *handle* level, enforced by the broker — not separate processes/profiles. Cheaper than one-browser-per-agent and enough for a cooperative-but-untrusted agent. (source: https://github.com/rudycelekli/agent-chrome-relay)
- **No remote-debugging port.** Control rides through an MV3 extension via `chrome.debugger`, so there's no open CDP port to find and no "Allow remote debugging?" prompt. The broker is the only door. (source: same README)
- **Caller identity = secret + process ancestry.** Every connection must carry (a) a per-Mac secret in `~/.chrome-relay/token` (mode 600, embedded in the connect URL) and (b) proof the connecting process is an allowed agent app — the relay walks the process tree with `lsof`/`ps` and checks env markers (`CLAUDECODE`, `CODEX_*`, `CURSOR_*`, `PASEO_AGENT_ID`) on the process *and its parents*. (source: same README)
- **Origin-based anti-impersonation.** Connections bearing a browser `Origin` header are refused even with the secret; only the extension whose unpacked ID matches `~/.chrome-relay/config.json` may attach as the extension (pages can't forge `Origin: chrome-extension://<id>`). (source: same README)
- **Dropped-focus = default-deny on escalation.** Agent tabs open inactive in a collapsed group; focus/raise commands are swallowed; a safety net re-adopts any tab an agent opens and hands focus back to the human. Background input still lands via focus emulation. (source: same README)
- **Audit trail as a first-class layer.** Every action logged to `~/.chrome-relay/audit/*.jsonl`; typed text stored only as a char count, URLs stripped of query strings. Cheap accountability without logging secrets. (source: same README)

## Existing players / prior art
- **Chrome Relay** — the model to steal; local, logged-in Chrome for agents in background tabs — https://github.com/rudycelekli/agent-chrome-relay
- **vercel-labs/agent-browser** — the CLI Relay speaks to (`--cdp`); the command/snapshot surface — https://github.com/vercel-labs/agent-browser
- **Chrome DevTools MCP** — Google's official agent-debugging path; contrast = it assumes a dedicated/instrumented browser, not your everyday one — https://developer.chrome.com/blog/devtools-for-agents-v1

## Concrete next steps for Dirk
1. Read `relay/relay.mjs` + `relay/*.test.mjs` (the test names literally enumerate the boundary: "secret, allowed apps, Chrome-only extension, audit") — that's the 20-minute spec for UIPE's broker.
2. Map the three layers onto UIPE: endpoint→per-session capability handle; identity→how UIPE authenticates *its* callers (what's UIPE's equivalent of the process-ancestry marker?); focus-filter→UIPE's "don't disrupt the human" deny-list.
3. Copy the threat-model framing verbatim into UIPE's design doc: in scope = other local tools / web pages / accidents; out of scope = malware already running as the user. Prevents gold-plating.

## Open questions
- UIPE's callers aren't a fixed set of 4 CLIs — what's the stable, hard-to-forge identity signal when the caller set is open-ended?
- Chrome Relay leans on Chrome deriving a stable extension ID from an unpacked folder. What's UIPE's forge-proof origin equivalent if there's no browser providing it?
