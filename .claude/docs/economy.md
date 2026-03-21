# Game Economy Reference

## Tower Stats (from shared/types/constants.ts TOWER_STATS)

| Tower | Cost | Damage | Range | FireRate | HP | Ammo | AmmoCost | Income | Maint |
|-------|------|--------|-------|----------|-----|------|----------|--------|-------|
| BASIC | 50 | 10 | 3 | 2.0 | 200 | 100 | 0.3 | 5 | 2 |
| SNIPER | 120 | 50 | 8 | 0.5 | 120 | 25 | 2.0 | 10 | 5 |
| SPLASH | 150 | 20 | 4 | 1.0 | 160 | 50 | 1.0 | 12 | 6 |
| SLOW | 80 | 5 | 3 | 1.5 | 200 | 60 | 0.3 | 7 | 3 |
| WALL | 25 | 0 | 0 | 0 | 150 | 0 | 0 | 0 | 0 |
| AA | 100 | 8 | 6 | 4.5 | 100 | 40 | 1.0 | 8 | 4 |

Additional tower stats: upgradeCostMultiplier (BASIC 1.5, SNIPER 1.6, SPLASH 1.5, SLOW 1.4, WALL 1.3), upgradeStatMultiplier (1.4, 1.5, 1.4, 1.3, 1.0), splashRadius (SPLASH=2), slowAmount (SLOW=0.5), slowDuration (SLOW=2s).

## Enemy Stats (from ENEMY_STATS)

| Enemy | Health | Speed | Credit Value | Contact Damage |
|-------|--------|-------|--------------|----------------|
| BASIC | 100 | 2 | 12 | 0.5 |
| FAST | 50 | 4 | 18 | 0.3 |
| TANK | 500 | 1 | 60 | 1.0 |
| BOSS | 2000 | 1.5 | 500 | 2.0 |
| FLYING | 80 | 2 | 20 | 0.4 |

### Flying Damage Model
- AA towers deal 3x damage to flying enemies (8 base × 3 = 24/hit, 108 DPS)
- AA towers target both ground AND air (8 dmg to ground)
- Non-AA towers deal 50% damage to flying
- Flying enemies bypass BFS pathfinding — fly straight from spawn to goal

### Leak Damage
- When an enemy reaches the goal, player loses HP = `leakDamage` (flat, NOT scaled by difficulty)
- `leakDamage` = base creditValue (BASIC=12, FLYING=20, TANK=60, BOSS=500)
- Kill rewards still scale: `creditValue = base × sqrt(difficulty)`

### Difficulty Scaling
- Difficulty curve: 40 entries (waves 1-40), from 1.0 to 120.0
- Beyond wave 40: exponential extrapolation (15% per wave)
- Enemy HP scales linearly with difficulty multiplier
- Kill rewards scale with sqrt(difficulty) — income grows slower than enemy HP
- AA burns ammo fast: 40 rounds at 4.5/s = ~9 seconds before empty

### Air Wave Scheduling
- ~35% chance per wave (from wave 2+) to schedule an air wave 3 waves ahead
- HUD countdown: "✈ Air in 3/2/1" (yellow), "✈ AIR WAVE" (red)
- Flying enemies are 15% of wave total (min 2) on air waves only

## Economy Flow
1. **Start**: Players begin with startingCredits (default 2000)
2. **Build phase**: Place/upgrade/sell towers. Sell refund = 100% of total invested (SELL_REFUND_RATIO=1.0)
3. **Combat phase**: Towers fire, consuming ammo + credits (ammoCostPerRound per shot). Kill rewards = enemy.creditValue
4. **Wave end**: Each player gets CREDITS_PER_WAVE (50) + tower incomePerTurn - tower maintenancePerTurn
5. **Repair**: Available during BUILD and COMBAT. Cost = damageRatio * baseCost * REPAIR_COST_RATIO (0.5)
6. **Restock**: Available anytime. Cost = ammoNeeded * ammoCostPerRound. Partial restock if can't afford full

## Dynamic Pricing
- Applies to: SNIPER, SPLASH, SLOW (not BASIC or WALL)
- Formula: `actualCost = baseCost * costOverride * (1 + globalCount * PRICE_ESCALATION)`
- PRICE_ESCALATION = 0.12 (12% per purchase)
- globalPurchaseCounts tracks purchases + upgrades per type
- Shared across all players in multiplayer

