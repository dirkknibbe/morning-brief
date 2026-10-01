---
date: 2026-10-01
classification: research
action: Read jev-judge-mcp and Kyno READMEs (both MCP-native, both adjacent to UIPE); draft a UIPE positioning line off the Schneier post.
source_brief: briefs/2026-10-01.md
---

## TL;DR
Both jev-judge-mcp and Kyno are MCP-native **governance** layers — they answer *should the agent act* and *in what direction*. Neither answers *can the agent act right now* against a live web UI, which is exactly what stopped the Schneier agent (captchas, consent walls — not auth). That gap is UIPE's lane: perception, not policy. Positioning line is drafted below; it deliberately frames UIPE as sitting *beneath* both tools, so they become complements, not competitors. No build implied — this was a read-and-draft task, done.

## Key findings
- **jev-judge-mcp** = eleven typed judgment tools (`verify/screen/find/gate/score/decide/...`) backed by TypeSafe's "Jev" model; the model judges, *policy* decides `auto`/`review`/`escalate`. ~464ms median, ~$0.025 per 1k decisions. MCP over stdio. It governs **decisions with a fixed answer set** — not open-ended action. (source: https://github.com/PyModel/jev-judge-mcp)
- **Kyno** = "coherence control plane": a versioned *constitution* (mission + ordered principles) that agents **pull via MCP at each step boundary**. Explicitly **no LLM** in the loop; `pip install kyno`, open-core. It governs **direction**, not capability. (source: https://cizambra.github.io/kyno/)
- Both converge on the same shape: a per-step MCP pull as the governance hook. That is a natural **metering point** (brief lines 19–20, 28–29), but it is a *policy* decision point, blind to UI state.
- The Schneier agent's blocker was **UI perception** — "can I traverse this page?" — which neither jev-judge (is this claim/page safe?) nor Kyno (am I on-mission?) perceives. UIPE answers a question they both assume is already solved. (source: briefs/2026-10-01.md lines 3, 11)

## Existing players / prior art
- **jev-judge-mcp** (PyModel) — typed judgment / gate-as-MCP — https://github.com/PyModel/jev-judge-mcp
- **Kyno** (cizambra) — versioned direction / per-step MCP pull — https://cizambra.github.io/kyno/
- **P4A-Policies-for-Agents** (org) — a whole suite of Jev-backed gateway policies (intent-alignment, exfil-guard, risk-tiered HITL). The "guardrail-as-MCP" category is already crowding in — all of it policy-layer, none UI-perception. — https://github.com/P4A-Policies-for-Agents

## Drafted UIPE positioning line (off the Schneier post)
> *The perimeter is the UI, and your agent is blind to it.* Governance tools like jev-judge and Kyno already tell an agent **whether** it should act and **in what direction** — but they assume the agent can even see the page it's standing on. The Schneier experiment proved the opposite: in 20 hours, identity verification blocked the agent **zero times**; captchas and consent walls stopped it cold. Auth is solved; **perception isn't**. UIPE is the missing sense beneath the policy layer — it tells the agent *can I act yet, and if not, what's in the way* — so that every gate and every constitution has a UI it can actually read.

## Concrete next steps for Dirk
1. Keep the positioning line above as the UIPE one-liner — "perception beneath policy" is the differentiator vs. the crowded guardrail-as-MCP field.
2. Frame UIPE as **complementary** to jev-judge/Kyno in any pitch: UIPE perceives → their policy decides. Don't compete on the gate.
3. If chasing the metering angle (brief line 27–28), the sharpest wedge is the *captcha/consent-wall perception MCP* — it's the one thing the Schneier agent would have paid for, and nobody in the P4A/Jev cluster is building it.

## Open questions
- Is there an existing UI-perception MCP already shipping (vs. the pure policy layer)? Didn't find one in this pass — worth a dedicated search before claiming the lane is empty.
- Does TypeSafe's Jev expose a vision/screenshot path that could absorb "is this UI blocked?" into their judge, collapsing the UIPE wedge?
