---
date: 2026-07-19
classification: build-plan
action: Fetch Throne's public registry format and draft what a UIPE self-verification receipt would contain (client verdicts, latency, security ruleset)
source_brief: briefs/2026-07-19.md
---

## TL;DR
Throne's receipt is simple and copyable: a per-server sealed record of *what ran, how it behaved across real clients, what security found, and a hash that seals it* — verdict enum `FIT / NEEDS KEY / INCONCLUSIVE / NOT FIT`, ULID scan id, ISO timestamp, `sha256:` evidence hash. You can emit a UIPE-flavored version cheaply, and a concrete schema is drafted below. **But be honest about what it buys you:** Throne's entire moat is being the *independent* party executing in a disposable microVM. A receipt UIPE signs about *itself* is a test badge, not sealed third-party evidence — useful as a CI regression gate and README signal, weak as a trust proof. The sharper wedge is to **get UIPE onto Throne's public registry** (free — they already execute public MCP servers) and use the self-receipt only as your internal gate. Don't over-invest in inventing a format when in-toto Statement v1 already is the format.

## Key findings
- Throne's registry record = `{ server (name + source: npm/github/uvx/json), verdict, security: clean, sealed_at, evidence_hash: sha256 }`; receipt adds runtime (`microVM · Isolated · Ephemeral · Reproducible`), per-client `protocol checks passed`, `security ruleset v1` findings count, scan id `scan_01JW…` (ULID). (source: https://usethrone.dev, /registry)
- Two "calibrated clients" (Claude Code, Cursor) + "8 static security rules"; verdict maps to `allow / review / block`. Audit trail = `scan id / sealed hash / raw traces`. (source: https://usethrone.dev/enterprise)
- The value is governance, not the scan — "the artifact you hand a reviewer instead of a screenshot." Regressions surface when a package/client update changes the record → CI gate blocks release. (source: https://usethrone.dev/enterprise)
- Don't invent an envelope: in-toto Statement v1 (`_type`, `subject[].digest.sha256`, `predicateType`, `predicate`) + DSSE signing is the industry standard for exactly this. Put UIPE's fitness data in a custom `predicate`. (source: https://github.com/in-toto/attestation)

## Existing players / prior art
- **Throne** (usethrone.dev) — third-party MCP verification-as-a-service; sealed public registry. The thing to *list on*, not out-build.
- **in-toto / SLSA** — attestation envelope + provenance predicate; reuse the Statement + DSSE layer.
- **Sigstore / cosign** — keyless signing so the receipt is verifiable without you shipping a key.

## UIPE fitness-receipt draft (in-toto Statement v1)
```jsonc
{ "_type": "https://in-toto.io/Statement/v1",
  "subject": [{ "name": "uipe-mcp", "uri": "npm:uipe-mcp@x.y.z",
                "digest": { "sha256": "<build-hash>" } }],
  "predicateType": "https://uipe.dev/attestations/fitness/v1",
  "predicate": {
    "scanId": "scan_<ULID>", "timestamp": "<ISO8601>",
    "runtime": { "isolation": "container|microvm|none", "reproducible": true,
                 "runtimeVersions": { "bun": "…" } },
    "clientVerdicts": [ { "client": "claude-code", "version": "…",
                          "handshake": "ok", "toolsDiscovered": 3,
                          "protocolChecks": "passed" },
                        { "client": "cursor", "protocolChecks": "passed" } ],
    "latency": { "coldStartMs": 0, "p50Ms": 0, "p95Ms": 0,
                 "perTool": { "<tool>": { "p95Ms": 0 } } },
    "securityRuleset": { "version": "v1", "rulesEvaluated": 8,
                         "findings": [], "result": "clean" },
    "protocol": { "mcpVersion": "…", "transport": "stdio|http",
                  "capabilities": ["tools"] },
    "verdict": "FIT|REVIEW|NOT_FIT",
    "evidence": { "rawTraceSha256": "…" } } }
// DSSE-wrapped, cosign keyless-signed.
```

## Concrete next steps for Dirk
1. **Submit UIPE to Throne's registry** (`Verify server` → npm/github URL). A third-party `FIT` record beats any self-signed badge; costs nothing and validates the whole thesis first.
2. If listed and fit, embed that record link in the UIPE README — that's the adoption wedge from item 31, done for free.
3. Only then build the self-receipt as a **CI artifact**: run UIPE against Claude Code + one other client, capture latency + your own security checks, emit the JSON above, DSSE-sign, fail the build on verdict != FIT. First PR = a `scripts/fitness-receipt.ts` + a GH Action step. Label it "self-attested," never conflate with Throne's sealed evidence.

## Open questions
- Does Throne accept self-hosted / non-published MCP servers, or only public npm/github/uvx packages? (Determines whether UIPE can even be listed pre-launch.)
- What are Throne's 8 security rules? Not public — worth matching so a UIPE self-receipt won't later flip to NOT_FIT on their registry.
