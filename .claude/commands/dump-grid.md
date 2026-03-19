---
description: "Dump the AI's current grid state as ASCII art to visualize the maze layout. Essential for spatial reasoning — shows exactly what towers are where, where the path goes, and wall thickness."
---

# Grid Dump Skill

You MUST do the following steps in order:

## Step 1: Ensure the server is running
Check if a preview server is running. If not, start one with `preview_start`.

## Step 2: Execute the grid dump
Use `preview_eval` to run this JavaScript in the game page:

```javascript
(function() {
  // Access the game state from the client's network state
  const state = window.__gameState || window.gameClient?.state;
  if (!state) return 'No game state available. Is a game running?';

  const grid = state.grid;
  if (!grid || !grid.cells) return 'No grid data in game state';

  const towers = state.towers || {};
  const path = []; // We'll mark the path separately

  // Build tower lookup by position
  const towerMap = {};
  for (const [id, tower] of Object.entries(towers)) {
    const key = `${tower.position.x},${tower.position.y}`;
    towerMap[key] = tower;
  }

  // Build ASCII grid
  const lines = [];
  lines.push('   ' + Array.from({length: 60}, (_, i) => (i % 10).toString()).join(''));
  lines.push('   ' + Array.from({length: 60}, (_, i) => i % 10 === 0 ? (i/10).toString() : ' ').join(''));

  for (let y = 0; y < 30; y++) {
    let row = (y < 10 ? ' ' : '') + y + ' ';
    for (let x = 0; x < 60; x++) {
      const key = `${x},${y}`;
      const tower = towerMap[key];
      if (tower) {
        // Tower type symbols
        const symbols = { BASIC: '#', WALL: 'W', SNIPER: 'S', SPLASH: 'X', SLOW: '~', AA: 'A' };
        row += symbols[tower.type] || '?';
      } else if (grid.cells[y][x] === 1) { // TOWER cell without tower object (shouldn't happen)
        row += '+';
      } else if (x === 29 || x === 30) {
        row += (y === 14) ? '@' : '|'; // Spawn zone
      } else {
        row += '.';
      }
    }
    lines.push(row);
  }

  // Add legend
  lines.push('');
  lines.push('Legend: # BASIC  W WALL  A AA  S SNIPER  X SPLASH  ~ SLOW  @ spawn  | center');
  lines.push(`Towers: ${Object.keys(towers).length} | Wave: ${state.waveNumber} | Phase: ${state.phase}`);

  return lines.join('\n');
})()
```

## Step 3: Display and analyze
Show the full ASCII grid to the user. Then analyze:
1. Count wall thickness — are any walls more than 1 cell thick?
2. Identify the enemy path (corridors between walls)
3. Count switchbacks
4. Note any obvious spatial issues (dead zones, wasted space, blocked corridors)
5. Check AA tower positions relative to row 14 (flight path)

## Step 4: If no game state available
If the client doesn't expose game state, use the server logs instead:
```
preview_logs with search="[MAZE] Path trace" to get the path coordinates
preview_logs with search="[MAZE] Box" to get maze dimensions
preview_logs with search="[MAZE] Wave" to get tower counts
```
Then reconstruct the layout from the path trace and maze dimensions.
