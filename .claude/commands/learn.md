---
description: "End-of-session knowledge sweep. Extracts learnings from the session and routes them to the correct files. Run before saving."
---

# Learn — Session Knowledge Sweep

Comprehensive review of what happened this session. Routes every learning to its canonical home per the knowledge taxonomy.

## Step 1: Gather session context
Read these files:
- `memory/current-session.md` — what happened this session
- `.claude/docs/knowledge-taxonomy.md` — routing table
- `memory/MEMORY.md` — current state

Also review recent git commits:
```bash
git log --oneline -10
```

## Step 2: Extract learnings by category

For each significant thing that happened this session, classify it:

### Bug patterns discovered?
→ Append to `/fix-bug` skill's Known Bug Patterns section.

### Architecture changed or discovered?
→ Update `.claude/docs/architecture.md`.

### Failed approach tried?
→ If AI/maze: append to `memory/maze-strategy-history.md`.
→ If general: append to `.claude/docs/dead-ends.md`.
Format: what was tried → what happened → what works instead.

### Non-obvious decision made?
→ Append to `.claude/docs/decisions.md`.
Format: context → decision → alternatives → consequences.

### Workflow improvement discovered?
→ Update the relevant skill file in `.claude/commands/`.

### User preference learned?
→ Update `memory/MEMORY.md` User Preferences section.

### Economy/balance numbers changed?
→ Update `.claude/docs/economy.md`.

### Feature completed or started?
→ Update `.claude/docs/features.md`.

### New test baseline established?
→ Update `/ai-test` skill's Known Baselines table.

## Step 3: Cross-check for staleness

For each knowledge file, verify it's still accurate:
- [ ] `memory/MEMORY.md` — does Current State reflect reality?
- [ ] `.claude/docs/economy.md` — do the numbers match the code?
- [ ] `.claude/docs/features.md` — are statuses current?
- [ ] `.claude/docs/architecture.md` — does it match the code?
- [ ] Skills in `.claude/commands/` — are instructions still correct?

Flag anything stale and update it.

## Step 4: Check for gaps

Ask:
- Was any experiment run without being logged?
- Are there implicit decisions that should be explicit?
- Did any skill give wrong advice during this session?
- Is there a repeated pattern that should become a skill?

## Step 5: Report

Tell the user:
```
Knowledge sweep complete:
- [N] learnings routed to [list of files updated]
- [N] stale entries updated
- [N] gaps identified: [list]
```

## CRITICAL RULES
- This skill should be run BEFORE the save protocol, so learnings are included in the commit.
- Don't skip categories just because "nothing happened" — explicitly confirm each is empty.
- Dead ends are the highest-ROI learning. If ANY approach failed, it MUST be logged.
- Never delete existing entries — only append or update.
