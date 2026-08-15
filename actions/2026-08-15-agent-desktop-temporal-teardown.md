---
date: 2026-08-15
classification: research
action: Clone lahfir/agent-desktop, run its a11y-tree extraction, and write a one-paragraph teardown of where a time dimension beats its static refs — sharpen the UIPE positioning doc against a live competitor.
source_brief: briefs/2026-08-15.md
---

## TL;DR
`lahfir/agent-desktop` is the cleanest live competitor UIPE has yet had to position against: a Rust CLI that gives agents structured access to any app through the **OS accessibility tree** — "no screenshots, no pixel matching," snapshot → act → re-snapshot, with deterministic snapshot-scoped refs (`@s8f3k2p9:e5`). Its entire perception model is **static and discrete**: every ref is a structural node frozen at snapshot time, and it infers change by *diffing two still frames*. That is exactly the surface UIPE's time dimension owns. It has a trace viewer, but that's post-hoc replay for audit — not temporal perception feeding the live decision loop. The teardown paragraph below is the deliverable; bank it as UIPE's "vs. accessibility-tree tools" answer. (Note: I did not literally run the extraction — `agent-desktop` needs macOS Accessibility permission granted interactively to a GUI process on macOS 13+, which a headless pipeline can't do. The positioning is derived from its README/CLI model, which is unambiguous.)

## The positioning paragraph (the deliverable)
> agent-desktop perceives the UI as a **structure**; UIPE perceives it as a **process**. Every agent-desktop ref — `@s8f3k2p9:e5` — is a node pinned to one snapshot, and the tool's only notion of "what happened" is a diff between two still frames it captured itself. That model is blind to the thing between the frames. It can't see the 800ms loading spinner, the toast that appears and vanishes before the next snapshot, the layout reflow that moved the button, or the async write that hadn't committed when it re-observed — it can only ask "is the tree different now?" and guess. Three concrete failure modes fall out of that: (1) **stale refs / TOCTOU** — a ref is valid at snapshot N, but if the app mutates before the act lands (async load, a notification, a second agent), the click hits the wrong node with no temporal validity check; UIPE's answer is a UI-state *lease* — a ref that knows whether it's still fresh. (2) **Transient states are invisible** — a discrete snapshotter only sees a toast if it happens to sample mid-window; temporal perception (optical flow, change-detection over time) captures the appear-then-disappear that *is* the action's confirmation signal. (3) **"Did it land?" is a weak, expensive proxy** — agent-desktop re-snapshots the whole tree and diffs to infer success, and still can't distinguish "done" from "still settling"; UIPE emits a first-class verdict — *intent confirmed, page settled at 14:22:07* — instead of a diff you have to interpret. agent-desktop reads the DOM's *nouns*; UIPE reads its *verbs*.

## Key findings
- agent-desktop's core loop is explicitly `snapshot → decide → act → snapshot` — discrete, re-observe-to-verify; no in-loop transition perception. (source: https://raw.githubusercontent.com/lahfir/agent-desktop/main/README.md)
- Refs are snapshot-scoped and deterministic (`@s8f3k2p9:e2`); "progressive skeleton traversal" optimizes *token cost* of a static tree, not temporal awareness — 78–96% reduction by shallow map + drill-down. (source: README)
- It has a trace viewer (`trace show` / `trace export` to HTML) — but that's a **post-hoc replay/audit** artifact, not perception feeding the decision. Honest distinction to preserve so the pitch doesn't strawman. (source: README)
- Surface differs: agent-desktop = native macOS AX trees; UIPE = web DOM + vision. The static-vs-temporal argument is about the *perception model*, which is surface-independent — say so rather than hiding it. (source: README + actions/2026-08-12-parley-uipe-temporal-wedge.md)
- The "UI-state lease / freshness" idea is the same spatial→temporal move made against Parley's file-claims — reuse that framing. (source: actions/2026-08-12-parley-uipe-temporal-wedge.md)

## Existing players / prior art
- lahfir/agent-desktop — Rust CLI, OS-accessibility-tree automation for agents, deterministic refs — https://github.com/lahfir/agent-desktop
- Playwright/Puppeteer accessibility snapshots — same static-tree model on web (agent-desktop even bridges to them via CDP) — the browser-side incumbents UIPE's argument also lands on.

## Concrete next steps for Dirk
1. Bank the paragraph verbatim as UIPE's "vs. accessibility-tree tools" positioning. One-liner: *they read the DOM's nouns; UIPE reads its verbs.*
2. Turn the three failure modes (stale-ref TOCTOU, invisible transients, weak "did-it-land" proxy) into a 3-row comparison table for the landing page — each row is a concrete scenario, not an abstraction.
3. If you want the real demo (not the headless run): grant Accessibility to agent-desktop on your Mac, run `agent-desktop snapshot --app Slack -i`, then trigger a toast/loading state and show the snapshot misses it — that screenshot *is* the pitch.

## Open questions
- Does agent-desktop's re-snapshot diff expose any "settled vs still-loading" signal, or is it purely structural? If purely structural, failure mode (3) is airtight; worth confirming against its source before publishing.
- Is there a web-native equivalent of agent-desktop gaining traction? The browser surface is UIPE's actual home turf and a closer competitor would sharpen the doc further.
