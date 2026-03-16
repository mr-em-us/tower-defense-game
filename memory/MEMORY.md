# Project Memory -- Tower Defense Game
Last Save: 2026-03-15 - 09:56 PM PST

## Current State
AI maze strategy REWRITTEN and working well. Compact box maze with horizontal switchback lanes — matches Jason's design. Best result: **wave 13, path 173**. The AI now builds a proper maze like a human player would.

### Architecture (current working code)
- `server/ai/strategies/maze.ts` — compact box maze generator
- Wave 1: builds box (7 wide, 5+ walls) with WALL structural + BASIC offense
- Waves 2+: greedy path extension on BFS path + offense fill
- Funnel column at zone edge prevents bypass
- Economy upgrades start wave 5 (20%), scale to 35% wave 8+

### Key Design Elements
- Horizontal walls with 1-cell gaps (1 inward from edge) at alternating sides
- Solid first/last walls seal the box
- Side walls on corridor rows with entrance/exit openings
- WALL towers (25c) for structure, BASIC (50c) for internal walls (DPS)
- Greedy extension: places towers on BFS path to maximize path increase
- Offense fill: SLOW/SPLASH/SNIPER adjacent to path for extra DPS

## Progress This Session (Compact Box Maze)
- Rewrote maze.ts from scratch with box geometry
- Solved bypass prevention (funnel column, side walls, solid caps)
- Solved gap-vs-sidewall conflict (gaps 1 cell inward from edges)
- Added greedy path extension for mid-game growth (path 43→75)
- Added WALL structural towers (2× more cells per budget) → wave 13!
- Tuned economy upgrade ratios (20% wave 5-7, 35% wave 8-12)

## Experiment Results Summary
- Exp 12-16: Box geometry iterations (bypass fixes, gap positioning)
- Exp 17: First working switchbacks — path +13, wave 4
- Exp 18: Width 7 box — path 43, wave 8-9
- Exp 19-21: + greedy extension — path 70-75, wave 8-9
- Exp 24: + upgrade economy — path 79, wave 10
- **Exp 25: + WALL structural towers — path 173, wave 13!**

## Next Steps (toward wave 20)
- [ ] Fix path drop at wave 11 (enemies destroying towers)
- [ ] Better air defense scaling
- [ ] Maze expansion: add switchback rows as budget allows
- [ ] Tower protection: WALLs around upgraded towers ("courtyard" pattern)
- [ ] Test LEFT side mirror behavior

## Uncommitted Work
- `server/ai/strategies/maze.ts` — compact box maze (fully rewritten)
- `server/ai/strategies/economy.ts` — updated upgrade ratios
- `memory/maze-experiments.md` — experiment log

## Recent Sessions

### 2026-03-15 Evening -- Compact Box Maze Implementation ★★★
- Full rewrite of maze.ts to compact box with horizontal switchbacks
- Iterated through ~15 experiments fixing bypass, gaps, expansion
- Added greedy path extension + offense fill + WALL structural towers
- Progress: wave 4 → wave 13. Path: 30 → 173.
- Jason confirmed the maze shape matches his design

### 2026-03-15 PM -- Column-Based Experiments (11 iterations)
- Tried columns, serpentine, greedy — all fundamentally wrong
- Jason showed screenshot comparison: his compact box vs AI columns
- Decision: must build compact rectangular maze, not columns

### 2026-03-14 Late Night -- Maze Problem Diagnosis
- Jason identified fundamental strategy flaws
- Decision: full maze strategy rewrite needed

## Known Issues / Tech Debt
- [ ] Leaderboard data only persists locally (data/leaderboard.json)
- [ ] No tests exist
- [ ] Multiplayer room management is basic
- [ ] Full GameState broadcast every tick (no delta compression)
- [ ] Save/resume is singleplayer only (BUILD phase only)

## User Preferences
- Username: Jason
- Timezone: PST (America/Los_Angeles)
- Prefers thorough testing via preview server after changes
- Values game balance -- wants difficulty to feel fair, not punishing
- AI difficulty should be based on decision quality, NOT cheats

## Shared Docs (git-tracked in .claude/docs/)
- `architecture.md` -- Server/client data flow, system pipeline, network protocol
- `decisions.md` -- Key design decisions with rationale (ADR log)
- `economy.md` -- Tower/enemy stats, pricing formulas, wave scaling
- `features.md` -- Feature inventory with status and commit references

## Personal Files (local only)
- `session-log.md` -- Full session history archive
- `current-session.md` -- Live log of current/most recent session
- `maze-experiments.md` -- Detailed experiment log for AI maze iterations
