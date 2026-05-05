---
date: 2026-05-05
classification: research
action: Open sandroandric/AgentHandover, find the screen→action seam UIPE replaces, and sketch a 1-pager on the framing split — AgentHandover learns *what you did*, UIPE tells it *what's there to do*.
source_brief: briefs/2026-05-05.md
---

## TL;DR

AgentHandover's "infer action from screen" is **not** pixel→action ML — it's a polling loop (`observer/event_loop.rs`, 500ms tick) that pulls an `ObservationSnapshot` from the macOS app over a Unix socket, dedups screenshots with dHash, and ships them off to an async VLM annotator. The actual *behavioral inference* lives **downstream** in a worker that turns accumulated snapshots into a Skill. That offline VLM-annotation step is exactly what UIPE replaces — and the framing reads cleanly: AH captures *demonstration*, UIPE provides *runtime UI semantics*. They're complements, not competitors. A 1-pager pitching them together (AH = strategy, UIPE = scene) is the cleanest narrative; pitching UIPE as a "better AH" would be wrong.

## Key findings

- **The seam is named `observation`, not `action`.** `crates/daemon/src/observation.rs` defines `ObservationSnapshot { accessibility_granted, focused_window, display_topology, cursor_global_px, secure_field_focused }`. It's pulled via JSON over `~/Library/Application Support/agenthandover/observation.sock`, served by the AgentHandoverApp (which holds the TCC grants). (source: `crates/daemon/src/observation.rs`)
- **The "inference" is mostly bookkeeping.** `observer/event_loop.rs` does dwell tracking, app-switch detection, and rate-limited screenshot capture with dHash dedup (threshold=10). No action inference here — it just *records*. (source: `crates/daemon/src/observer/event_loop.rs`)
- **Real behavioral analysis is async + VLM-driven.** `screenshots_dir` is labeled "VLM annotation pipeline" in the config, and the README says "passive discovery … runs behavioral analysis to extract the strategy" — that's a worker reading accumulated snapshots later. The seam UIPE plugs into is *between* "raw capture" and "Skill". (source: README + ObserverConfig fields)
- **Skills are Claude-Code-format markdown with extra fields.** Strategy + Steps + Selection Criteria + Guardrails + Voice + confidence. So the Skill is a procedure spec — but it has no live UI grounding at execution time. The executing agent (Claude Code, Codex) re-perceives the UI itself. (source: README "What a Skill Looks Like")
- **That gap is the UIPE-shaped hole.** AH gives an agent the *recipe*; nothing in AH gives the agent a structured live scene at replay. UIPE's `get_scene` / `get_affordances` / `detect_elements` / `act` are precisely that runtime perception layer. (source: ui-perception-engine MCP surface in current session)

## Existing players / prior art

- **AgentHandover** — macOS-only, Rust daemon + Swift app + VLM annotation, captures *user demos* into Skills — github.com/sandroandric/AgentHandover (720⭐)
- **OpenAdapt / OpenInterface** — earlier "record demonstrations, replay" attempts; pixel-driven, brittle on layout shifts
- **Claude Code Skills (native)** — hand-written markdown skills, no live UI grounding either
- **UIPE (your project)** — runtime UI scene + affordance graph, MCP-exposed (`act`, `get_affordances`, `analyze_visual`)

## Concrete next steps for Dirk

1. **Write the 1-pager today** with this thesis: *AgentHandover answers "how do I do this task?" UIPE answers "what can I do on this screen right now?" Together: agent has Skill + live scene = robust replay.* Don't position as competitive.
2. **Identify one Skill-replay failure mode AH alone can't fix** (e.g. UI moved, element renamed, modal popped). Demo UIPE handling it. That's the wedge.
3. **Sketch the integration shape**: an AH Skill's `report_step_result` callback could query UIPE for the current scene, decide whether the expected element is reachable, and either proceed or escalate. Two-paragraph design doc, no code yet.
4. **Reach out to Sandro Andric only after the 1-pager exists** — cold pitches without a clear "I'm not building your competitor" framing risk getting ignored.

## Open questions

- Is AH's VLM annotation step open-source-runnable, or does it require a hosted model? (couldn't find from README alone; would change the integration story.)
- Does AH's MCP server expose live observation state to executing agents, or only post-hoc Skills? If the former, there's surface overlap with UIPE that needs reframing.
- macOS-only vs UIPE's reach — does UIPE target browser/web, native, or both? Determines whether the pitch is "macOS desktop agents" or broader.
