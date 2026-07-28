---
date: 2026-07-28
classification: research
action: Read pilotprotocol.network's publisher/payment docs and scope what listing UIPE as a tool would take — a real-world MCPAASTA distribution test with zero infra to build.
source_brief: briefs/2026-07-28.md
---

## TL;DR
Pilot's distribution surface is its **App Store** — not the MCP bridge. An "app" is a local binary + signed `manifest.json` that the daemon spawns and brokers over typed IPC (JSON in/out), backed by whatever infra you already run. UIPE's backend qualifies as "zero infra to build," but the claim is only half true: there is **no "publish your MCP server" path** — you must build and host a thin **adapter binary** that speaks the app-store IPC contract, sign it, cut a GitHub release, and open a PR to the (reviewed) catalogue. Payment is entirely **app-side**: Pilot gives you cost tables, spend caps, and 402/needs-signup hint plumbing, but no publisher payout rail — UIPE's own backend must handle signup/token/balance. Verdict: a legitimately cheap distribution experiment (~219k agents, one-line install), but budget ~a day for the Go adapter + catalogue PR + Publisher Agreement, not an afternoon.

## Key findings
- App = pinned binary + ed25519-signed manifest; daemon supervises it, hands it a unix socket, brokers typed method calls. Grant-scoped (`net.dial`, `fs.read`), no ambient authority. (source: https://pilotprotocol.network/docs/app-store)
- Publishing is 3 steps: `gen-key` → `sign` manifest + tar bundle → `gh release create`, then add one `catalogue.json` entry (pinning tarball sha256) via **PR that gets merged/reviewed**. Catalogue is itself signed. (source: https://pilotprotocol.network/docs/app-store)
- Net-using apps **must** go through the catalogue; sideload (`--local`) is clamped to no `net.dial`. So UIPE (which calls a backend) can't ship as a pure sideload — catalogue review is mandatory. (source: https://pilotprotocol.network/docs/app-store)
- Payment/metering is the app's job: Pilot surfaces per-call `cost` tables, `caps`, and next-steps edges for `402 budget` / `needs_signup` / `429 quota`. No built-in money rail to publishers in the docs — despite the landing page's "pay other agents directly." (source: https://pilotprotocol.network/docs/app-store)
- The `pilotprotocol-mcp` server is a **consumer** bridge (21 tools to query Pilot's 430 specialists from Claude Code/Cursor) — it is *not* a publish path for your own MCP server. (source: https://pilotprotocol.network/docs/mcp-setup)
- Adapter must be a binary accepting daemon lifecycle flags (`--socket --manifest --addr --db --identity --cap-state`); cleanest in Go via `app-store/pkg/ipc` (`ipc.NewDispatcher` / `Register` / `Serve`). (source: https://pilotprotocol.network/docs/app-store)
- There's a **Publisher Agreement** (legal footer) you'd be accepting. (source: https://pilotprotocol.network/plans)

## Existing players / prior art
- io.pilot.cosift — grounded web search/answer/research app; the doc's worked example and reference adapter shape. — https://pilotprotocol.network/docs/app-store
- Orthogonal — "851 paid APIs with one key, described in plain English" — closest analog to wrapping an external capability. — https://pilotprotocol.network
- pilotprotocol-mcp — the MCP-side bridge, useful to *test UIPE as a consumer* before committing to a listing. — https://pilotprotocol.network/docs/mcp-setup

## Concrete next steps for Dirk
1. Decide the surface honestly: this is an **App Store adapter**, not "list my MCP server." If you won't write a Go IPC adapter, this isn't zero-infra — stop here.
2. If yes: build a ~1-file Go adapter (`uipe.perceive`, `uipe.help`) that forwards JSON to your existing UIPE backend; `gen-key`, `sign`, sideload with `--local` first to validate the IPC handshake (no net) against a mocked call.
3. Author the `product_demo` + `next_steps` graph (metadata, no rebuild) — a `needs_signup`/`402` gateway edge if UIPE meters.
4. Read the **Publisher Agreement** before opening the catalogue PR; that's the real gate, not the code.

## Open questions
- How does a publisher actually *get paid*? Docs describe cost surfacing + caps but no payout rail — is metering purely BYO-backend billing?
- Catalogue-PR review SLA and acceptance criteria — how selective/curated is it, and who runs the repo?
- Does the daemon support non-Go runtimes for the adapter binary in practice (manifest lists `"runtime": "go"`)?
