# Session: 2026-03-14

- 10:16 AM — Session resumed. Local and remote in sync. No new commits since last session (March 8).
- 10:30 AM — Port changed from 8080 to 9090 across all files (server, client, configs, docs, CLAUDE.md).
- 10:45 AM — Canvas scaling fix: removed Math.min(..., 1) cap so game grid fills entire screen.
- 11:00 AM — Planned AI Opponents feature with user. Key decisions: offline-only, depth-based difficulty (not cheats), same info as human, visible thinking, random names, leaderboard integration.
- 12:00 PM — Implemented AI foundation types (AIDifficulty enum, GameSettings fields, Player.isAI).
- 12:30 PM — Built AI strategy modules: economy.ts, placement.ts, maze.ts, names.ts.
- 01:00 PM — Built AIController brain with action queue and tick-based delays.
- 01:30 PM — Integrated AI into GameRoom (virtual client pattern, addAIPlayer, tick integration).
- 02:00 PM — Fixed build errors: missing AI fields in difficulty presets, wrong args in chooseTowerType.
- 02:15 PM — Updated WaveSystem for 2-player spawning, HUD for AI name display, save/load for AI.
- 02:30 PM — Added menu UI with AI toggle. User called it "dumb UI". Redesigned to three separate buttons.
- 03:00 PM — Context compaction. Resumed and continued.
- 04:00 PM — Rewrote maze strategy: horizontal walls → vertical walls with alternating top/bottom gaps. Forces enemies to traverse full grid height per column of progress. Added horizontal offensive tower lines for flying enemy coverage.
- 04:15 PM — Verified via preview: AI builds proper vertical serpentine, takes less damage than undefended player.
- 04:23 PM — Save triggered. Clean build. Committing all changes.
