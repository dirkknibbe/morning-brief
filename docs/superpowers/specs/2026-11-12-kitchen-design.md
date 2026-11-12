# Kitchen — Design

**Date:** 2026-11-12
**Status:** Draft, awaiting Dirk's approval
**Builds on:** `docs/superpowers/specs/2026-05-31-factory-loop-design.md` (the factory). The kitchen is the factory plus three new stations: deploy, trailer, and score. It is not a new system.

---

## Intent

The factory today ends at a private repo and a handoff checklist. That is not something Dirk can be sold on. The kitchen ends at a **course** Dirk can open and start using:

1. a **live Vercel deployment** (private, behind Vercel login),
2. a **demo trailer** showing the core workflow running end to end on real data, wrapped in Blender-animated polish,
3. a **score**, so courses can be compared and the kitchen's taste can be tracked over time,
4. a **1-2-3 go button** to promote a course Dirk likes into something he uses.

The bar (Dirk): *the core workflow working end to end on real data.* If the kitchen cannot record that, the course is not done.

## Goals

- One course per day, cooked autonomously from the top of the triage queue (Dirk). Part of the experiment is **whether the ideas queue can keep up**.
- Data mix of roughly 80% our own data (morning-brief's MongoDB: briefs, ideas, signals; Dirk's repos) and 20% public, no-login data (Dirk).
- Courses that use our data stay private: Vercel Deployment Protection on, trailer not shared (Dirk).
- House style: **bright solar-punk, retro-gamer** (saturated greens and golds, pixel accents, chunky type, CRT glow). Applies to trailer animations and as the default prototype UI look (Dirk).
- GitHub Actions per course repo verify end to end and run repeated design passes to improve taste (Dirk).
- Deploys go through the **Vercel plugin**. Actions authenticate through the **Claude GitHub app** (Dirk).

## Non-goals (v1)

- Public launches or marketing. Everything is private by default.
- Concurrent courses. The existing single-build lock stays.
- Courses that need paid APIs or Dirk's logins to *implement*. These route to `needs_human` as today.
- A per-course custom Blender animation. One reusable template, re-themed per course.

## Anti-goals

Open. Dirk deferred this question ("we'll see"). The first month of runs and keep/toss data should answer it. *Builder's guess:* a month of courses that look good but don't do the core workflow on real data would be the failure, which is why the end-to-end gate blocks serving.

---

## The daily course

```
06:30 brief → synthesize → triage (already queues ONE winner/day)
                                   │
                                   ▼
                kitchen (daily, after triage; launchd or loop-triggers.sh)
  ├─ no queued idea above bar → Discord: "no course today, queue empty" (logged as a skip)
  └─ factory build loop (existing: lock, scaffold private repo, plan, TDD rounds)
       + station: WEB SHELL     prototype is a web app (Next.js on Vercel), solar-punk UI
       + station: DEPLOY        Vercel plugin → protected preview deployment
       + station: VERIFY        Actions: Playwright drives the core workflow on the preview
       + station: DESIGN PASS   Actions: screenshot → score vs style → fix; ≤3 passes or until no gain
       + station: TRAILER       local: Playwright records workflow → Blender intro/outro → ffmpeg
       + station: SCORE         write course_scores doc
       → serve to Discord: private URL + trailer + score + [1-2-3 go] buttons
```

**Skip rule:** the kitchen never lowers the triage bar to fill a day. Skips are counted. They measure whether the queue keeps up.

## Stations

| Station | Where it runs | Done when |
|---|---|---|
| Web shell | local (factory loop) | prototype builds as a Vercel-deployable web app |
| Deploy | local, via Vercel plugin | protected preview URL exists |
| Verify (E2E) | GitHub Actions on the course repo | Playwright completes the core workflow against the preview using real data |
| Design pass | GitHub Actions | style score stops improving, or 3 passes |
| Trailer | local Mac (Blender + ffmpeg) | `demo/trailer.mp4` committed, 30–90 s |
| Score | local | `course_scores` doc written |

The trailer only renders after Verify passes. A failed Verify means no trailer and no serve. The course is parked with its learnings, as the factory does today.

**Trailer shape (builder's call):** animated title card (Blender) → real screen recording of the core workflow → animated end card with the course name and URL. One Blender template file driven by a Python script that takes name, palette and tagline.

## Score (eval per course)

Each course gets a `course_scores` doc. Dimensions and weights are the builder's call. Revisit after 2 weeks of data.

| Dimension | Source | Scale |
|---|---|---|
| `works` | Verify result: core workflow end to end on real data | pass/fail gate (fail = not served) |
| `real_data` | share of the workflow's data that is ours vs public vs mocked; any mock = 0 | 0–5 |
| `style` | design-pass judge vs solar-punk/retro-gamer rubric (final pass) | 0–5 |
| `style_gain` | style score after passes minus before | delta |
| `polish` | trailer rendered, length in range, no broken frames | 0–5 |
| `dirk` | Dirk's keep/toss/go | toss=0, keep=1, go=2 |

The `dirk` field is the ground truth. The other dimensions are only useful if they predict it. A weekly digest line in Discord compares them: "courses this week, avg score, keeps, gos, skips".

## 1-2-3 go button

*Builder's interpretation, confirm with Dirk:* three Discord buttons on each served course:

1. **Taste.** Opens the private URL and trailer (no state change).
2. **Keep.** Marks the course as kept. It stays deployed, `dirk=1`.
3. **Go.** Promotes to a production Vercel deployment, still protected. Adds the repo to a `pantry` list Dirk actually uses, `dirk=2`.

No button within 7 days = toss (`dirk=0`), and the preview is left to expire.

---

## Changes to the existing system

| Area | Change |
|---|---|
| `triggers/factory.md` | add web-shell, deploy, trailer, score stations after DONE-PARTIAL |
| deny-list | today blocks `vercel*`. Deploy goes through the Vercel plugin (MCP), not the CLI, so the deny-list stays as is |
| `project-template` scaffold | course repos also get the Verify + Design-pass workflows (`.github/workflows/`) |
| caps | 30 min / 20 rounds is too tight for a full course. *Builder's call:* 90 min wall clock for the whole course, rounds cap unchanged |
| new collection | `course_scores` (one doc per course, keyed by `idea_slug`) |
| scheduling | daily kitchen job after triage, via a launchd template or `loop-triggers.sh` (both conventions exist) |
| Discord listener | serve message with buttons, button handlers, weekly digest |
| new assets | `kitchen/blender/trailer-template.blend` + `render.py`, solar-punk style rubric (`kitchen/style.md`) |

## Budget (builder's call, Dirk did not veto)

Runs on Dirk's Claude **Max plan**: the kitchen locally via `claude`, Actions via the Claude GitHub app token. No per-token API spend. The hard limit is GitHub's free private-repo Actions minutes (~2,000/month). That is why Blender renders locally and Actions only verify and run design passes.

## Setup Dirk must do once

- `/mcp` → authorize the Vercel plugin.
- `/install-github-app` per course repo, or once at the account level if the app can be installed for all repos.
- Install Blender locally (`brew install --cask blender`) and ffmpeg.

## Open questions

1. Anti-goals: what would make this a failure after a month? (deferred by Dirk)
2. Is the 1-2-3 go button read correctly (Taste / Keep / Go)?
3. Is "web app" the right default prototype shape? Some triage winners are skills or CLIs. *Builder's call for v1:* wrap them in a small web front end so they can deploy and be recorded.