## WaveEconomy Tracking (server/game/GameRoom.ts)
Per-wave revenue/expense tracking via `state.waveEconomy[playerId]`. Resets each wave in `initWaveStats()`.

Revenue categories: killRewards (ProjectileSystem.applyDamage), waveBonus (CREDITS_PER_WAVE at wave start), towerIncome (sum of incomePerTurn at wave start), sellRefunds (handleSellTower)

Expense categories: towerPurchases (handlePlaceTower), towerUpgrades (handleUpgradeTower), repairCosts (handleRepairTower, handleBrushRepair, processAutoRepair), restockCosts (handleRestockTower, handleRestockAll, handleBrushRepair, processAutoRepair), maintenanceCosts (sum of maintenancePerTurn at wave start)

## AI Economy — Emergent Maze Builder (server/ai/strategies/maze.ts)
**Architecture:** Greedy hill-climbing. Each tower placement scored by composite function:
- `score = pathDelta × 15 + pathCoverage × 2 + wallAdjacency × 3 + pathProximity × 1`
- Lexicographic sort: delta>0 cells ALWAYS placed before delta=0 cells
- Tower type: WALL (25c) for delta>0, BASIC/specialized for coverage

**AA targeting:** `wave <= 3 ? 2 : wave <= 6 ? 2 + (wave-3)*1.5 : 7 + (wave-6)*2`
- Placement: rows 12-16, spread horizontally
- Budget reserve: gap × cost, capped at 50% total budget
- Wave 1: no AA. Wave 2+: proactive.

**Upgrade ratios:** 0% w1-4, 15% w5-7, 30% w8-10, 55% w11-15, 75% w16-25, 85% w26+
- Unspent build budget flows to upgrades automatically (AIController)
- AA upgrade ROI boosted 3× (effective DPS vs flying)
- Savings reserve: 0% (spend everything)

## Wave Scaling Formula (server/systems/WaveSystem.ts)

```
diffRatio = getDifficultyMultiplier(wave, curve) / getDifficultyMultiplier(1, curve)
baseCount = firstWaveEnemies * (1 + (wave - 1) * 0.2) * diffRatio
```

Type distribution:
- Waves 1-2: 100% Basic
- Waves 3-4: 70% Basic, 30% Fast
- Wave 5+: 55% Basic, 30% Fast, 15% Tank
- Every 10th wave: Boss (count = ceil(wave/10))

Enemy HP scaling: `hp = baseHealth * getDifficultyMultiplier(wave, curve) * (enemyOverride ?? 1)`

Spawn timing: Total enemies spread over WAVE_SPAWN_DURATION (8 seconds), batch size = min(5, 1+floor((wave-1)/2)).

## Wave Count Examples (Normal difficulty, firstWaveEnemies=15)

| Wave | Basic | Fast | Tank | Boss | Total |
|------|-------|------|------|------|-------|
| 1 | 15 | - | - | - | 15 |
| 3 | 16 | 7 | - | - | 23 |
| 5 | 19 | 11 | 5 | - | 35 |
| 10 | 55 | 30 | 15 | 1 | 101 |
| 20 | 285 | 156 | 78 | 2 | 521 |

## Difficulty Presets (shared/utils/difficulty.ts)

| Preset | HP | Credits | FirstWave | Curve Style | Factor |
|--------|-----|---------|-----------|-------------|--------|
| Easy | 1000 | 5000 | 8 | Gentle (1.0-3.0) | ~0.69x |
| Normal | 500 | 2000 | 15 | Standard (1.0-7.2) | 1.00x |
| Hard | 300 | 1000 | 25 | Steep (1.0-10.0) | ~1.70x |

## Difficulty Factor Formula (shared/utils/difficulty.ts)
Weighted geometric mean: `exp(sum(weight_i * ln(ratio_i)))`

Weights: Curve 0.25, Enemies 0.15, HP 0.10, Credits 0.08, Tower stats 0.22, Enemy stats 0.20

Ratios:
- HP: `default/custom` (more HP = easier = lower factor)
- Credits: `default/custom`
- Enemies: `custom/default` (more enemies = harder)
- Curve: `customMean/defaultMean`
- Tower advantage stats (damage, range, fireRate, HP, ammo): `1/mult` per stat
- Tower cost: `mult` (higher cost = harder)
- Enemy challenge stats (health, speed, contactDamage): `mult`
- Enemy creditValue: `1/mult`

Adjusted score: `waveReached * difficultyFactor`
