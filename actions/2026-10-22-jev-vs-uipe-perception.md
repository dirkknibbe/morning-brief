---
date: 2026-10-22
classification: research
action: Compare Jev's "page → element table + confidence" loop against UIPE's output; if UIPE already produces the richer signal, write the differentiation sentence.
source_brief: briefs/2026-10-22.md
---

## TL;DR
Yes — UIPE already produces a strictly richer signal than Jev, so the differentiation sentence writes itself (below). But the comparison also delivers a warning: Jev's loop deliberately *throws away* perception to win on speed and cost (31s / $0.45 vs 70s / $1.41 for the same Google Flights search), and its real product is the **rail**, not the signal — a hosted metered decision endpoint (`api.typesafe.ai`) plus typed hand-backs and safety gates. UIPE has the perception and none of the rail. The brief's premise ("expose UIPE over a metered per-call rail") is validated by Jev's existence, but Jev shows the hard 80% is the rail, not the scene graph.

## Key findings
- **Jev's loop is text-only and remote-metered.** `snapshot.js` extracts visible text, controls, and fields (no vision, no iframes, no shadow DOM, no canvas) → one metered request to TypeSafe → next op/target/value → act via CDP. (source: github.com/danielnc/jev-browse README)
- **Jev's "confidence" is a binary gate, not a vector.** There is no per-element confidence. When the page is visual/framed/ambiguous it emits a *typed hand-back* — `low_confidence`, `visual_only`, `in_frame`, `too_many_options`, `state_too_large`, `confirm_required` — and returns control to the agent. (source: README)
- **Metering is per-decision, "a few tenths of a cent per task."** Exactly the MCPAASTA shape. The rail is TypeSafe's hosted API; Jev the OSS package is just the client + safety gates + benchmark. (source: README)
- **UIPE emits the signal Jev refuses.** `get_affordances` returns interactive elements ranked `priority: high|medium|low`, and every scene node carries dual `visualConfidence` + `structuralConfidence`. UIPE's three tiers (OmniParser → Qwen3-VL → Claude Vision) perceive exactly the visual/affordance cases Jev punts on. (source: /Users/dirkknibbe/uipe/ui-perception-engine — affordance.ts, scene-graph.ts, README)
- **Parser bug (flagging for Dirk):** `parse-action.ts` returned the *Confidence-gated action API* Opportunity Spark, not the `✅ Action today` block. The `MARKER` regex matches the first bold span containing "action:" — the spark bullet `**Confidence-gated action API**:` wins before `*Action today*:`. I researched the real Action-today block.

## Existing players / prior art
- **jev-browse (danielnc)** — text-only browser sub-tasks for coding agents at ~1/3 the cost; metered via TypeSafe — github.com/danielnc/jev-browse
- **TypeSafe (api.typesafe.ai)** — the hosted "next operation?" decision endpoint Jev calls; the actual metered rail
- **jev-pokemon (christianmat)** — unrelated namesake; the brief conflated the two

## The differentiation sentence
> Jev decides on a flat text snapshot and hands back the moment a page turns visual, framed, or ambiguous (`low_confidence`, `visual_only`); UIPE perceives those exact cases — emitting a fused structural+visual scene graph with per-element `visualConfidence`/`structuralConfidence` and priority ranking — so an agent can act where Jev goes blind.

## Concrete next steps for Dirk
1. Don't rebuild Jev's perception — it's intentionally thin. Instead target the pages Jev hand-backs on: ship UIPE as the **`visual_only` / `in_frame` fallback** an agent calls when a cheap text-first pass (Jev-style) blocks.
2. Steal the rail, not the loop: Jev's win is typed hand-backs + per-call metering + "verify in the same script." UIPE needs that envelope far more than another vision tier.
3. One-afternoon spike: wrap `get_affordances` to emit Jev-compatible typed statuses (`DONE`/`BLOCKED`/`low_confidence`) so UIPE is drop-in behind a Jev-first agent.

## Open questions
- Does TypeSafe sell perception, or only the decision? If the latter, UIPE could be a perception *supplier* to rails like Jev rather than a competitor.
- UIPE's three-tier latency (~0.8s + 2–4s + 3–5s) vs Jev's whole-task 8–31s budget — is the richer signal affordable per-call, or only as an on-miss fallback?
