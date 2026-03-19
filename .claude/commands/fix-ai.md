---
description: "Improve AI performance. MANDATORY pre-checks prevent repeating failed approaches. Post-action logging ensures learnings persist."
---

# AI Improvement Skill

## Step 0: MANDATORY — Read history first
Run `/maze-history` mentally or read these files:
1. `memory/maze-strategy-history.md` — complete iteration history
2. `.claude/docs/dead-ends.md` — failed approaches
3. `memory/MEMORY.md` — current state and baseline

**If your proposed change matches ANY entry in dead-ends or failed iterations, STOP and tell the user.**

## Step 1: Identify what to change
Categories of AI improvement (from safest to riskiest):

**SAFE — Economy/spending only (don't touch maze geometry):**
- Upgrade ratios and timing
- AA placement count and positioning
- Budget allocation between build/upgrade
- Tower type selection ratios

**MODERATE — Maze parameters (don't change spatial logic):**
- numWalls growth rate cap
- Box width
- Chain trigger thresholds
- Offense fill radius

**DANGEROUS — Maze geometry (high failure rate for LLMs):**
- Switchback gap positions
- Seal wall placement
- Corridor clearing logic
- Box coordinate calculations

For DANGEROUS changes: use `/spatial-check` first, then `/dump-grid` after to verify.

## Step 2: Make ONE change at a time
Never combine multiple changes. Make one change, test, record result. Then make the next change.

## Step 3: Test
Run `/ai-test` or let the user test visually. Record:
- Wave reached
- Path length progression (from logs)
- Tower composition (from logs)
- What killed the AI (leaked enemies type)

## Step 4: Post-action learning
After testing, do ALL of these:
1. **Log the experiment** in `memory/current-session.md`:
   ```
   - HH:MM — [change description] → wave N (was M). [brief analysis]
   ```
2. **If it failed:** Append to `memory/maze-strategy-history.md` as a new iteration with what/why/lesson.
3. **If it succeeded:** Update `memory/MEMORY.md` current state with new baseline.
4. **If a new pattern was discovered:** Append to this skill's "AI Optimization Patterns" section below.
5. **Update `.claude/docs/economy.md`** if any numbers changed.

### AI Optimization Patterns
*(This section is a living document — append new patterns as they're discovered)*

1. **Path length is the #1 multiplier.** Every extra cell of path multiplies ALL existing tower DPS. A 50% longer path is worth more than 50% more towers.

2. **WALLs for structure, BASIC for kill zones.** WALL (25c, 0 DPS) for cells enemies never walk past. BASIC (50c, 20 DPS) for internal walls adjacent to corridors. Hybrid approach is budget-optimal.

3. **Don't over-maze at the expense of firepower.** A beautiful 200-cell maze with no DPS loses. Upgrades on well-positioned towers outperform new structure in late game.

4. **AA must be proactive, not reactive.** Waiting for airWaveCountdown warnings means AA is placed too late. Build AA line at rows 12-16 from wave 2.

5. **One concentrated kill zone > spread-out towers.** Switchback mazes naturally create kill zones where enemies pass the same towers 4+ times.

6. **Speed=4 is the honest test speed.** All results must be at speed=4 with speed fixes in place. Speed=1 is ground truth but slow.

7. **The maze from 541149c is the proven baseline.** Don't redesign maze geometry — only tune economy and tower selection.
