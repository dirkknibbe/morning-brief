---
date: 2026-05-20
classification: build-plan
action: combine UIPE perception with Enforra-style allow/deny policies. Sell to teams already burned by `rm -rf /`.
source_brief: briefs/2026-05-20.md
---

## TL;DR
The right move is **not** a new product. Enforra already shipped the SDK shape you'd build (Apache-2.0, YAML policy, ALLOW/BLOCK/APPROVAL/LOG, audit log, decision trace). It just lacks UI-affordance fields — its policies only know `tool` + `args`. UIPE's perception already produces what's missing: visible label, ARIA role, frame URL, "what changed since last scene." Ship a ~200-line **UIPE→Enforra policy adapter** (or upstream PR) that lets policies match on `args.visible_label`, `args.affordance.role`, `args.scene.url`. That keeps you off the OSS-clone treadmill and inside Enforra's distribution. Also: the `rm -rf /` buyer is a *shell* victim, not a browser-agent victim — the original framing targets the wrong wound. Reposition to "browser-agent action governance for vision-model clicks that slip past tool-name policies." Otherwise this becomes a worse Enforra.

## Key findings
- Enforra ships exactly the policy primitives you'd duplicate: 4 decisions, YAML, priority ordering, default-deny, CI sim, audit log, observe→enforce ramp. Building a parallel engine is pure waste. (source: https://enforra.com)
- Enforra explicitly says "Enforra Core is not an MCP gateway or proxy" — the *gateway* and *UI affordance* layers are unclaimed surface area. (source: https://enforra.com features section)
- Snyk just acquired **Invariant Labs** (Guardrails + MCP Scan + Explorer). Enterprise agent-security is now a Snyk distribution problem; indie path is dev-tools / OSS, not enterprise sales. (source: https://www.invariantlabs.ai)
- Tool-name policies miss the vision-model click attack: an agent that screenshots → clicks (x,y) never invokes `terminal.run`, so Enforra's policy can't see it. Affordance-level policy (UIPE knows the click landed on "Delete Account") is the gap. (source: UIPE README + Enforra policy model)
- UIPE already emits the data needed (`scene`, `compare_states`, accessibility tree, console/network events). The adapter is mostly a field-mapper from UIPE's scene → Enforra's `args.context`. (source: ~/uipe/ui-perception-engine/README.md, prior dossier 2026-04-26)
- The brief's "`rm -rf /`" thread is a shell-agent incident on r/LocalLLaMA — wrong target persona for a browser-perception product. Same revulsion, different attack surface. Position accordingly or rebuild the audience.

## Existing players / prior art
- **Enforra** — tool-name+args policy SDK, Apache-2.0, just launched. (https://enforra.com)
- **Invariant Labs (Snyk)** — Guardrails / MCP Scan / Explorer; enterprise lane is closed. (https://www.invariantlabs.ai)
- **Lakera, PromptArmor** — prompt-injection and TPRM/governance layers, not runtime action-policy.
- **Browser Use** — self-healing harness, no policy layer; natural integration target.
- **Forge** (from this brief's signals) — tool-call retry/recovery, complementary not competitive.

## Concrete next steps for Dirk
1. **30-min spike: file an Enforra issue** titled "UI-affordance policy fields for browser agents" proposing `args.visible_label`, `args.affordance.role`, `args.scene.url`, `args.scene.diff` as standard optional context fields. Use it to gauge maintainer receptivity *before* writing code.
2. **If receptive → ship `@uipe/enforra-adapter`**: a TS module that wraps a UIPE `act()` call, captures the scene/diff, and calls `enforra.enforceToolCall` with the affordance context. Target: 200 LOC + 3 example policies (block-on-delete-label, approve-on-payment-form, log-on-scene-change). Ship in `~/uipe/integrations/enforra/`.
3. **If hostile → don't build a fork.** Instead write a 600-word post: *"Tool-name policies are blind to vision clicks"* with one Enforra policy that almost works and one UIPE-augmented policy that does. Distribution beats code here.
4. **Reframe the buyer.** Drop the `rm -rf /` framing — that audience wants shell sandbox, not browser perception. Target: teams running browser agents in CI/customer-facing flows (Browser Use, Stagehand, Computer Use) who can't currently policy-check a screenshot click.

## Open questions
- Is the Enforra team funded / hiring? If venture-backed, an adapter PR is leverage; if bootstrapped, they may resent a UIPE-branded plugin and prefer an upstream contribution.
- Does the affordance-policy idea need UIPE at all, or can it be a thin Playwright accessibility-tree shim? If the latter, UIPE adds no defensible moat — answer this before writing the adapter.
