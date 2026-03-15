# Project Memory -- Tower Defense Game
Last Save: 2026-03-14 - 11:00 PM PST

## Current State
AI maze strategy iteration in progress. Iteration 8 implemented with air defense corridor, wider search radius, and economy improvements. Ground defense is solved (0 leaks waves 7-14 consistently). Air waves are the remaining killer — placeAirDefense function now implemented and ready for testing. Clean build.

## Uncommitted Work
None (committing everything this save).

## Recent Sessions

### 2026-03-14 PM/Night -- AI Maze Iteration (Iter 7→8)
- Ran iteration 7: died wave 15 (best result). Ground defense perfect waves 9-14. Air wave killed from 396→0HP.
- Identified root cause: air waves bypass maze, AA towers placed on maze path can't reach flight corridor
- Implemented iteration 8 changes:
  - Lowered wall column threshold (1000→500c reserve for 2nd+ columns)
  - Expanded search radius 3→5 cells (prevents grid saturation)
  - More aggressive AA in chooseTowerType (deterministic, not random)
  - Higher upgrade ratio when 150+ towers (grid saturated)
- Ran iteration 8: died wave 13 (worse — wave 6 leaked 7 ground enemies)
- Added dedicated placeAirDefense function: places AA towers along actual flight path (rows 8-22), not maze corridor
- Flight corridor scoring: samples 6 flight lines from spawn to goal rows, rewards spread from existing AA
- Ready for iteration 9 testing next session

### 2026-03-14 PM -- AI Opponents + Port Change + Canvas Scaling
- Port 8080→9090, canvas scaling fills screen
- AI Opponents feature (full implementation)
- Maze strategy: vertical walls, alternating gaps, path-traffic scoring
- Menu UI: Single Player / Play vs AI / Watch AI Play

## Known Issues / Tech Debt
- [ ] Leaderboard data only persists locally (data/leaderboard.json)
- [ ] No tests exist
- [ ] Multiplayer room management is basic
- [ ] Full GameState broadcast every tick (no delta compression)
- [ ] format.ts utility created but unused (toLocaleString used directly)
- [ ] Save/resume is singleplayer only (BUILD phase only)
- [ ] SavePanel onLoad callback gets stale if user goes Back then reopens
- [ ] Air defense needs testing (placeAirDefense just implemented)

## User Preferences
- Username: Jason
- Timezone: PST (America/Los_Angeles)
- Prefers thorough testing via preview server after changes
- Values game balance -- wants difficulty to feel fair, not punishing
- Likes parallel agent workflows for large features
- Prefers memos/output displayed as text in chat, not just saved to files
- AI difficulty should be based on decision quality, NOT cheats (same resources/info)

## Next Steps (Priority Order)
1. Test iteration 9 (air defense corridor) — run observer mode and verify wave 20+
2. If air defense works, tune budget split (currently 40% cap for air)
3. If ground still leaks wave 6, investigate — may need more offense towers early
4. Balance AA tower ammo economy (burns through 40 rounds in 9 seconds)
5. Consider 3rd+ wall columns for ultra-late game path extension

## Shared Docs (git-tracked in .claude/docs/)
- `architecture.md` -- Server/client data flow, system pipeline, network protocol
- `decisions.md` -- Key design decisions with rationale (ADR log)
- `economy.md` -- Tower/enemy stats, pricing formulas, wave scaling
- `features.md` -- Feature inventory with status and commit references

## Personal Files (local only)
- `session-log.md` -- Full session history archive
- `current-session.md` -- Live log of current/most recent session
