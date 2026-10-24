---
date: 2026-10-24
classification: build-plan
action: Read Vericto's proxy design and sketch whether UIPE can intercept-and-confirm destructive browser clicks/submits, not just perceive — "Vericto for browsers."
source_brief: briefs/2026-10-24.md
---

## TL;DR
Vericto's architecture does **not** port directly. Vericto blocks because it *owns the wire* — a transparent proxy sitting inline on the Postgres/MySQL connection, parsing every statement with a deterministic AST and returning a native SQL error. UIPE has no equivalent wire: it's an MCP tool the agent *calls* to read UI state, and an MCP server has zero authority over what the host does next (confirmed Oct 12, Indexio dossier). So "intercept-and-confirm" cannot live inside UIPE the way blocking lives inside Vericto. **But the feature is reachable** — and you already scoped it twice. The gate must live in the **harness hook layer** (a `PreToolUse` hook on the browser click/submit tool), calling UIPE to classify *what* the pending action does, then eliciting confirmation. This is not new research; it's the build. First PR below.

## Key findings
- Vericto is inline-on-the-wire, deterministic, zero-code-change *because* the app just swaps host:port. "No AI, no stochastic heuristics — same input always same result." The moat is owning the connection path (source: https://raw.githubusercontent.com/vericto/vericto-proxy/main/README.md).
- There is **no "UIPE wire."** The agent perceives via UIPE, then acts via a *separate* browser tool (Playwright/CDP `browser_click`). Nothing routes the click through UIPE, so UIPE can't error it out (synthesis: Vericto README + Indexio dossier).
- The only hard enforcement seam for a browser click is a **`PreToolUse` deny hook** — harness-specific, Claude Code–tested only, needs a `# raw` escape hatch (source: actions/2026-10-12-indexio-tool-call-override.md).
- You already defined this exact product tier on Aug 19: "approval-before-write" is *the* UIPE-native control because only a perception engine can tell the human *what* they're approving ("this button submits a $4k order"). Allowlist is commoditized; approval+audit are the defensible pair (source: actions/2026-08-19-uipe-governed-action-positioning.md).
- Don't rebuild a policy algebra for the gate decision — OpenAPPA/Cedar/OPA/DFC own deterministic enforcement, MIT-licensed and benchmarked. UIPE's wedge is *perceiving and explaining* the pending action, not the allow/deny algebra (source: actions/2026-09-29-uipe-flow-scoped-guardrails.md).

## Existing players / prior art
- Vericto — inline SQL wire-proxy, the thing being analogized — https://github.com/vericto/vericto-proxy
- MCP elicitation (2025-06 spec) — the protocol hook for human-approval; still unproductized for browser writes
- NeoBrowser / browser-use / Vercel agent-browser — capability-layer browser agents with the same governance gap
- Indexio — reference impl of `PreToolUse` deny-hook interception — https://github.com/IOServicesLabs/indexio

## Concrete next steps for Dirk
1. **Kill the "port Vericto" framing.** The honest one-line verdict: UIPE can't intercept like a proxy; the intercept must ride a harness hook. Say that out loud before building.
2. **First PR (Claude Code only):** a `PreToolUse` hook on `browser_click`/`browser_fill_form`/submit tools that (a) calls UIPE to read the pending action, (b) runs a cheap destructive-action classifier (submit / delete / pay / irreversible nav), (c) on hit, emits `permissionDecision:"ask"` with a reason naming *what* the action does. ~1 afternoon to spike; reuse the Indexio stdin/stdout JSON contract.
3. **Make the deny/ask reason the product.** The steering copy ("about to submit order $4,120 — confirm?") is the only UIPE-native surface here. Write three example reasons before any classifier logic.
4. **Defer the algebra and the audit receipt.** Confirm-gate first; signed receipt (your Jul 27 primitive) is PR #2.

## Open questions
- Does a `PreToolUse:"ask"` reliably pause a browser-agent loop, or do some harnesses auto-retry? (Indexio logs usage but quotes no adherence %.)
- Which harnesses besides Claude Code expose a `PreToolUse` contract on browser tools? Portability is unproven and this feature is worthless if it's Claude-Code-only.
- Is "confirm-before-destructive-click" a product, or a feature browser-use absorbs in one release (as NeoBrowser did with allowlist)?
