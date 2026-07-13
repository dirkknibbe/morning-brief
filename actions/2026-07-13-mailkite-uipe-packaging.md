---
date: 2026-07-13
classification: build-plan
action: Read MailKite's demo-amazon-ses-ai-agent receive→think→reply loop, then draft a one-pager mapping UIPE onto the same MCP-native / JSON-in-out / founding-cohort packaging.
source_brief: briefs/2026-07-13.md
---

## TL;DR
MailKite's demo repo is a ~10-file marketing asset disguised as code, and *that* — not the email domain — is the transferable win. The loop is trivial (`verifyWebhook` one call → parsed+authenticated JSON `event` → `runAgent` stub → one `mk.send()`); the genius is the packaging: a repo that runs the whole loop with **zero account, zero LLM, dry-run by default**, sits next to the "hard way" (SES: S3 + SNS + Lambda + MIME parse) *in code*, and boots one-click in StackBlitz. UIPE should clone this exact shape as its next distribution asset — a runnable perception loop against a local fixture, next to a raw-Playwright+vision-LLM contrast. But copy the *packaging*, not the demand assumption: email is a universal need every agent has; "perception accuracy" is not yet proven to be one (your own 07-12 open question). Build the demo repo as a cheap demand probe, not a launch.

## Key findings
- **The loop is 5 lines of substance.** `MailKite.verifyWebhook(sig, body, secret)` (HMAC + replay window + constant-time compare in one call) → `event.text` + `event.auth.{spf,dmarc}` already parsed → `runAgent()` → `mk.send()` that threads via `inReplyTo`. No S3, no MIME parse. (source: github.com/mailkite/demo-amazon-ses-ai-agent/server.mjs)
- **Demo-as-marketing is the real product.** Runs end-to-end with no MailKite account and no model — reply is a dry-run, agent is a swappable stub. Self-fires a signed sample event on `npm start`. (source: same repo README)
- **Contrast-in-code is the persuasion device.** `ses-contrast/handler.mjs` is a faithful, labeled, *non-runnable* sketch of the SES path so the reader sees the pain next to the ease, backed by two truthful `npm test` assertions. (source: README "SES contrast, in code")
- **Two-tier packaging, one repo.** `server.mjs` = BYO-agent (host your own endpoint); `managed-route.mjs` = `mk.createRoute({action:"agent"})` hands turns to a hosted durable runner. Same product, two commitment levels. (source: README "two ways to run")
- **Security is sold as a feature, not a footnote.** "The body is untrusted INPUT, never instructions" + weight by `event.auth` verdict. UIPE's analog: perception output is untrusted; gate affordance-actions on a confidence verdict. (source: server.mjs comments + agent-inbox-security post)
- **Founding pricing:** 50% off first year, first 1,000 customers. MCP-native. (source: briefs/2026-07-13.md)

## Existing players / prior art
- **MailKite** — "SES for AI agents"; the packaging blueprint being cloned — https://mailkite.dev/blog/amazon-ses-for-ai-agents/
- **UIPE (prior dossiers)** — MCP-native perception engine already positioned as control-plane / skill; pricing explored in `2026-07-06-uipe-flat-rate-wedge-test.md`, distribution in `2026-05-10-endara-uipe-mcp-distribution.md`.

## Concrete next steps for Dirk
1. **Build `demo-uipe-perception-agent`** — a zero-account, dry-run repo: fixture page → `uipe.perceive()` returns JSON events → stub agent acts → prints the loop. `npm start` self-fires one scenario. This is the one-pager *as running code*; the README is the one-pager.
2. **Add the contrast dir.** `raw-contrast/` = the hand-rolled Playwright + screenshot + vision-LLM path (labeled, non-runnable), so buyers see the MIME-parse-equivalent pain UIPE removes. Pin it with 2 truthful tests like MailKite does.
3. **Ship two tiers in one repo:** `server.mjs` (BYO browser/MCP self-host) + `managed-route.mjs` (UIPE-hosted perception runner). One-click StackBlitz target on the BYO file.
4. **Treat launch as a probe, not a bet.** Instrument the repo (clones, StackBlitz opens); if a MailKite-style runnable demo can't move perception the way it moved email, that's the cheapest possible "no" — before founding-cohort pricing.

## Open questions
- Does UIPE's perception loop survive the "runs with no account, no LLM, dry-run" constraint? MailKite's does because auth+parse happen at their edge; UIPE needs a *browser* — can the demo fixture bundle one (WebContainers?) or does it break the zero-setup promise?
- Is the buyer's pain "I hate wiring Playwright/CDP" (packaging fixes this) or "I don't trust any perception output" (packaging doesn't)? MailKite's SES pain was concrete plumbing; validate UIPE's is too.
