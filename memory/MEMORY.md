# Project Memory -- Tower Defense Game
Last Save: 2026-03-14 - 04:23 PM PST

## Current State
AI Opponents feature fully implemented and verified. Port changed 8080→9090 (two games running simultaneously). Canvas scaling now fills screen (removed scale cap). AI builds vertical serpentine mazes with alternating gaps. Three-button menu: Single Player / Play vs AI / Multiplayer. Clean build.

## Uncommitted Work
None (committing everything this save).

## Recent Sessions

### 2026-03-14 PM -- AI Opponents + Port Change + Canvas Scaling
- Port 8080→9090 across all files (server, client, configs, docs)
- Canvas scaling: removed Math.min cap of 1.0 so game fills screen
- AI Opponents feature (full implementation):
  - Types: AIDifficulty enum, aiEnabled/aiDifficulty on GameSettings, isAI on Player
  - AI constants: depth dial, timing, noise parameters
  - Server: AIController brain, economy/placement/maze strategy modules
  - AI names: 40 thematic names with random selection
  - GameRoom integration: virtual client pattern, tick-based action queue
  - WaveSystem: 2 players triggers both-side spawning
  - HUD: shows AI name, save/load handles AI player
- Maze strategy rewritten: vertical walls (not horizontal), alternating top/bottom gaps
  - Forces enemies to traverse full grid height per column of horizontal progress
  - Offensive towers placed in horizontal lines for flying enemy coverage
  - Path-traffic scoring for kill zone placement
- Menu UI redesigned: "Single Player" starts immediately, "Play vs AI" shows difficulty dropdown
- Verified via preview: AI builds proper vertical serpentine maze, takes less damage than undefended player

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

## Next Steps (Priority Order)
1. Playtest AI opponent across multiple waves (verify maze grows over time)
2. Balance AA tower ammo economy (burns through 40 rounds in 9 seconds)
3. Tune AI depth parameters (easy too smart? hard too passive?)
4. Consider AI selling/rebuilding underperforming towers
5. Wire up any remaining incomplete items from 12-item batch

## Shared Docs (git-tracked in .claude/docs/)
- `architecture.md` -- Server/client data flow, system pipeline, network protocol
- `decisions.md` -- Key design decisions with rationale (ADR log)
- `economy.md` -- Tower/enemy stats, pricing formulas, wave scaling
- `features.md` -- Feature inventory with status and commit references

## Personal Files (local only)
- `session-log.md` -- Full session history archive
- `current-session.md` -- Live log of current/most recent session
