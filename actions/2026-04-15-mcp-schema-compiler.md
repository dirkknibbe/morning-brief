---
date: 2026-04-15
classification: build-plan
action: Prototype an "MCP Schema Compiler" MCP server that introspects a server and returns typed TypeScript modules
source_brief: briefs/2026-04-15.md
---

## TL;DR

LangAlpha's `mcp_servers/` directory isn't doing codegen — it's hand-written FastMCP Python servers with typed decorators. The "codegen" is their PTC (Programmatic Tool Calling) where the LLM writes code in sandboxes to call MCP tools. There's no schema-to-types compilation happening. An MCP Schema Compiler is still a valid weekend project, but the prior art the brief assumed doesn't exist — you'd be starting from scratch. The key building block is `json-schema-to-typescript` (Boris Cherny, v15, 2M+ monthly downloads) which converts JSON Schema → TS interfaces, plus the MCP SDK's `Client.listTools()` which returns JSON Schema `inputSchema` per tool.

## Key findings

- LangAlpha (ginlix-ai/LangAlpha, 640★) has `mcp_servers/` with 8 hand-written FastMCP Python servers for financial data. No `src/mcp` directory exists — the brief's path was wrong. (source: github.com/ginlix-ai/LangAlpha)
- MCP spec `tools/list` returns `inputSchema` (JSON Schema) per tool and optional `outputSchema` (new in 2025-06-18 spec). Most servers don't declare `outputSchema`, so output typing would be limited to `TextContent | ImageContent | AudioContent`. (source: modelcontextprotocol.io/docs/concepts/tools)
- `json-schema-to-typescript` (v15.0.4) is the standard JS library for JSON Schema → TypeScript. Well-maintained, handles $ref, allOf, oneOf. (source: npmjs.org/json-schema-to-typescript)
- No existing "MCP typegen" or "MCP schema compiler" package exists on npm. This is greenfield.
- The MCP TypeScript SDK (12.2k★) has a `Client` class that handles connection and `tools/list` calls. (source: github.com/modelcontextprotocol/typescript-sdk)

## Existing players / prior art

- **json-schema-to-typescript** — JSON Schema → TS interfaces, the core transform — github.com/bcherny/json-schema-to-typescript
- **eslint-typegen** — antfu's tool that generates types from ESLint rule schemas (similar pattern: introspect schema → emit types) — github.com/antfu/eslint-typegen
- **LangAlpha PTC** — LLM writes Python in sandboxes to call MCP tools; not codegen but shows the "programmatic MCP calling" pattern — github.com/ginlix-ai/LangAlpha
- **MCP Inspector** — official Anthropic tool for testing MCP servers, does introspection but doesn't codegen — github.com/modelcontextprotocol/inspector

## Concrete next steps for Dirk

1. **Spike the core pipeline (2-3h):** Write a CLI script (not an MCP server yet) that connects to a local MCP server via stdio, calls `listTools()`, pipes each tool's `inputSchema` through `json-schema-to-typescript`, and emits a `.ts` file with typed function signatures. Test against your own morning-brief MCP or any simple server.

2. **Handle the output typing gap:** Since most servers lack `outputSchema`, generate a union return type `McpToolResult<T>` that wraps `TextContent[]` but allows narrowing when `outputSchema` is present. This is the differentiator — without it, the generated types are just input validators.

3. **Wrap as MCP server (1-2h):** Expose a `compile_schema` tool that takes `{ transport: "stdio" | "sse", command?: string, url?: string }` and returns the generated TypeScript as text content. Security concern: stdio mode means spawning arbitrary commands — either restrict to a whitelist or only support SSE/streamable-http in the server mode.

4. **MCPAASTA angle:** The micropayment angle would be per-compilation charges, but this is a tool people run once per server version. Low-frequency usage makes micropayments awkward — consider whether a free CLI + paid hosted API (compile any public MCP registry server URL) makes more sense.

## Open questions

- Who actually needs typed TS modules for MCP tools? LLMs get schemas via `tools/list` natively. The audience is human developers writing MCP client code — how large is that market?
- Should this target the MCP Registry (registry.modelcontextprotocol.io) as a source, generating types for any registered server without needing to run it?
- Is the MCPAASTA micropayment model viable for a tool that's called once per server version, not per-request?
