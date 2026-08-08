---
date: 2026-08-08
classification: research
action: Write one paragraph on where UIPE's temporal-perception layer plugs into (not against) Cloudflare's Kitesurf / Browser Run agent-browser stack.
source_brief: briefs/2026-08-08-FAILED.md
---

## TL;DR
Kitesurf is an agent-first browser optimized for exactly one thing: cheap, stateless **snapshot extraction** (screenshots + HTML), where "every session starts fresh." That architectural choice *is* the opening. Cloudflare's only temporal feature — Session recording — is rrweb-based, finalized only *after* the session closes, and viewable only by a human scrubbing a dashboard timeline. There is no live, agent-queryable "what changed since my last action" API. UIPE plugs in as an **MCP sidecar over the CDP/WebMCP endpoint**: it consumes the frames Kitesurf already produces and emits a semantic diff-over-time signal an agent can read mid-task. Positioning line below.

## The positioning paragraph (the deliverable)
> Kitesurf gives an agent a cheap, stateless *photograph* of a page; UIPE gives it *motion*. Cloudflare deliberately optimized for single-shot extraction — screenshots and HTML, fresh session per load — and their only cross-time artifact (Session recording, rrweb) is a post-hoc human replay, not something an agent can query while it works. UIPE's temporal-perception layer sits *beside* Browser Run, not in front of it: it subscribes to the same CDP stream (or registers as a WebMCP tool), keeps the short-horizon state Kitesurf throws away, and answers the one question the snapshot can't — "what changed, and did my last action do what I intended?" That's spinner-vs-error, optimistic-render-vs-confirmed-write, modal-appeared, toast-fired — the difference between an agent that acts and one that *verifies*. Cloudflare made the browser cheap enough to give every agent one; that makes the perception layer on top the scarce part.

## Key findings
- Kitesurf is built for "common agentic tasks like screenshots and HTML extraction" and treats "every page load as untrusted input and every session starts fresh" — explicitly stateless. (source: https://blog.cloudflare.com/kitesurf/)
- Browser Run's Quick Actions are all single-shot captures: `/content`, `/screenshot`, `/snapshot`, `/accessibilityTree`, `/scrape`, `/json`, `/links`. None express change-over-time. (source: https://developers.cloudflare.com/browser-rendering/)
- Session recording is rrweb-based, "not available until after the session ends," and consumed by a human via dashboard timeline scrubbing — not an agent-facing live diff. (source: https://developers.cloudflare.com/browser-run/features/session-recording/)
- WebMCP (Beta) + a CDP endpoint mean Cloudflare already exposes the browser to agents via MCP — so a UIPE MCP sidecar matches their own extension pattern rather than fighting it. (source: https://developers.cloudflare.com/browser-rendering/)
- Prompt injection is called out by Cloudflare as a *named* top-priority threat model — a temporal layer that flags "the page changed unexpectedly after my action" is also a security signal, not just a UX one. (source: https://blog.cloudflare.com/kitesurf/)

## Existing players / prior art
- Cloudflare Browser Run / Kitesurf — stateless agent browser + rrweb post-hoc recording — https://developers.cloudflare.com/browser-run/
- rrweb — open-source DOM record/replay; captures the timeline but targets human replay, no semantic diff API — https://www.rrweb.io/
- browser-use / Steel / Browserbase — agent-browser infra racing to the same snapshot-extraction finish line; none sell temporal perception (per brief signals; not re-verified this run).

## Concrete next steps for Dirk
1. Bank the positioning paragraph above verbatim as UIPE's "vs. the agent-browser stack" answer — it's the wedge the brief asked for.
2. Spike the thinnest possible proof: a WebMCP/CDP consumer that pulls two consecutive Kitesurf frames and returns a semantic diff (`state_changed`, `intent_confirmed?`). No new browser, no competing with Cloudflare.
3. Frame the pitch as *infra-adjacent*: Cloudflare monetizes metered Browser Run compute underneath; UIPE monetizes the perception verdict on top. Complementary meters, not competing products.

## Open questions
- Does WebMCP/CDP expose a low-enough-latency frame stream to compute diffs *mid-task*, or only at action boundaries? (Needs a hands-on spike — docs don't say.)
- Is rrweb's event stream retrievable *live* (mid-session) via any Browser Run path, or strictly post-close? If live, UIPE could ride rrweb events instead of re-capturing frames.
