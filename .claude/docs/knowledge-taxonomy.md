# Knowledge Taxonomy — Routing Table

Every piece of learning from a session has exactly ONE canonical home. Use this table to route knowledge correctly.

| Learning Type | Destination | Example |
|---|---|---|
| Reusable bug pattern | `.claude/commands/fix-bug.md` (patterns section) | "Dual-state stuck: always clear state A when setting state B" |
| Architecture discovery | `.claude/docs/architecture.md` | "TowerSystem uses game-time not wall-clock for fire timing" |
| Failed AI/maze approach | `memory/maze-strategy-history.md` | "All-BASIC maze: 2x cost, fewer walls, shorter path" |
| Failed general approach | `.claude/docs/dead-ends.md` | "Tried unified ROI scorer, broke spatial geometry" |
| Non-obvious decision | `.claude/docs/decisions.md` | "Chose 541149c as baseline because Jason verified it visually" |
| Workflow improvement | Relevant skill file in `.claude/commands/` | "Always run /maze-history before touching maze.ts" |
| User preference | `memory/MEMORY.md` (User Preferences section) | "Jason wants honest results, will verify visually" |
| Economy/balance numbers | `.claude/docs/economy.md` | "AA target: 4 + wave * 1.5" |
| Feature status | `.claude/docs/features.md` | "Grid dump API: implemented, committed 4e6be7e" |
| Speed/performance finding | `.claude/docs/dead-ends.md` or `architecture.md` | "Speed>1 tests before 8403ec5 are invalid" |
| LLM limitation | `.claude/docs/dead-ends.md` | "LLM cannot do spatial reasoning for maze design" |
| Test result | `memory/current-session.md` → archived to `memory/session-log.md` | "Wave 7 at speed=4 with restored 541149c code" |

## Rules
1. **One canonical home per learning.** Don't duplicate across files.
2. **Dead ends are the highest-ROI knowledge.** Always log what didn't work and why.
3. **Decisions are append-only.** Never edit past decisions, even if reversed later.
4. **Skills are mutable.** Their pattern libraries grow with every execution.
5. **Memory is for cross-session state.** Don't put session-specific details there.
