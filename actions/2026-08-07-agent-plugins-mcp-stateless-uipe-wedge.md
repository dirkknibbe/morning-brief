---
date: 2026-08-07
classification: research
action: Read Agent Plugins 1.0 + MCP 2026-07-28 stateless spec, write a one-page note on where UIPE slots in as the permissions/perception layer both omit.
source_brief: briefs/2026-08-07.md
---

## TL;DR
Both specs are real and both deliberately leave the runtime safety layer open — but read the actual normative text, because the gap is *narrower and sharper* than the brief's "they left permissions out." Agent Plugins v1 **does** define containment: it just scopes it to **package paths only** (§4.1), explicitly stating those rules "do not sandbox a plugin subprocess or restrict paths supplied at runtime," and command/env values are "opaque strings" the client "MUST NOT interpret." So the spec governs *where a plugin's files live*, not *what its MCP server does once running*. MCP 2026-07-28 removes the `initialize` handshake and session id — every request is self-contained and routable to any instance — which means there is now **no server-side session to hang consent/permission state on**. UIPE's wedge is exactly the seam these two create: a **per-call, stateless, deterministic runtime sensor** that verifies what an `act` actually did to the rendered end-state, the one thing neither the package format nor the wire protocol will ever assert. Write the note framing UIPE not as "the missing permissions section" (clients own that) but as the **ground-truth verification primitive** clients must call to make their permission decisions non-blind.

## Key findings
- Agent Plugins v1 containment is package-scoped only; §4.1 explicitly disclaims subprocess sandboxing and runtime path restriction. Installation, distribution, **policy**, sandboxing, and trust are each "kept by the client." (source: https://agent-plugins.org/specification)
- v1 restricts components to Agent Skills + MCP servers on purpose ("both already have specs and adoption"); it is not redefining execution or security semantics — that's the "deliberately small" surface. (source: https://agent-plugins.org/specification#why-only-agent-skills-and-mcp-in-v1)
- MCP 2026-07-28 removes `initialize` + protocol-level session; version/capabilities ride on each request, `server/discover` fetches capabilities on demand — no session affinity, any request → any instance. (source: https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- Statelessness kills session-scoped consent: a permission/perception layer *must itself be per-request and routable* — which happens to be UIPE's native shape (deterministic sensor, no model on the hot path, no session memory needed to read an end-state). (source: https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- The layer is unowned by design, not by oversight: five rivals agreed on the *plumbing* and pushed *trust* down to each client. Clients want a primitive to call, not another framework. (source: briefs/2026-08-07.md)

## Existing players / prior art
- **Agent Plugins clients** (ChatGPT, Codex, Cursor, Copilot, Kiro, VS Code) — each owns its own permission UX; none ships ground-truth perception. — https://agent-plugins.org/
- **Armature** — MCP-side trace observability + LLM-judge evals; infers failure from traces, does *not* perceive real end-state (UIPE's earlier dossier). — https://armature.tech
- **Aident** — sells the 27k-action catalog + audit trail, not verification of effect. — brief 2026-08-07

## Concrete next steps for Dirk
1. Write the one-pager with the corrected framing: UIPE is a **verification primitive clients call**, not "the permissions section the spec forgot." Lead with the two exact citations (§4.1 runtime disclaimer; MCP session removal) — they're the whole argument.
2. State the stateless-fit explicitly: UIPE needs no session, so it drops behind the same round-robin infra MCP 2026-07-28 now assumes. That's a one-line differentiator vs. any session-based policy proxy.
3. Scope the demo to the seam: a plugin whose MCP server returns `200 OK` for an `act` that did *not* land in the DOM — UIPE catches it, the client's permission gate would not. That's the "human misses the exfil 1/3 of the time" story made deterministic.

## Open questions
- Does any launch client expose a pre-execution hook UIPE could register as, or is UIPE strictly an in-band MCP server the agent must choose to call? (Determines whether it's opt-in perception or an enforceable gate.)
- MCP "Extensions framework" + Tasks — is there a sanctioned extension slot for a verification/attestation capability, so UIPE ships as a spec-blessed extension rather than a bolt-on server? Worth reading the Extensions section before the note is final.
