# Session: 2026-03-19 Early AM

## Key Events
- 12:00 AM — Session start. Reviewed full AI history with Jason.
- 12:05 AM — Discovered speed bug impact: ALL wave counts at speed>1 before 8403ec5 were inflated.
- 12:10 AM — Explained speed bugs to Jason. Strategy changes tangled with speed fixes = no clean baseline.
- 12:15 AM — Jason confirmed AI he saw in browser was real (speed=1 bugs don't matter).
- 12:20 AM — Attempted unified ROI scorer. Result: wave 6-7. WORSE. All-BASIC too expensive.
- 12:25 AM — Jason identified LLM spatial reasoning limitation. Agreed.
- 12:30 AM — Restored 541149c as baseline. This is the code Jason saw working well.
- 12:35 AM — Jason requested 5x AA, horizontal line along flight path.
- 12:40 AM — Rewrote placeAADefense(). First try: only 1 AA/wave (budget eaten by maze). Fixed reserve.
- 12:45 AM — Jason reported walls 2 rows thick, should be 1. Not yet fixed.
- 12:50 AM — Raised growth cap to +4/wave, min 6.
- 12:26 AM — First save (AI restore + AA changes).
- 12:30 AM — Created 9 skills: dump-grid, ai-test, watch-ai, maze-history, spatial-check, compare-versions, fix-bug, fix-ai, learn.
- 12:35 AM — Added /api/grid-dump server endpoint for ASCII maze visualization.
- 12:40 AM — Implemented self-maintaining knowledge architecture: taxonomy, dead-ends, living skills with post-action learning, /learn meta-skill.
- 12:45 AM — Updated CLAUDE.md: save protocol now includes /learn, knowledge architecture documented.
- 12:48 AM — Final save.

## Decisions
1. Restore 541149c — don't redesign maze geometry
2. LLM should not attempt spatial reasoning for maze design
3. All speed>1 tests before 8403ec5 are unreliable
4. AA needs proactive placement, not reactive
5. Implement self-maintaining knowledge architecture (skills update themselves, dead ends logged, /learn sweeps)
