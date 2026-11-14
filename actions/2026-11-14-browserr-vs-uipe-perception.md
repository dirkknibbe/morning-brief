---
date: 2026-11-14
classification: build-plan
action: Install Browserr and run one UIPE test page through it; list 3 perceptions each side has that the other misses
source_brief: briefs/2026-11-14.md
---

## TL;DR
The 30-minute estimate is wrong for your machine. Browserr v0.6.2 ships `macos-arm64`, `linux-x64/arm64` and `windows-x64`, but **not macOS x64**, and your Mac is an Intel `x86_64`. Also, there's no `browserr mcp` command: the MCP server is `python browserr_mcp.py`. Your realistic options are the `linux-x64` tarball in Docker (about 45 min with headless CPU rendering) or building Servo from source (hours, so skip it). The README already answers most of the comparison. Browserr is a **trust/action layer** (fail-closed network, human handoff, evidence log). UIPE is a **perception layer** (vision tiers, temporal diff). They overlap less than the brief said. Do the Docker run only if you want measured numbers for the benchmark idea.

## Key findings
- Repo created 2026-11-10, v0.6.2 tagged 2026-11-14 05:05Z, 8 stars, Apache-2.0. It's four days old, so the API will move. (source: https://api.github.com/repos/Omodaka9375/browserr)
- Release assets: no `macos-x64`. (source: https://api.github.com/repos/Omodaka9375/browserr/releases/latest)
- The MCP server is stdlib-only Python and spawns its own `engine` on the first tool call. You can attach over `--driver-port`. (source: https://github.com/Omodaka9375/browserr README)
- Compatibility is bounded by Servo 0.8. React 18 and Vue 3 are verified. DRM video, WebRTC and service-worker apps don't work. (source: README)
- UIPE: Playwright and CDP, a structural+visual+temporal scene graph, a 3-tier vision pipeline (OmniParser, Qwen3-VL, Claude Vision), `compare_states`, and `watch` (CDP screencast + pHash). E2E fixtures are served over HTTP by `packages/core/tests/e2e/fixture-server.ts`. (source: `~/uipe/ui-perception-engine/README.md`)

## Predicted comparison (from docs, not yet measured)
**Browserr perceives, UIPE doesn't:**
1. `detect_handoff()`: CAPTCHA, OTP, payment-field and consent-wall classification.
2. Form-field semantics: label, constraints, validity state, plus `read_outcome` after submit (invalid fields, alert texts).
3. Network evidence: every fetch/XHR is recorded in a ring buffer across all frames, plus held-request interception. UIPE only reports *failed* requests.

**UIPE perceives, Browserr misses:**
1. Visual understanding: OmniParser bounding boxes plus a Qwen3-VL hierarchy/contrast/spacing critique. Browserr only gives raw and annotated screenshots.
2. Temporal perception: keyframe capture over time plus a scene-graph diff (`watch`, `compare_states`). Browserr has no state diff.
3. Real-Chromium rendering fidelity. Anything Servo misrenders, Browserr's agent mis-perceives without knowing it.

## Existing players / prior art
- Browserr — Servo+SpiderMonkey agent engine with 42 MCP tools — https://github.com/Omodaka9375/browserr
- servo-devtools-mcp — a thinner MCP over Servo (navigate, a11y snapshot, console) — https://github.com/tuannx/servo-devtools-mcp
- BrowserMCP — Chrome-extension MCP — https://github.com/browsermcp/mcp

## Concrete next steps for Dirk
1. Decide whether you want measured numbers. If not, steal the idea instead: add a `detect_handoff`-style check to UIPE's `get_affordances`. It's the clearest gap.
2. If you do: `docker run --rm -it -v $PWD:/w python:3.12 bash`, unpack `browserr-0.6.2-linux-x64.tar.gz`, then run `python driver.py` against a UIPE fixture page. Use the SDK, not MCP, for the first run. It has fewer moving parts. (~45 min)
3. Serve the fixture with `startFixtureServer` on the host and reach it from the container via `host.docker.internal`.
4. Record `read_structure()` versus UIPE `get_scene` on the same page, and note any elements Servo drops. That diff is the benchmark seed.

## Open questions
- Does Servo render UIPE's fixture CSS correctly enough to compare at all?
- Will the author ship `macos-x64`? It's worth watching releases, but don't file an issue.
- How stable are Browserr refs (`e7`) across SPA re-renders compared with UIPE's element IDs?
