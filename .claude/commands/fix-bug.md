---
description: "Fix a bug with pattern-aware debugging. Checks known patterns first, logs new patterns after fixing."
---

# Bug Fix Skill

## Step 1: Check known patterns
Before investigating, scan this pattern library for matches:

### Known Bug Patterns
*(This section is a living document — append new patterns as they're discovered)*

1. **Speed-invariance bugs**: Any system using `Date.now()` or wall-clock time for game logic will break at speed>1. Must use accumulated `gameTime` (dt-based). Found in TowerSystem fire timing.

2. **Batch vs cell-by-cell validation**: Placing maze cells one-by-one with path validation after each WILL fail for interdependent cells. The intermediate state (half the wall placed) blocks the path even though the final state is valid. Use batch placement with a single validation.

3. **While-loop spawn at high speed**: `while (timer <= 0) { spawn(); timer += interval; }` spawns multiple enemies per tick at high game speed. Must cap at one batch per tick.

4. **Offense fill blocking maze growth**: Towers placed by offense fill in early waves occupy cells that become corridor rows when the maze grows. Must clear corridors (sell offense fill towers) before expanding the box.

5. **Old seal walls blocking switchback gaps**: When numWalls increases, the old bottom seal becomes an internal wall that needs a gap. Must do targeted sells of the specific gap cell.

6. **Grid state not restored after simulation**: Any function that temporarily places towers on the grid for path testing MUST restore the grid afterward, even on error paths. Use try/finally.

7. **Dynamic pricing not applied consistently**: Client and server must use the same getDynamicPrice() formula. Client using base cost while server uses escalated price causes desyncs.

## Step 2: Investigate the bug
- Read the relevant code
- Check server logs (`preview_logs`)
- Check console errors (`preview_console_logs`)
- Reproduce if possible

## Step 3: Fix the bug
- Make the minimal change needed
- Don't refactor surrounding code
- Build and verify

## Step 4: Post-action learning
After fixing, answer these questions:
1. **Is this a new pattern?** If the bug has a generalizable lesson, append it to the Known Bug Patterns section above by editing this file.
2. **Did it affect test reliability?** If the bug made tests produce wrong results, note it in `.claude/docs/dead-ends.md`.
3. **Is this a fragile area?** If the code is likely to break again, add a note to `.claude/docs/architecture.md`.
4. **Should a skill be updated?** If an existing skill's instructions are now wrong, update that skill.
