---
date: 2026-09-25
classification: build-plan
action: Read the Gambit writeup, then sketch what a "prove agent is authorized + record what it did" MCP server would expose (sits on top of UIPE).
source_brief: briefs/2026-09-25.md
---

## TL;DR
Read the Gambit report end-to-end — it's real and well-sourced (staging server recovered, 600K cards, $25/target). But it argues *against* the obvious framing: the attackers ran Hermes/Strix/Cairn and **will never call your MCP server**. A cooperative MCP can't police adversarial agents. So don't build "stop the Gambit attackers." Build the defensive mirror: let an *authorized* agent prove to a relying party that it acted within scope — a compliance/trust primitive for first-party agents (DORA, EU AI Act Art. 14, agentic-commerce). The one genuinely novel wedge vs. the incumbents (Aembit, Delinea, SecureAuth) is binding the "what it did" record to **UIPE's independent perception** (`scene`/`diff`) instead of the agent's self-report. That's the defensible piece; the auth token itself is already solved by OAuth token-exchange.

## Key findings
- Gambit's attackers won't opt into an MCP — a cooperative server only covers honest/first-party agents, not the threat in the report. Reframe the market accordingly. (source: https://gambit.security/blog-posts/autonomous-ai-agents-online-retailers-25-a-company)
- "Authorized?" is already an OAuth problem: the `may_act` claim / RFC 8693 token-exchange answers "did a human authorize this agent" at exchange time, not as an after-the-fact log. Don't reinvent it. (source: https://mkaplan.substack.com/p/your-ai-agent-just-did-something)
- The unsolved half is provenance you can *trust*: incumbents record the agent's own action stream. UIPE gives you an **observed** before/after of the actual UI effect — attestation grounded in perception, not self-attestation. (source: UIPE SKILL.md — `scene()`/`diff()`)
- Regulators now demand cryptographically signed, tamper-evident delegation records (who delegated, which tool, which policy, outcome). That's the shape of the "record" tool. (source: https://dev.to/heartlinmachado/how-to-generate-cryptographic-proof-of-ai-agent-authorization-eu-ai-act-article-14-50g8)

## Existing players / prior art
- Aembit — agent workload auth/authz (identity at the door) — https://aembit.io/blog/secure-agentic-access-authentication-and-authorization-for-ai-agent-workloads/
- Delinea / SecureAuth — session recording + machine-identity governance — https://delinea.com/blog/ai-agent-authorization
- OAuth token-exchange (`may_act`) — the standard for delegated agent authority — RFC 8693

## The one-page sketch: what the MCP server exposes
Two halves. Auth = thin wrapper over OAuth. Provenance = the real product, fed by UIPE.

**Tools**
1. `request_grant(principal, agent_id, scope, ttl)` → signed capability token (`may_act`-style). Scope = allowed actions/targets. *(Thin; delegate to an OAuth AS if one exists.)*
2. `verify_grant(token, action)` → `{ok, reason}`. Checked before an action.
3. `attest_action(token, action, before_scene, after_scene)` → signed record binding the grant to the **UIPE-observed** UI diff. This is the differentiator: the effect is perceived, not claimed.
4. `get_provenance(target | agent_id)` → tamper-evident chain: who delegated → agent → action → policy → observed outcome.

**Resources**
- `grants://active` — live grants
- `provenance://{target}` — audit trail for a resource

## Concrete next steps for Dirk
1. Write the 1-pager around **perceive→attest** as the wedge; explicitly cut the "block adversarial agents" claim.
2. Prototype `attest_action` only — it's the sole tool that needs UIPE and the only thing incumbents can't trivially copy. Everything else is OAuth glue.
3. Pick ONE relying-party story to validate (agentic-commerce checkout: "prove my shopping agent bought what I authorized") before generalizing.

## Open questions
- Who verifies the signed record, and do they trust *your* attestation authority? (Chicken-and-egg on the signer.)
- UIPE is web-UI perception — does the attestation story hold for agents acting via APIs/tools with no UI to `diff`?
