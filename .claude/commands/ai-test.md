---
description: "Run a headless AI test at speed=4 and report the honest result. Reads the actual output file — no fabrication."
---

# AI Test Skill

Run a headless AI test and report the verified result.

## Step 1: Ensure server is running
Check if preview server is running. Start one if not.

## Step 2: Run the test
```bash
curl -s "http://localhost:9090/api/ai-test?speed=4&timeout=600000"
```
Run this in background with `run_in_background: true`. The test takes 1-10 minutes depending on how far the AI gets.

## Step 3: Wait for completion
Use `TaskOutput` to wait for the result. Do NOT guess or fabricate — wait for the actual output.

## Step 4: Read and report
The output is JSON: `{"waveReached": N, "aiName": "...", "aiHealth": N, "humanHealth": N}`

Report:
- Wave reached (this is when the AI DIED, health=0)
- If aiHealth > 0, the test timed out — AI was still alive
- Compare to known baselines:
  - Pre-speed-fix at speed=10: wave 40 (INFLATED, do not compare)
  - Post-speed-fix baseline: wave 6-7
  - 541149c restored: TBD
  - Current code: TBD

## Step 5: Check server logs for details
```
preview_logs with search="leaked" to see which enemies got through
preview_logs with search="[MAZE] Wave" to see maze growth progression
preview_logs with search="AA:" to see AA placement
```

## Step 6: Post-action learning
After the test completes:
1. **Log result** in `memory/current-session.md` with timestamp, wave reached, and what code was running.
2. **Update baseline** in `memory/MEMORY.md` if this is a new high or low watermark.
3. **If wave count dropped:** Check what changed since last test. Log in `.claude/docs/dead-ends.md` if an approach failed.
4. **If wave count improved:** Note what change caused it in `memory/maze-strategy-history.md`.

### Known Baselines
*(This section is a living document — update when new verified baselines are established)*

| Code Version | Speed | Wave | Date | Notes |
|---|---|---|---|---|
| b24e146 (pre-speed-fix) | speed=10 | 40 | 2026-03-18 | INFLATED by speed bugs |
| b24e146 + speed fixes | speed=4 | 6-7 | 2026-03-19 | Honest baseline |
| 541149c + speed fixes | speed=4 | 10 | 2026-03-19 | Jason's preferred (box maze) |
| cf0e326 (budget fixes) | speed=4 | 9-10 | 2026-03-19 | Box maze + budget fixes |
| Emergent maze v7-final | speed=4 | 15-17 (median 16) | 2026-03-19 | Current code, 13 tests |

## CRITICAL RULES
- NEVER claim a wave count without reading the actual output
- NEVER round up or embellish results
- If the test is still running, say so — don't guess
- Always note the speed setting used
- Compare honestly to previous results
