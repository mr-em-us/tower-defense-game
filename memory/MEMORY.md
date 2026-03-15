# Project Memory -- Tower Defense Game
Last Save: 2026-03-15 - 02:46 PM PST

## Current State
AI maze strategy still needs fundamental rewrite. Ran 11 experiments this session with various approaches (greedy, full-height columns, capped serpentine, WALL-heavy, offense-heavy). Best result: wave 7 survival with 2 full-height columns (1 offense + 1 WALL). But Jason's feedback is clear: this approach is **still fundamentally wrong**. The AI must build a COMPACT RECTANGULAR MAZE with horizontal switchback lanes, not tall skinny columns.

Code in `server/ai/strategies/maze.ts` currently has the column-based approach. Needs full rewrite to compact box maze.

## *** NEXT SESSION: Compact Box Maze (THE correct approach) ***

### What Jason's Maze Looks Like (from screenshot comparison)
- **Compact rectangular box** ~12 cols wide × 10-14 rows tall, centered on spawn
- **Horizontal internal walls** running east-west, with 1-cell gaps at alternating ends
- **Enemies snake through lanes** — forced up and down through 4-6 tight corridors
- **ALL offense towers** — every tower deals damage, no wasted WALLs
- **~40-50 BASIC towers** at 50c each = 2000-2500c. FITS wave 1 budget (2000c)!
- The box itself prevents bypass — no need for full-height columns

### What the AI Must Do (from Jason's explicit feedback)
1. Build a **box**, not columns. Compact rectangle near spawn.
2. **Horizontal internal walls** with alternating gaps create switchback lanes.
3. **Start with all offense towers** (BASIC). WALLs useful later for:
   - Making larger mazes (cheaper blocking, but balance against DPS need)
   - Protecting valuable upgraded towers ("inner courtyard" pattern)
4. Tight 1-cell corridors. Maximum path per square foot.
5. The structure prevents bypass by being sealed on the perimeter.

### Budget Reality (Jason corrected me)
- Wave 1 budget: 2000c. Jason built his entire maze on turn 1.
- ~40 BASIC towers × 50c = 2000c. It fits perfectly.
- I was wrong to think it couldn't fit — count the towers in the screenshot!

### Key Implementation Notes
- For RIGHT side: box roughly rows 8-22, cols 32-44
- Internal horizontal walls at rows 10, 12, 14, 16, 18, 20 etc.
- Each wall spans most of box width, gap at alternating left/right end
- Enemies enter from spawn side, snake through all lanes, exit toward goal
- Validate with findPath after each placement to ensure path exists
- Band can grow outward in later waves

### Key File
- `server/ai/strategies/maze.ts` — full rewrite needed

## Uncommitted Work
Experiment 11 code (column-based approach) in working tree. Being committed as checkpoint before next rewrite.

## Recent Sessions

### 2026-03-15 PM -- Maze Rewrite Experiments (11 iterations)
- Ran 11 experiments with automated test loop
- Tried: greedy, full-height columns, capped serpentine, WALL-heavy, mixed approaches
- Best: Exp 9 — wave 7 survival, path 82, 0 leaks waves 1-5 (2 full-height columns, mixed offense/WALL)
- Worst: Exp 7 — wave 4, all WALLs, path 87 but 0 DPS = useless
- Jason compared screenshots: AI maze vs human maze. Night and day difference.
- Jason's verdict: approach is STILL fundamentally wrong. Must build compact box maze.
- Key lessons: path without DPS is useless; full-height columns waste 40% of towers at edges; compact box is the only correct geometry

### 2026-03-14 Late Night -- Maze Problem Diagnosis
- Jason reviewed AI maze output, identified fundamental strategy flaws
- Decision: full maze strategy rewrite needed

### 2026-03-14 PM/Night -- AI Maze Iteration (Iter 7→8)
- Best result: wave 15. Air wave was the killer.
- Concluded: incremental tuning won't fix the core layout problem

### 2026-03-14 PM -- AI Opponents + Port Change + Canvas Scaling
- Port 8080→9090, canvas scaling fills screen
- AI Opponents feature (full implementation)
- Menu UI: Single Player / Play vs AI / Watch AI Play

## Known Issues / Tech Debt
- [ ] Leaderboard data only persists locally (data/leaderboard.json)
- [ ] No tests exist
- [ ] Multiplayer room management is basic
- [ ] Full GameState broadcast every tick (no delta compression)
- [ ] format.ts utility created but unused (toLocaleString used directly)
- [ ] Save/resume is singleplayer only (BUILD phase only)
- [ ] SavePanel onLoad callback gets stale if user goes Back then reopens

## User Preferences
- Username: Jason
- Timezone: PST (America/Los_Angeles)
- Prefers thorough testing via preview server after changes
- Values game balance -- wants difficulty to feel fair, not punishing
- Likes parallel agent workflows for large features
- Prefers memos/output displayed as text in chat, not just saved to files
- AI difficulty should be based on decision quality, NOT cheats (same resources/info)

## Shared Docs (git-tracked in .claude/docs/)
- `architecture.md` -- Server/client data flow, system pipeline, network protocol
- `decisions.md` -- Key design decisions with rationale (ADR log)
- `economy.md` -- Tower/enemy stats, pricing formulas, wave scaling
- `features.md` -- Feature inventory with status and commit references

## Personal Files (local only)
- `session-log.md` -- Full session history archive
- `current-session.md` -- Live log of current/most recent session
- `maze-experiments.md` -- Detailed experiment log for AI maze iterations
