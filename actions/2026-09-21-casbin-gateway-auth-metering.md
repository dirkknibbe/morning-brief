---
date: 2026-09-21
classification: research
action: Read casbin-gateway's README + door.caswaf.com demo — note exactly how it authenticates and whether it meters per-call
source_brief: briefs/2026-09-21.md
---

## TL;DR
`apache/casbin-gateway` (aka "Casbin Gateway" / ccswitch) is a **local, single-tenant desktop relay** — a menu-bar app binding `127.0.0.1:17000` that sits between your agents (Claude Code, Codex) and model vendors. It nails two-thirds of your gateway thesis: **credential custody** (it holds the vendor key so agents never see it) and **per-call policy enforcement** (an agent×tool×model×provider matrix compiled to a Casbin policy, enforced on every relayed request). But it does **not** meter-and-bill per call: "metering" here is *cost attribution* — tokens read from agent transcripts × a models.dev price table, shown on a Usage dashboard. No charging, no cross-tenant quota, no Stripe. **That gap is your wedge.** It's the closest OSS prior art, and it stops exactly where a metered *business* would begin.

## Key findings
- **Downstream auth (agent → gateway):** a single machine-local relay token `cg-...`, set as `ANTHROPIC_AUTH_TOKEN`, generated on first start. One token per install — **not** per-tenant API keys. (source: README)
- **Upstream auth (gateway → vendor):** Gateway custodies the provider API key (encrypted at rest via `apiKeyEncryptionKey`). Alternative "caller's own login" mode forwards the agent's *own* subscription sign-in, so a Claude Pro/Max agent needs no pasted key. (source: README)
- **Admin sign-in:** built-in user table + password by default; optional Casdoor SSO / OAuth when `casdoorEndpoint` is set. (source: README)
- **Per-call enforcement = YES, but allow/deny not billing:** ~40 switches per agent (tools, models, providers) "compiled to a Casbin policy and enforced on every request it relays." (source: README)
- **Metering = observability, not billing:** Usage page shows requests/tokens/cache-hit/cost by model and agent, computed from the Model pricing table (models.dev list prices, hand-editable). Read from transcripts after the fact — no per-call charge or quota gate. (source: README)
- Go project, Apache org, active CI (golangci-lint + build), install via `curl … install.sh | bash`. (source: README)

## Existing players / prior art
- **casbin-gateway** — local desktop key-custody + Casbin per-call policy + cost dashboard; single-tenant, no billing — https://github.com/apache/casbin-gateway
- **door.caswaf.com** — the hosted demo; JS-rendered SPA titled "Casbin Gateway" (couldn't scrape auth flow headless — needs a real browser to inspect).
- Adjacent (not read this session): LiteLLM proxy (does virtual keys + budgets + per-key spend limits — the metering casbin-gateway lacks), Portkey, Cloudflare AI Gateway.

## Concrete next steps for Dirk
1. **Skim casbin-gateway's Go source for the enforce path** — find where the Casbin `Enforce()` call wraps the relay handler. That's the exact seam where a per-call *meter/charge* hook would live. 20 min.
2. **Position against LiteLLM, not casbin-gateway** — LiteLLM already has virtual keys + budget caps + spend limits (real metered enforcement). Your differentiation has to beat *that*, not the local desktop tool.
3. **Reframe the thesis in one line:** casbin-gateway proves custody+policy+attribution ship together locally; the open gap is **multi-tenant, per-call metered billing with quota enforcement**. Decide if that's a product or a LiteLLM PR.

## Open questions
- Does the hosted door.caswaf.com demo add multi-tenant auth the local build lacks? (SPA blocked headless scrape — open it in a browser.)
- Is the "caller's own login" passthrough ToS-safe for reselling subscription capacity, or does it just relay one user's own sub?
