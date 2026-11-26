---
date: 2026-11-26
classification: research
action: Read Google's Workspace AI Tools Addendum + Gmail MCP tool list; audit whether UIPE or any of Dirk's agents call Workspace REST and what breaks on Feb 1 2027
source_brief: briefs/2026-11-26.md
---

## TL;DR
Nothing you own breaks on Feb 1. A grep across `~/` (morning-brief, uipe, torah-keeper-payroll, real-estate-crm, agent_orchestration, pi_durable, cogit, vfs-memory, claude-workflow, backseat-agent) found **zero direct Workspace REST calls**. No `googleapis`, `gmail/v1`, `drive/v3` or `calendar/v3`. The only Workspace touch is `job-scraper-dataset-routine`, which reads Gmail through an MCP connector (`mcp__gmail__*`) behind a read-only allow-list hook. That's already the shape Google wants. The real exposure is future work: the "Workspace-compliance shim" spark and anything with long-lived inbox memory run straight into the partner-only send tools and the 30-day embedding cap.

## Key findings
- **The rule:** from 2027-02-01, any tool that "is or is driven by an AI Agent, an AI Harness or an AI model" must use Google's MCP servers. Disguising an agent is also banned. Direct REST still works but is held to Standard-tier quota and breaches the terms. Non-AI scripts on their own OAuth client are "not affected." (source: https://techstackups.com/articles/google-workspace-ai-agents-mcp/)
- **What the Gmail MCP covers:** search and read threads, create and list drafts, labels, trash, spam. Send, reply, forward and draft editing are **partner-only**. There's no attachment download and no push notifications. (same source)
- **Anthropic's own Workspace connector advertises send, reply and forward**, so it's on the partner path. Your routine's connector inherits that. You're also guarded read-only anyway (`job-scraper-dataset-routine/.claude/hooks/guard_gmail.py:1`).
- **OAuth clients need the new "AI-powered agent" checkbox.** Since 2026-11-11, the MCP servers reject clients without it. Clients created before that can't be converted; you'd need a new client. This only matters if you ever self-host against Google's MCP.
- **Data rules in the Addendum:** Workspace data can be processed only for active, user-authorized tasks. Google can cap retention of embeddings, memory indexes and profiles at **30 days**. Training, evals and distillation on the data are banned.
- **Quota:** 5,000 MCP requests per day per project per product. `search_threads` counts as 10, so you get about 500 searches a day. Scaled tier billing starts 2027-04-01.
- **Couldn't verify the primary source:** my guessed URL for the Addendum on developers.google.com returned 404. All facts here come from one secondary write-up, which an AI drafted and a human edited. Treat the exact wording as unconfirmed.

## Existing players / prior art
- Google Workspace MCP servers (8, GA 2026-11-24) + `gwscli`: the official agent path
- `google_workspace_mcp` (OSS, REST-backed): keeps running after Feb 1, but outside the terms
- Anthropic Google Workspace connector: has partner-tier send and reply
- Fastmail MCP: pitching "no partner-only tools" as the alternative

## Concrete next steps for Dirk
1. **Nothing to migrate.** Log "no Workspace REST exposure" as of 2026-11-26 and move on.
2. **Kill or reshape the "compliance shim" spark.** A proxy that hands send off to a "non-agent OAuth path" is the disguise the Addendum explicitly bans. If you want the idea, the defensible version is a human-approval queue that drafts via MCP and leaves the user to hit send in Gmail.
3. **Keep the guard hook.** It's the right posture. If the routine ever needs to send, route that through Telegram/Discord to you instead of fighting for partner access.
4. **UIPE angle (optional, 10 min):** Google's "policy checks and human confirmation in the request path" framing makes the same case as UIPE's "evidence of permission" receipts. Note it as a positioning quote, not a build.

## Open questions
- What's the exact Addendum text and URL? Google's MCP quota page should list the partner-only Gmail tools; confirm there.
- Does a personal script that pipes your *own* inbox into an LLM count as an "AI Harness"? Google hasn't said anything about hobby use.
- What does it take to qualify for partner access, and is there a timeline for the send tools to reach everyone?
