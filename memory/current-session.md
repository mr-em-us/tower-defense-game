# Session: 2026-03-14 Late Night

- 11:12 PM — Session resumed. Uncommitted changes present in working tree. Ready to continue AI iteration work.
- 11:48 PM — Jason asked to describe the AI maze problem. Reviewed maze strategy code together.
- 11:50 PM — Jason shared screenshot of what a GOOD maze looks like (human-built). Key observations:
  - Compact serpentine maze near the goal edge, NOT spanning full grid height
  - Horizontal AA "tail" extending outward along flight path
  - Tight switchbacks, dense structure, every tower serves a purpose
- 11:51 PM — Jason clarified: don't copy the exact layout, understand the PRINCIPLES:
  1. Don't waste money building at grid edges (rows 0-5, 25-29) where enemies never go
  2. Actually force enemies through a real maze (tight switchbacks, long path)
  3. Don't get destroyed by flying enemies (deliberate AA corridor)
- 11:52 PM — Diagnosed current code problems:
  - colSpacing=10 is way too wide (barely a maze)
  - Columns span full grid height (rows 0-29) — wasteful
  - AA placement is scattered, not a deliberate corridor
  - Need to measure success by PATH LENGTH increase, not tower count
- 11:52 PM — Save triggered. Maze rewrite is next priority.
