---
date: 2026-07-30
classification: research
action: Clone hongnoul/hwatu, run its 35ms verify loop, write a teardown of what it perceives / can't, and where UIPE's MCP wins — as competitive intel + landing copy.
source_brief: briefs/2026-07-30.md
---

## TL;DR
Two of the action's premises are false and would make dangerous landing copy. hwatu **cannot run on your Mac** (Linux-only, WebKitGTK 6 — the "run its 35ms loop" step is infeasible here), and its README/agent docs show it has **deep temporal-state handling** (`clock`, `seek`, `motion --observe` with virtual-time wrap-hunting) — that's arguably its *strongest* differentiator, not a gap. It also renders "general web UIs" fine; it's a full WebKit browser. Do **not** ship "hwatu can't do general web UIs or temporal state" — a competitor rebuts it in one screenshot. The real, defensible wedge is **measurement vs semantics**: hwatu tells you *whether pixels/DOM changed*; UIPE tells you *what the UI is, what it affords, and whether it's good UX*. They're complementary, not rivals.

## Key findings
- hwatu is a Rust "verification browser" warm daemon: 35ms one-call verify pass (`check`), pixel-diff score+regions+heatmap, DOM `snapshot`, `expect`, `console`/network capture, CAPTCHA detect, live human hand-off (`focus`). (source: github.com/hongnoul/hwatu README)
- hwatu's temporal story is *rich*: `clock` puts every page time source behind one virtual timeline (pause/step/seed), `seek` pins CSS/WAAPI, `motion --observe` fits velocity/period/easing models. Claiming it "can't do temporal state" is flatly wrong. (source: hwatu/docs/agents.md)
- hwatu is **Linux + WebKitGTK 6 only**, needs a Wayland/X session even headless; no macOS build. Local clone-and-run is not possible on your machine. (source: hwatu README, docs/agents.md "Note on displays")
- hwatu returns **measurements** (pixels, DOM refs, numbers). It has no semantic model — no affordance ranking, no UX/hierarchy/contrast judgment, no "what is this component." (source: agents.md "What the agent gets" table)
- UIPE returns **understanding**: fused DOM+a11y+CSS + three-tier vision (OmniParser V2 → Qwen3-VL → Claude Vision) into a UI Scene Graph, `get_affordances`, `analyze_visual`, `compare_states`. Chromium via Playwright, cross-platform incl. macOS. (source: /Users/dirkknibbe/uipe/ui-perception-engine/README.md)

## Existing players / prior art
- hwatu — fast WebKit verify daemon for coding agents' inner loop — github.com/hongnoul/hwatu
- Playwright — cross-browser E2E; hwatu benchmarks against it (82ms warm) — playwright.dev
- chrome-devtools-mcp — CDP introspection for agents (no pixel diff/temporal)
- Percy/Chromatic/Applitools — cloud visual-regression gates (baseline-shaped, priced per shot)

## Concrete next steps for Dirk
1. **Kill the false framing.** Don't position UIPE on "hwatu can't render UIs / do time." Position on the axis hwatu *doesn't* touch: semantic perception. Landing headline candidate: *"hwatu checks if your pixels changed. UIPE understands what the UI means."*
2. **Concede speed openly.** hwatu is 35ms; UIPE's vision pipeline is seconds. Don't compete on the inner-loop verify axis — you lose. Own "perception/understanding layer," not "fast verifier."
3. **Frame as complementary, not competitive** — hwatu for the tight edit→verify loop, UIPE for affordance/UX reasoning and cross-Chromium semantic capture. A "use both" story is more credible and less attackable.
4. If you still want the head-to-head number, spin up a cheap **Linux box/CI runner** to actually run `hwatu check` — you can't on darwin.

## Open questions
- Is UIPE's true buyer the agent inner-loop (where hwatu wins on speed) or a slower "audit/understand this UI" job? That determines whether hwatu is even a competitor.
- Does UIPE's affordance/UX output survive a skeptical demo vs hwatu's `snapshot` + `expect`, or is the semantic layer still too noisy to be the headline claim?
