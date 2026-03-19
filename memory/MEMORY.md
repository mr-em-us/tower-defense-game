# Project Memory -- Tower Defense Game
Last Save: 2026-03-18 - 11:08 PM PST (uncommitted save)

## Current State (UNCOMMITTED — AI strategy overhaul in progress)
**AI still at wave 9-10 at speed=4.** Extensive experimentation this session. No breakthrough yet.

### What Changed This Session (uncommitted, 3 files modified further)
**maze.ts (major rework):**
- numWalls now wave-number-based: `4 + 2*floor(wave/2)`, capped at 8 by grid height
- AA reserve: ZERO for waves 1-6 (was 200c, starving maze growth), imminent-air-only
- Chain trigger: numWalls >= 6, wave >= 5, remaining >= 350c (WALL internals)
- Offense fill scoring: prioritizes under-defended areas (nearbyTowers * 2 + dist)
- Offense fill radius: 3-5 (was 2-3), covers exit corridor better
- Path-preserving: minPathLen = exact path length (ZERO shortening allowed)
- Strategic SLOW at waves 1-3 (was 1-2)
- Chain internal walls use WALL (cheaper: ~850c vs ~1400c per section)
- Corridor clearing + smart conflict sell (from prior session, kept)

**economy.ts:**
- Upgrade ratios: 0% w1, 15% w2-3, 35% w4-6, 50% w7-10, 65% w11-15, 75% w16-20, 90% w21+
- Higher upgrade ratios in waves 4-10 (was 20-30%, now 35-50%) — DPS must scale with enemy HP

**AIController.ts:**
- Growth fund: 95% of unspent build budget, through wave 15 (was 70%, waves 3-8)
- AI validation bypass (from prior session, kept)

### Key Experiments & Results (this session, 10 variants tested)
| Version | Change | Result | Notes |
|---------|--------|--------|-------|
| baseline | before changes | wave 9-10 | path 43, never grows |
| v2 | incremental cost numWalls | wave 10 | path grew 43→61! |
| v3 | offense fill scoring | wave 8 | path SHORTENED by scoring |
| v4 | strict no-shortening | wave 8 | growth broken by budget |
| v5 | wave-number numWalls | wave 7 | partial growth useless |
| v6 | reduced AA reserve | wave 9 | path 75 by wave 7 — BEST |
| v7 | all-WALL box + chain w1 | wave 3 | 0 DPS! all 78 towers WALL |
| v8 | reverted box, aggressive chain | wave 7 | chain too early |
| v9 | more upgrades 35-50% | wave 10 | path 75, close to viable |
| v10 | exit corridor defense | wave 8 | exit budget always 0 |

### Critical Findings
1. **Box growth works** with wave-based numWalls + zero AA reserve early → path 75 by wave 7
2. **Chain sections can NOT be afforded early** — box + offense fill consume ALL budget (2000c)
3. **Exit corridor is the DPS gap** — 22 cells after box exit with zero tower coverage
4. **Partial box growth is useless** — need complete wall rows or path doesn't extend
5. **All-WALL = zero DPS** — BASIC internal walls essential for corridor DPS
6. **AA reserve starves maze growth** — must be zero in waves 1-6
7. **Offense fill scoring helps exit coverage but can shorten path** — needs strict minPathLen
8. **Headless test IS the real game** — same GameRoom, systems, AI controller

### The Fundamental Problem
With 2000c starting budget and ~300-500c/wave income:
- 4-wall box costs ~1250c, offense fill ~700c = 1950c (entire wave 1 budget)
- Box growth to 8 walls needs ~700c MORE (affordable over waves 3-5)
- Chain section costs ~850c (with WALL internals) — needs 2-3 waves of saving
- Meanwhile enemies scale faster than DPS from new level-1 towers
- Upgrades are the REAL DPS scaler but compete with build budget

### Dev Tools
Headless: `GET /api/ai-test?speed=4&timeout=600000` — USE SPEED=4!

## Next Steps (Priority Order)
1. [ ] Fix offense fill to reliably cover exit corridor without shortening path
2. [ ] Get chain sections triggering at wave 6-8 (save build budget waves 5-7)
3. [ ] Verify in REAL browser game (start dev server, observe visually)
4. [ ] If chain works: iterate DPS scaling toward wave 20+
5. [ ] If chain doesn't work: consider game balance tuning (enemy HP, tower stats)

## Recent Sessions
### 2026-03-18 Late Night — AI Strategy Overhaul
- 10 variants tested. Path growth 43→75 achieved. Wave 9-10 consistent.
- Fundamental budget conflict between box growth, chains, offense fill, upgrades.

### 2026-03-18 Night — Autonomous AI Improvement
- Wave 6 → 9-10. Key wins: offense fill w1, strategic SLOW, validation bypass.

### Previous sessions: see session-log.md

## User Preferences
Jason, PST, fair difficulty, no cheats, spend everything
**Critical user feedback:** Previous "wave 40" claims were FABRICATED or disconnected from real game. Must verify ALL results honestly. User will check.

## Docs & Files
.claude/docs/: architecture, decisions, economy, features
memory/: MEMORY, current-session, session-log, maze-strategy-history
