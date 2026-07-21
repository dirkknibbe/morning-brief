---
date: 2026-07-21
classification: build-plan
action: Prototype a 50-line CLI that flags MCP/skill repos on typosquat lookalikes, in-README ZIP/.exe payloads, and star/fork anomalies (Trust Scanner seed)
source_brief: briefs/2026-07-21.md
---

## TL;DR
The 50-line CLI is trivially buildable — all three signals come from two unauthenticated GitHub REST calls, no cloning. But the "MCP security scanner" space is *crowded* (~500 repos): Snyk's agent-scan, mcp-shield, ramparts, Mcpwn, mcp-watch, Tencent AI-Infra-Guard. **The catch that saves the wedge:** nearly all of them scan a server you've *already installed/run* for prompt-injection/RCE/tool-poisoning. Almost none score a repo's **provenance at discovery time, before clone** — which is exactly the AgentBaiting vector (typosquat + poisoned ZIP surfaced by an agent, no code inspected yet). Build the prototype as a *pre-install reputation gate*, not another code scanner. Do it in an afternoon; the differentiation is the framing, not the code.

## Key findings
- Almost all prior art is **post-install / runtime** code analysis, and several *execute the server to scan it* — Snyk agent-scan warns "scanning MCP configurations will execute the commands defined in them." A pre-clone metadata check is strictly safer and fills the gap they leave open. (source: https://github.com/snyk/agent-scan)
- `invariantlabs-ai/mcp-scan` now **redirects to snyk/agent-scan** — Invariant was absorbed by Snyk. The independent-tool lane consolidated; a focused OSS provenance CLI is still unclaimed. (source: https://github.com/snyk/agent-scan)
- Two repos flirt with the pre-clone angle — `alexgreensh/repo-forensics` ("offline scanner for AI-agent repos") and `Pantheon-Security/medusa` ("vet any repo before you clone"). Neither advertises **typosquat-lookalike or fake-popularity (star/fork) detection** — that specific triad is open. Verify before over-investing. (source: GitHub search, 502 results)
- Technical minimum is real: `GET /repos/{o}/{r}` returns `owner.login`, `stargazers_count`, `forks_count`, `created_at`; `GET /repos/{o}/{r}/readme` returns the README. Levenshtein/Jaro-Winkler on owner+name vs a seed list of popular repos, a regex for `.zip`/`.exe`/release-asset links in the README, and a stars÷forks + account-age heuristic cover all three. No auth needed for public repos (60 req/hr; token → 5000).

## Existing players / prior art
- snyk/agent-scan (ex-mcp-scan) — runtime inventory + injection/malware scan, executes configs — https://github.com/snyk/agent-scan
- riseandignite/mcp-shield, highflame-ai/ramparts, Teycir/Mcpwn — server-side injection/RCE scanners — (see search)
- Pantheon-Security/medusa, alexgreensh/repo-forensics — repo/pre-clone vetting, closest neighbors — https://github.com/alexgreensh/repo-forensics
- Tencent/AI-Infra-Guard — full-stack AI red-team platform, enterprise-scale — https://github.com/Tencent/AI-Infra-Guard

## Concrete next steps for Dirk
1. **First PR (afternoon):** `trust-scan <owner/repo>` — two fetch calls, three signals, print a 0–100 verdict + reasons. Seed the lookalike list with the 20-30 most-starred MCP/skill repos (hardcode; YAGNI on a live registry). Ship as a single TS file run via Bun.
2. **Frame it as the missing layer:** README opens with "every other scanner runs *after* you trust the repo. This runs *before*." That one sentence is the whole positioning against 500 competitors.
3. **Then wrap as an MCP tool** (`check_repo_trust`) so agents self-vet before recommending an install — that's the AgentBaiting-specific move nobody else makes, and the UIPE-adjacent distribution wedge.

## Open questions
- Does medusa or repo-forensics already do star/fork anomaly + typosquat? 10-min README read before writing code — if yes, narrow to the agent-self-check MCP angle only.
- Where does the "popular repos" ground-truth list come from at scale — the official MCP registry, GitHub topic search, or a curated seed? (Prototype: hardcode. Product: needs a source.)
