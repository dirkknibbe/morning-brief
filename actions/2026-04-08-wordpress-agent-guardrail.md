---
date: 2026-04-08
classification: build-plan
action: Ship a 1-pager landing page for "WordPress Agent Guardrail" — MCP proxy positioning, ahead of WP 7.0 launch
source_brief: briefs/2026-04-08.md
---

## TL;DR

**Don't ship this landing page as specified.** Respira (respira.press) already occupies the WordPress-AI-safety slot with a shipped product: `npx @respira/wordpress-mcp-server`, 12 page builders, diff preview, one-click rollback, Maker/Builder/Studio pricing. They were the *author* of the WP 7.0 article that seeded this idea — the "opportunity" is a marketing funnel for their own launch. Competing head-on as a generic "WP Agent Guardrail" landing page walks straight into a founder who's already 6 months ahead on content, integrations, and copy. The *developer gateway* angle is differentiated but needs a sharper wedge than "MCP proxy." Recommend: skip the landing page, spend the 3-hour budget on a narrower probe instead.

## Key findings

- **Respira is shipped, not vapor.** Live telemetry counter on homepage, 14-day refund, tiered pricing, covers Elementor/Divi/Bricks/Oxygen/Beaver/Breakdance/WPBakery/Visual Composer/Brizy/Thrive/Flatsome/Gutenberg. Source: respira.press.
- **Respira ships an MCP server, not just a plugin.** `npx @respira/wordpress-mcp-server --setup` — they already occupy the "developer gateway" framing. The WP 7.0 Medium piece was their launch post. Source: respira-wp-ai.
- **Arbitus is generic, not WP-specific.** 6 GitHub stars, Rust, config-file driven (`gateway.yml`), policies/auth/rate-limit/HITL/audit — but nothing WP-aware. Good reference implementation, not a competitor. Source: github.com/arbitusgateway/arbitus.
- **MCP gateway/aggregator category is crowded.** awesome-mcp-servers lists 1mcp/agent, Aganium, AgentHotspot, APIFold, and others in the aggregator/gateway slot. "Gateway for MCP" without a vertical is a red ocean. Source: awesome-mcp.
- **The real gap isn't a WP landing page — it's distribution.** Respira's moat is the 12 builder integrations + WordPress.org plugin directory. A solo dev can't match integration breadth in 3 hours.

## Existing players / prior art

- **Respira** — shipped WordPress AI infra layer with MCP server + 12 builder integrations + rollback + diff preview — respira.press
- **Arbitus** — generic MCP security proxy (Rust, MIT, 6 stars) — github.com/arbitusgateway/arbitus
- **1mcp/agent** — MCP aggregator/gateway — github.com/1mcp-app/agent
- **Aganium** — DNS-like identity + discovery bridge for MCP — github.com/Aganium/agenium

## Concrete next steps for Dirk

1. **Kill the WP guardrail landing page.** It's a pivot into a market with a first-mover already sitting on the launch-day content wave.
2. **Spend 60 minutes auditing Respira.** Sign up for their 7-day Maker trial, install on a throwaway site, see where the diff/rollback UX actually breaks. The gap between "marketing site" and "working product" is often wide — that's where a wedge lives.
3. **If you still want the MCP gateway thesis**, point it at a different vertical *where no Respira exists yet*: Shopify (MCP + Liquid), Notion (MCP + databases), Webflow (MCP + CMS collections). Same playbook, open field.
4. **Alternative wedge for the 3 hours:** build a *diff quality tool* — take any MCP tool call, preview the effect, show it in plain English before execution. Generic, works across all MCP servers, directly addresses the trust gap Respira's own marketing frames as the #1 issue. This is infrastructure, not a WP feature.

## Open questions

- Is Respira profitable or still in founder-funded runway? (Couldn't verify from public site.)
- Does the WP 7.0 MCP Adapter ship with its own safety/audit hooks in core, or is it purely the protocol? If core handles snapshots, the guardrail category thins out further.
- Is there a Shopify-equivalent of the WP 7.0 MCP Adapter announcement on the horizon? If yes, that's the next wave to front-run.
