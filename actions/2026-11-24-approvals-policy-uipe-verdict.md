---
date: 2026-11-24
classification: build-plan
action: Draft a 10-line sample Claude Approvals policy that cites a UIPE verdict and add it to the uipe-verify-ui-outcome-spec doc as the integration story
source_brief: briefs/2026-11-24.md
---

## TL;DR
The sentence in the brief can't be written as a policy. A Claude Approvals condition can read only `pr/*` facts (file counts, diff lines, authors, base branch, approvers) and classifier answers. The docs say plainly: "A condition can't read CI results, so keep CI as its own required check in GitHub." A custom classifier can't help either. It runs in a read-only cloud session that sees the PR's text, diff and files, and every one of those can be written by the PR author. So the honest integration story is **two gates side by side**. `uipe/verify-checkout` is a required GitHub status check, and `.claude/approvals.yml` decides who approves. Pitch UIPE as "the UI check Approvals tells you to keep separate", not as "a signal Approvals consumes". This also weakens the brief's "$X per verified PR" spark: Anthropic offers no hook to attach to.

## Key findings
- Policy file is `.claude/approvals.yml`. It contains `version: 1`, an optional `mode: observe`, and `rules[]`. Each rule has `purpose`, `paths`, `verdict {claude: approves|comments|blocks, seats}`, `advisory`, `override[{if, verdict}]`. (source: https://code.claude.com/docs/en/approvals)
- The available facts are `pr/files_changed|added|removed`, `pr/diff_lines`, `rule/files_*`, `pr/authors`, `pr/opened_by`, `pr/approved_by` and `pr/base`. There is **no `pr/labels` and no check status**. Conditions support `AND`. (source: https://code.claude.com/docs/en/approvals-policy)
- A `repo/<name>` classifier is a read-only Claude Code cloud session. It can read the PR title, description, labels, diff, files and approvals. Its tools are `findings`, `comment`, `code`, `labels` and `reviewers`. It has no network and no CI access. The docs warn that the author's text "can try to steer the classifier's answer". (source: https://code.claude.com/docs/en/approvals-classifiers)
- `claude: approves` starts no review by itself. Gate it on `claude/code_review = pass`. Claude's approving review can also satisfy a GitHub "1 approval" rule. That is the reason the UIPE check has to be *required*, so that it blocks independently. (source: https://code.claude.com/docs/en/approvals)
- Anthropic's launch post recommends observe mode first. Classifier and Code Review runs are billed even in observe mode. (source: https://claude.com/resources/articles/introducing-claude-ship)

## Sample policy (paste into the spec's "Integration story" section)
```yaml
# .claude/approvals.yml — pair with GitHub required checks "Claude Approvals" + "uipe/verify-checkout"
version: 1
mode: observe
rules:
  - purpose: "Checkout is a money path: one non-author human; Claude approves small diffs only after Code Review passes. The UI outcome is proven by the required uipe/verify-checkout check, not here."
    paths: ["src/checkout/**", "src/components/cart/**"]
    verdict: { claude: comments, seats: [{ count: 1, from: [humans, "!pr/authors"] }] }
    advisory: [claude/code_review]
    override:
      - { if: "claude/code_review = pass AND pr/diff_lines <= 150", verdict: { claude: approves, seats: 1 } }
```
Caveat: the file also needs a catch-all `paths: ["**"]` rule, because files with no rule fail the check.

Story text: *"Approvals decides **who** signs off. UIPE proves **the flow still works**. Branch protection requires both, so an approving review from Claude can't merge a PR that broke `/checkout`."*

## Existing players / prior art
- Claude Approvals (beta): "a smarter CODEOWNERS" — https://code.claude.com/docs/en/approvals
- AgentProof: signs tool calls, which is where UIPE verdict signing belongs — `actions/2026-11-20`
- Proof Loop / Pi Dash: frozen criteria plus a separate verifier — `actions/2026-11-23`

## Concrete next steps for Dirk
1. Create `~/uipe/docs/specs/verify-ui-outcome.md` from `actions/2026-11-23` (it doesn't exist yet) and add the policy above as §Integration. About 15 min.
2. In the spec, name the GitHub check `uipe/verify-<flow>` and define it as running `expect_ui_outcome` and `verify_ui_outcome` against a preview deploy. That makes it a status check, not an MCP call. About 10 min.
3. Drop the "Approvals consumes the UIPE verdict" framing from the pitch. Replace it with "the UI check the Approvals docs tell you to keep separate".

## Open questions
- Will Anthropic add a fact for check status (e.g. `pr/checks`)? If so, the original framing becomes real. Watch the docs changelog.
- With `seats: 1` in the override, can the author fill the seat alone? Validate in observe mode on a test repo (needs a Team plan).
- Could a `repo/ui_risk` classifier usefully pick *which* UIPE flows to require, given that it can't read the results?
