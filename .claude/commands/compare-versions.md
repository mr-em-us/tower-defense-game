---
description: "Compare two git commits' AI performance by checking out each version, running a headless test, and reporting honest results side by side."
---

# Version Comparison Skill

Compare AI performance between two commits or branches.

## Arguments
The user provides two references (commit hashes, branch names, or "current"):
- $ARGUMENTS should be parsed as: `<version-a> <version-b>`
- Example: `/compare-versions 541149c current`
- Example: `/compare-versions b24e146 HEAD`

## Step 1: Record current state
```bash
git stash  # if there are uncommitted changes
git rev-parse HEAD  # record current position
```

## Step 2: Test version A
```bash
git checkout <version-a> -- server/ai/AIController.ts server/ai/strategies/economy.ts server/ai/strategies/maze.ts
npm run build
```
Restart the preview server, then run:
```bash
curl -s "http://localhost:9090/api/ai-test?speed=4&timeout=600000"
```
Wait for result. Record: wave reached, AI health, path length from logs.

## Step 3: Test version B
```bash
git checkout <version-b> -- server/ai/AIController.ts server/ai/strategies/economy.ts server/ai/strategies/maze.ts
npm run build
```
Restart server, run same test. Record results.

## Step 4: Restore original state
```bash
git checkout HEAD -- server/ai/AIController.ts server/ai/strategies/economy.ts server/ai/strategies/maze.ts
git stash pop  # if we stashed
npm run build
```
Restart server.

## Step 5: Report comparison
```
| Metric        | Version A (hash) | Version B (hash) |
|---------------|-------------------|-------------------|
| Wave reached  | N                 | N                 |
| AI health     | N                 | N                 |
| Path (wave 5) | N                 | N                 |
| Towers built  | N                 | N                 |
| AA count      | N                 | N                 |
```

## CRITICAL RULES
- ALWAYS use speed=4 (speed bugs are fixed)
- NEVER mix AI files from different commits with system files
- Speed fixes must stay in TowerSystem.ts and WaveSystem.ts regardless of which AI version is tested
- Read actual output files — no fabrication
- Restore the original code when done
