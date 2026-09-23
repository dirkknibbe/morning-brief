---
date: 2026-09-23
classification: research
action: Dissect Coverage Cat's mcp.json / agents.txt / llms.txt and copy the agent-discovery + tool-exposure pattern for UIPE.
source_brief: briefs/2026-09-23.md
---

## TL;DR
Coverage Cat is a clean, production reference for the MCPAASTA model: they blanket every emerging agent-discovery convention so *any* runtime finds them, expose a **no-auth default MCP** so an agent can transact with zero setup, and put the real IP in a giant embedded `instructions` runbook — not in the tool list. For UIPE, copy the *shape* but not the surface area: ship the 3-file core (`llms.txt`, `agents.txt`, `.well-known/mcp.json`) plus one read-only no-auth MCP endpoint first, and pour your effort into the `instructions` prose. The other ~12 discovery URLs they maintain are cheap insurance against a fragmented ecosystem, not day-one requirements.

## Key findings
- **Layered discovery, on purpose.** They publish `/agents.txt` (plain-text router), `/llms.txt` + `/llms-full.txt` (markdown map), `/.well-known/mcp.json` (MCP registration), a `server-card.json`, plus `agent.json`, `agent-skills/index.json`, `ai-catalog.json`, `api-catalog`, and an `/agent-plugin/plugin.json` bundle. Same info, many formats, root + `.well-known` aliases. (source: https://coveragecat.com/llms.txt)
- **Tiered auth is the unlock.** Default MCP (`/api/consumer/mcp`, registered via `.well-known/mcp.json`) is `authentication.required=false`. A separate operator MCP (`/api/agent/mcp`) needs a bearer token w/ scope `coveragecat:agent_api`. Agents can quote/prefill/checkout with no OAuth dance. (source: https://coveragecat.com/.well-known/mcp.json)
- **The `instructions` field IS the product.** ~4KB of embedded prose telling the agent which tool to call first, what to ask on cold start, canonical field names (`address.street` not top-level `street`), consent timing, date normalization, and formatting rules. The tool *names* are trivial; this runbook is the moat. (source: server-card.json)
- **Everything has a `.md` mirror** (`openapi.yaml.md`, `api/agent.md`) so text-only agents still parse it. REST + OpenAPI exist purely as a non-MCP fallback. (source: https://coveragecat.com/agents.txt)
- **`agents.txt` is a routing table, not content** — it just points at the MCP URL, REST discovery, OpenAPI, and browser start URLs, with `notes:` on precedence ("if your runtime supports MCP, start there"). (source: https://coveragecat.com/agents.txt)

## Existing players / prior art
- Coverage Cat — AI-native insurance broker, the subject; the most complete live MCPAASTA impl seen — https://coveragecat.com/developers
- `llms.txt` — de-facto adopted convention for LLM site maps (bet on this) — https://llmstxt.org
- agent-plugins.org — the `plugin.json` schema they use; newer, not yet a standard — https://agent-plugins.org

## Concrete next steps for Dirk
1. **Ship the core trio as static files first:** `/.well-known/mcp.json`, `/llms.txt`, `/agents.txt`. No backend needed to get discoverable.
2. **Stand up ONE no-auth read-only MCP endpoint** exposing 2-3 UIPE tools. Prove the zero-setup path before building any auth/checkout tools.
3. **Write the `instructions` runbook** — treat it as the deliverable, not boilerplate. This is where UIPE's domain logic lives.
4. **Add REST+OpenAPI + `.md` mirrors** only after the MCP path works, as the non-MCP fallback.
5. **Defer** the agent-plugin bundle, `agent-skills/index.json`, and the catalog files. Cargo-culting all 15 URLs is wasted effort until the trio pulls traffic.

## Open questions
- What are UIPE's actual "tools"? The pattern is copy-ready, but the tool surface + instructions can't be drafted without knowing UIPE's core workflows.
- Is anything (a directory/registry) actually *reading* these files today, or is Coverage Cat betting ahead of adoption? Worth checking referral logs before over-investing in the long tail of discovery formats.
