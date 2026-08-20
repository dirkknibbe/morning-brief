# Stealth Source Reader — Implementation TODO / Issues

Issues surfaced during subagent-driven execution of
`2026-08-20-stealth-source-reader.md`. Newest first.

## OPEN — BLOCKER (2026-08-20, Task 1 gate)

**The static `Fetcher` premise failed against the one source that matters.**

Task 1 live results:
- `Fetcher.get('https://example.com', impersonate='chrome')` → **200** (light install works, no browser). ✅
- `Fetcher.get('https://old.reddit.com/r/LocalLLaMA/hot.json', impersonate='chrome')` → **403**. ❌

Consequence: `impersonate` (TLS/UA spoofing) does **not** beat Reddit's block —
Reddit is blocking below the fingerprint layer (endpoint/IP / non-OAuth JSON
lockdown). Per the plan's Task 1 gate, **Task 7 (Reddit migration) is dropped**.

**The deeper problem:** with Reddit gone, the tier's only live targets are
Anthropic news + engineering, which the 2026-08-20 spike already proved are
**server-rendered — a plain `fetch` reads them**. So the Scrapling static-Fetcher
tier, as scoped, adds **no capability over a plain HTTP fetch**. Building
Tasks 2–8 would be plumbing (Python CLI + spawn + parse) around a fetch that
Bun's built-in `fetch` already does.

**Decision required (paused execution):**
1. **Plain-fetch tier, drop Scrapling** — add Anthropic (+ other server-rendered
   feed-less sources) via a Bun `fetch` + `parseHtmlList`. Keep Tasks 3–6/8,
   delete Task 2 (Python CLI) and the whole Scrapling dependency. Get Reddit
   back via OAuth separately. *(Lightest; likely the right call.)*
2. **Escalate to `StealthyFetcher` + Camoufox** — the deferred heavy browser
   tier — to actually beat Reddit. Reopens the browser dependency we spent this
   session avoiding. Only worth it if Reddit specifically is must-have.
3. **Reddit via OAuth** (sanctioned API, 100 req/min) instead of any scraping —
   orthogonal to this plan; a separate small task.

Until resolved, Tasks 2–8 are **not** dispatched.

## Notes / smaller items

- `parseHtmlList` (Task 3) and the Anthropic targets (Task 6) survive under
  option 1 unchanged — the parsing work is reusable regardless of fetch transport.
- Environment friction observed this session: the context-mode hook blocks
  inline HTTP from Bash, and GateGuard fact-forces edits. Subagents dispatched
  into this environment for network/machine steps will hit these — run
  install/probe steps in the controller (as Task 1 was), not in subagents.
