---
description: "Read the full maze strategy history before making any AI/maze changes. Prevents repeating failed approaches."
---

# Maze History Check

**MANDATORY before any maze or AI strategy changes.**

## Step 1: Read the history
Read `memory/maze-strategy-history.md` in full. This contains:
- Every iteration of the maze strategy tried (16+ versions)
- What each one did and why it failed or succeeded
- The "Failed Approaches Summary" — things that must NEVER be retried
- The "Proven Approaches" — things that are known to work

## Step 2: Read current memory
Read `memory/MEMORY.md` for:
- Current state of the code
- Speed bug implications
- Known issues
- User preferences and critical feedback

## Step 3: Summarize for context
Tell the user:
1. Which iteration is currently active
2. What the last verified wave count was
3. What the known issues are
4. What approaches have been tried and failed (brief list)

## Step 4: Check if proposed change was already tried
Before implementing ANY maze/AI change:
- Search the history for similar approaches
- If it matches a failed approach, STOP and tell the user
- If it's genuinely new, proceed but log the experiment

## CRITICAL RULES
- This skill is REQUIRED before touching maze.ts, economy.ts, or AIController.ts
- The history exists to prevent repeating dead ends
- "I'll try a different implementation of the same idea" still counts as repeating
- If you're not sure whether an approach was tried, READ THE FILE — don't guess
