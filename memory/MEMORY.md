# Project Memory -- Tower Defense Game
Last Save: 2026-03-20 - 11:01 PM PST

## Current State
**Emergent maze builder — greedy hill-climbing on path length. Median wave 16.**
SELL_REFUND_RATIO changed to 1.0 (full refund). Maze strategy unchanged from 3/19. Sandbox tool added for cellular automaton research.

### Key Architecture
- Each tower placement scored by: `pathDelta×15 + coverage×2 + wallAdj×3 + proximity×1`
- Lexicographic sort: delta>0 cells ALWAYS placed before delta=0 (CRITICAL)
- Tower type: WALL (25c) for positive delta, BASIC/specialized for coverage
- AA defense: proactive placement, spread scoring
- Path plateau at 86-88 is the OPTIMAL tradeoff (not a bottleneck — see below)

### Path vs DPS Tradeoff (CRITICAL KNOWLEDGE)
Path length and DPS are zero-sum. Every credit spent extending the path is NOT spent on towers that kill enemies. The 86-path plateau is the correct balance point:
- Path 118 (catalyst) + WALL = wave 8 (no DPS)
- Path 118 (BASIC-first) = wave 14 (less density)
- Path 86 (baseline) = wave 16 (optimal balance)
Breaking the plateau requires finding path extension that DOESN'T sacrifice DPS.

### Sandbox Research: B0+onPath Rule
`client/sandbox.html` — exhaustive sweep of 160 automaton configs.
**Best: B0+onPath = path 128.** Place on path with zero tower neighbors.
Isolation forces spread, each tower independently reroutes.
**Not yet competitive in-game** (wave 8 with 50/50 skeleton/DPS split).
Needs: BASIC towers for skeleton, lower skeleton budget, or integration into greedy scorer.

## Speed Bug Discovery (CRITICAL KNOWLEDGE)
**All wave counts from speed>1 tests before commit 8403ec5 were inflated.**
Always test at speed=4+ with speed fixes in place. Speed=1 is ground truth.

## Test Results (Emergent Maze, 13 tests at speed=4)
| Wave | Count | Cumulative % |
|------|-------|-------------|
| 10   | 1     | 8%          |
| 12   | 1     | 15%         |
| 14   | 1     | 23%         |
| 15   | 3     | 46%         |
| 16   | 5     | 85%         |
| 17   | 2     | 100%        |
Median: 16, Mean: ~15. Baseline (box maze): wave 9-10.

## Next Steps
1. [x] Break path plateau at 86-88 → CONCLUDED: plateau IS optimal tradeoff
2. [ ] Integrate B0+onPath into greedy scorer (use as candidate source, not separate phase)
3. [ ] Try BASIC towers for skeleton placements (blocks + shoots)
4. [ ] Investigate "before path" drop (re-validation issue)
5. [ ] Fix wall thickness issue Jason reported

## Recent Sessions
### 2026-03-20 — Plateau Research + Cellular Automaton Discovery
- Tried 5 approaches to break wave-16 plateau: mutation, catalyst, BASIC-first, hybrid, reduced AA
- None beat baseline. Path vs DPS is zero-sum tradeoff.
- Changed SELL_REFUND_RATIO to 1.0 (Jason's request)
- Built sandbox.html for automaton research
- **Key discovery: B0+onPath = path 128** (isolated on-path placements)
- Local CA rules alone can't build mazes (neighbor count ≠ path effectiveness)
- The +onPath constraint smuggles global BFS info into the local rule
- In-game test: wave 8 (path 89 but insufficient DPS). Not yet integrated well.

### 2026-03-19 Afternoon — Emergent Maze Builder (All Day Session)
- Jason's insight: "take a page from evolution" — emergent complexity from simple rules
- Complete rewrite of maze.ts (854→~450 lines)
- Best: wave 17, median: wave 16 (was 9-10)
- Key findings: lexicographic sort critical, path plateau at 86-88 is fundamental

### Previous sessions: see session-log.md

## User Preferences
Jason, PST, fair difficulty, no cheats, spend everything
**Key feedback:**
- Emergent complexity > predefined geometry (LLM spatial reasoning limitation)
- "Take a page from evolution" — simple rules producing complex behavior
- Per-tower marginal decisions > macro budget planning
- Minimize reliance on spatial reasoning
- Wants sandbox/visual tools for researching algorithms before applying to game
- Always start local server on session boot, output URL

## Memory Index
- [feedback_start_server.md](~/.claude/.../feedback_start_server.md) — Start local server on boot

## Docs & Files
.claude/docs/: architecture, decisions, economy, features, dead-ends, knowledge-taxonomy
memory/: MEMORY, current-session, session-log, maze-strategy-history
client/sandbox.html: cellular automaton research tool
