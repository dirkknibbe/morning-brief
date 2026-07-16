---
date: 2026-07-16
classification: research
action: Read Grepathy's REPORT.md (published blind eval, misses included) as a credibility template for proving an agent-trust tool like UIPE actually works.
source_brief: briefs/2026-07-16.md
---

## TL;DR
Grepathy's `docs/REPORT.md` is a near-ideal template for an "our agent-trust tool actually works" writeup, and its credibility comes almost entirely from **publishing the losses**: it reports the two pre-registered bars it *missed* (guardrail 1/3, status-accuracy 0.71 vs 0.80) as prominently as the wins. The transferable spine is six moves — separated roles, pre-registered bars, an *honest* baseline (not a strawman), blind-to-condition judging, a narrowly-located claim, and a caveats section that names the untested comparison that would decide the tool's real size. UIPE should copy this structure wholesale before it ships any "it works" claim. The single most important discipline to steal: register accuracy bars *before* any run and publish the misses unedited — a report that only shows wins reads as marketing and buys no trust.

## Key findings
- **Three separated roles kill "grading your own homework":** an oracle writes answer keys from ground truth, subjects answer blind, a judge grades **blind to which condition produced the answer**. Same-family bias (Claude judging Claude) is mitigated by blind, binary grading. (source: https://github.com/evansjp/grepathy/blob/main/docs/REPORT.md)
- **Pre-registered bars are the load-bearing credibility move:** every metric has a threshold set before runs, shown in a table with ✅/❌ — including the two ❌ misses. You cannot move goalposts after the fact. (source: REPORT.md §"What we tested")
- **Baseline must be honest, not a strawman:** condition B = "the repo as-is (code + commits, no tool)." The tool only earns credit where it beats a *diligent reader of the real alternative*. On 5/6 code-inferable questions B and C tied. (source: REPORT.md §3)
- **Locate the win precisely, then refuse to oversell:** the whole edge is "reasoning that is *traceless in code*" (provenance, considered-but-rejected alternatives) — ~1/6 of questions here. The "honest one-liner" states what it does AND explicitly what it does *not* (not a refactor guardrail, not "smarter agents"). (source: REPORT.md §"honest one-liner")
- **Fix-and-re-verify, not fix-and-reword:** the eval surfaced 5 bugs; they fixed each "at the layer that won't rot" and *re-ran the eval*, which caught a regression (money figures relocating to an unchecked field) that a prompt-only fix would have shipped. (source: REPORT.md §"The re-run earned its keep")
- **Caveats name the test that would resize the tool:** "why-pack vs. disciplined commit hygiene" was untested — and they say that's the open question deciding how big the tool really is. Naming your own biggest gap *raises* trust. (source: REPORT.md §"What to believe")

## Existing players / prior art
- Grepathy — agent-decision recorder; the report itself is the artifact to imitate — https://github.com/evansjp/grepathy/blob/main/docs/REPORT.md
- Pre-registration norm (borrowed from clinical/social science) — bars-before-runs is what makes the misses believable rather than cherry-picked.

## Concrete next steps for Dirk
1. **Draft UIPE's REPORT.md skeleton now, empty:** roles (oracle = ground-truth UI states; subject = agent-with-UIPE vs agent-with-raw-screenshot-to-VLM; blind judge), a bars table, and a "What we fixed / re-verified" section. Fill it as the benchmark runs.
2. **Pick UIPE's honest baseline deliberately:** the strongest non-UIPE path (raw VLM on a screenshot), not a broken one. The credible claim is only what UIPE catches that a good VLM misses — likely *traceless/dynamic* UI state (mid-animation, invisible-but-present, race conditions), mirroring Grepathy's "traceless in code."
3. **Pre-register 3–4 numeric bars before running anything** (perception recall/precision, hallucinated-state rate=0, and a bar UIPE will plausibly *miss*), then publish the miss.

## Open questions
- What is UIPE's equivalent of "traceless in code" — the specific UI signal a raw VLM provably can't recover? That's the one claim worth building the whole eval around.
- Who can serve as an independent oracle/judge for UIPE without same-family bias, given it's a UI-perception tool judging UI?
