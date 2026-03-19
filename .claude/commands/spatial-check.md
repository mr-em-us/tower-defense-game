---
description: "Verify a proposed maze change by simulating tower placements on a coordinate grid. Compensates for LLM spatial reasoning weakness by making everything explicit."
---

# Spatial Verification Skill

Use this BEFORE implementing any change to maze geometry. Draws out the proposed layout cell-by-cell to catch spatial errors.

## Step 1: Define the proposed layout
Write out the exact grid coordinates for the proposed change. For example:
```
Proposed: Add wall row at y=21 with gap at x=36
Cells to place: (31,21) (32,21) (33,21) (34,21) (35,21) [gap at 36] (37,21)
```

## Step 2: Draw the ASCII grid
Draw the relevant section of the grid (not the full 60x30 — just the area being modified):
```
     31 32 33 34 35 36 37
y=19: W  W  W  W  W  W  W  <- seal wall
y=20: .  .  .  .  .  .  .  <- corridor (enemies walk here)
y=21: B  B  B  B  B  .  B  <- NEW internal wall (gap at 36)
y=22: .  .  .  .  .  .  .  <- corridor (enemies walk here)
y=23: W  W  W  W  W  W  W  <- seal wall
```

## Step 3: Trace the enemy path
Starting from the entry point, manually trace where enemies would walk:
```
Enter at (31,20) → walk right → (32,20) (33,20) (34,20) (35,20) (36,20)
Hit wall at (37,20) from side wall → go down through gap at (36,21)
Enter corridor at (36,22) → walk left → (35,22) (34,22) (33,22) (32,22) (31,22)
```

## Step 4: Verify
Check each of these:
- [ ] Every wall is exactly 1 cell thick (no adjacent wall rows)
- [ ] Every corridor is exactly 1 cell wide
- [ ] The gap alternates sides (odd walls: right gap, even walls: left gap)
- [ ] Side walls block corridor edges except at entry/exit
- [ ] Path is continuous from entry to exit
- [ ] Path length = sum of all corridor lengths + transitions

## Step 5: Count path cells
Add up the total path length. Compare to current path length.
If the change REDUCES path length, it's probably wrong.

## Step 6: Check wall-to-DPS ratio
Count: how many of the new cells are WALL (0 DPS) vs BASIC (20 DPS)?
The ideal ratio is: WALLs only for structural cells not adjacent to corridors.
Internal walls should be BASIC (they're next to corridors and can shoot enemies).

## CRITICAL RULES
- Draw it out EVERY TIME — never assume spatial correctness
- Use actual coordinates, not descriptions like "near the bottom"
- If the path trace gets stuck, the layout is wrong
- Show the ASCII grid to the user for verification
