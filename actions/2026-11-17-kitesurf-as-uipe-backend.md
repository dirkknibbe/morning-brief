---
date: 2026-11-17
classification: research
action: Read the Kitesurf repo; decide whether UIPE can use it as a backend instead of Chromium, and note the answer in the UIPE roadmap
source_brief: briefs/2026-11-17.md
---

## TL;DR
No — not as a Chromium replacement, and not today. Kitesurf speaks CDP, but its dispatcher answers the `Animation` and `Tracing` domains with an empty success and never emits their events, which are exactly the two domains UIPE's temporal pipeline is built on. UIPE would not crash; it would silently report "no animations, no frame timing." Screencast, `Network` and `Runtime.callFunctionOn` are implemented, so a *degraded* tier (visual + network only) is plausible later. Roadmap answer: "optional second backend, blocked on Animation/Tracing; revisit when Kitesurf ships them." Do not build the adapter now.

## Key findings
- Kitesurf is Apache-2.0, Rust→WASM, runs on Workers with no browser container; it parses HTML, applies CSS, runs page JS and renders screenshots. JS falls back to the Boa interpreter when Dynamic Workers can't run it. (source: https://blog.cloudflare.com/kitesurf-open-source/)
- README, verbatim: "Kitesurf provides a CDP endpoint, not a full Chrome implementation. Some Chrome DevTools features do not work yet." Repo self-describes as "experimental". (source: https://github.com/cloudflare/kitesurf)
- `packages/engine/src/cdp/dispatch.ts` routes Target, Page, Runtime, DOM, Network, Storage, Log, Fetch, Input, Debugger, CSS, Accessibility, Emulation. A block commented "These domains remain unsupported; clients probe them during attach" returns `result = {}` for ~35 domains including **Animation, Tracing, Performance, DOMSnapshot, LayerTree**. (source: https://github.com/cloudflare/kitesurf/blob/main/packages/engine/src/cdp/dispatch.ts)
- UIPE's CDP surface (grep of `packages/core/src`): `Page.start/stopScreencast` + `screencastFrame(Ack)`, `Network.enable/requestWillBeSent/responseReceived`, `Runtime.callFunctionOn`, `Animation.enable/animationStarted/animationCanceled/resolveAnimation`, `Tracing.start/end/dataCollected/tracingComplete`.
- Match-up: screencast ✅ (in `cdp/page.ts`, with e2e tests), Network ✅, Runtime ✅, Animation ❌, Tracing ❌. Affected UIPE files: `pipelines/temporal/collectors/animation.ts`, `pipelines/temporal/verifiers/animation/verifier.ts`, `dataset/capture/frame-timing.ts`.
- Client coupling: UIPE launches via Playwright `chromium.launch` (`packages/core/src/browser/runtime.ts:45`). Kitesurf's README documents Puppeteer only — zero mentions of Playwright. `connectOverCDP` is untested.
- Self-hosting needs a Workers Paid plan (Dynamic Workers). Each navigation starts a new page isolate; Cloudflare calls it a "stateless browser." Local runs OOM'd around 300 pages without `--expose-gc`.
- Maturity: open issues include same-origin iframe `evaluate` never returning (#134) and localStorage not surviving navigation (#133). (source: https://github.com/cloudflare/kitesurf/issues)

## Existing players / prior art
- Kitesurf — Cloudflare's Workers-native browser engine, CDP endpoint — https://github.com/cloudflare/kitesurf
- Browser Run — Cloudflare's managed offering on top of Kitesurf — https://blog.cloudflare.com/kitesurf/
- Chromium via Playwright — UIPE's current backend; the only one with Animation + Tracing

## Concrete next steps for Dirk
1. Add to `docs/autopilot-program-roadmap.md` in the UIPE repo: "Kitesurf backend: NO for now. Missing CDP Animation + Tracing (stubbed to `{}`), Playwright attach unverified. Revisit on Kitesurf changelog mention of either domain." (2 min)
2. Independent of Kitesurf: make the animation collector and frame-timing recorder fail loudly when a backend acks `enable`/`start` but never emits events. The empty-success stub is a silent-failure trap for any non-Chromium CDP target. (about 1 hour, with a test)
3. If curiosity wins: a 30-minute spike — `pnpm run dev` in Kitesurf, then `chromium.connectOverCDP('http://127.0.0.1:8787')` from a scratch script. Pass/fail on attach alone settles the Playwright question.
4. Drop the "cheapest hosted perception tier" spark until step 3 passes; without temporal signals it is a screenshot service, which Browser Run already sells.

## Open questions
- Does Playwright's `connectOverCDP` attach at all? (Needs Target auto-attach and `Browser.getVersion`; `Browser` is in the stubbed list.)
- Is Kitesurf's screencast a real compositor frame stream, or re-rendered snapshots? This decides whether UIPE's visual diffing keeps its timing fidelity.
- Will Cloudflare implement `Animation`? `packages/core/src/style/animation.rs` exists, so the engine has an animation clock — only the CDP surface is missing.
- Rendering fidelity vs Chromium on real SPAs: no Web Platform Tests pass rate was read for this dossier.

## Pipeline note
`src/parse-action.ts` returned the *Opportunity Sparks* bullets instead of the `*Action today:*` line (it matched "Agent **action** receipts API:"). This dossier uses the real action line from `briefs/2026-11-17.md:35`.
