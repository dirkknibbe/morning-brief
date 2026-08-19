---
date: 2026-08-19
classification: research
action: Turn the NeoBrowser `dongkeren` reply's 4 missing controls (allowlist, approval, audit, revoke) into a one-page UIPE positioning note — "perception is step one; governed action is the product."
source_brief: briefs/2026-08-19.md
---

## TL;DR
A stranger (`dongkeren`) on the NeoBrowser HN thread wrote UIPE's go-to-market copy for free: session-authority browser agents ship with no allowlist, no approval gate, no audit record, and no revocation — and he framed it as a design principle, *"the more real authority the agent has, the more important the responsibility."* That is exactly the "perception → governed action" ladder. The positioning note below is ready to lift into a landing page or investor one-pager. **One honest caveat: the allowlist half is already commoditizing** — NeoBrowser's author shipped `NEOBROWSER_DOMAIN_ALLOWLIST` *in the same thread*. So UIPE should not sell "allowlist"; it should sell the two controls raw tools won't add casually: **approval-before-write** (needs perception to know *what* is about to happen) and **tamper-evident audit** (needs a receipt primitive). Perception is the wedge that makes those two defensible.

## Key findings
- The `dongkeren` comment lists exactly 4 gaps and one root cause: *domain allowlist; human approval before submit/delete; persistent audit record; revoke a granted session* — plus "prompt injection may induce the agent to perform write operations." (source: https://news.ycombinator.com/item?id=49345320)
- The maintainer conceded and shipped allowlist mid-thread ("Domain allowlist is in… Appreciate the push"). Allowlist is table-stakes, not a moat. (source: same thread)
- Nobody disputed the tool *works*; the entire 30-comment thread is about trust/authority. Demand signal is governance, not capability. (source: same thread)
- Root cause is authority delegation: reusing a real logged-in profile hands the agent the user's full standing authority — write ops included. Governance must be *designed in*, per the commenter. (source: same thread)
- The two hard controls both depend on perception UIPE already produces: approval-before-write needs a semantic read of the pending action ("this button submits a $4k order"); audit needs a verifiable record of *what was on screen* at action time. Allowlist and revoke are plumbing anyone can add.

## Existing players / prior art
- **NeoBrowser** — the tool being governed; ships allowlist, not approval/audit/revoke — https://github.com/pitiflautico/neobrowser
- **browser-use / Vercel agent-browser / BrowserOS** — capability-layer browser agents, same governance gap — https://github.com/browser-use/browser-use
- **MCP elicitation (2025-06 spec)** — the protocol hook a human-approval tier plugs into; nobody's productized it for browser writes yet.
- **aaap-challenge** (today's brief) — "sealed evidence record of an agent run" — the audit/receipt primitive UIPE can marry to perception.

## Concrete next steps for Dirk
1. Write the one-pager with this spine: **Perception (UIPE today) → Approval-before-write → Tamper-evident audit → Revoke.** Lead with the `dongkeren` quote as the epigraph — third-party validation beats self-assertion.
2. Drop "allowlist" from the pitch as a headline feature (commoditized). List it as "included," spend the ink on approval + audit.
3. Frame approval-before-write as *the* UIPE-native tier: only a perception engine can tell the human *what* they're approving. That's the "why us."
4. Stub a demo storyboard: agent about to submit a form → UIPE snapshots the semantic action → human approves → signed receipt written. One GIF sells the whole thesis.

## Open questions
- Is UIPE's perception output structured enough to describe a *pending* action pre-click, or only observe post-hoc? Approval-before-write needs the former.
- Does the audit tier need its own receipt format, or adopt aaap-challenge / A2A signed-card primitives to avoid a standards fight?
