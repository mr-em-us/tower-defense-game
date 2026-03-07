# Game Economy Reference

## Tower Stats (from shared/types/constants.ts TOWER_STATS)

| Tower | Cost | Damage | Range | FireRate | HP | Ammo | AmmoCost | Income | Maint |
|-------|------|--------|-------|----------|-----|------|----------|--------|-------|
| BASIC | 50 | 10 | 3 | 2.0 | 200 | 100 | 0.3 | 5 | 2 |
| SNIPER | 120 | 50 | 8 | 0.5 | 120 | 25 | 2.0 | 10 | 5 |
| SPLASH | 150 | 20 | 4 | 1.0 | 160 | 50 | 1.0 | 12 | 6 |
| SLOW | 80 | 5 | 3 | 1.5 | 200 | 60 | 0.3 | 7 | 3 |
| WALL | 25 | 0 | 0 | 0 | 150 | 0 | 0 | 0 | 0 |
| AA | 100 | 10 | 6 | 1.5 | 100 | 40 | 1.0 | 8 | 4 |

Additional tower stats: upgradeCostMultiplier (BASIC 1.5, SNIPER 1.6, SPLASH 1.5, SLOW 1.4, WALL 1.3), upgradeStatMultiplier (1.4, 1.5, 1.4, 1.3, 1.0), splashRadius (SPLASH=2), slowAmount (SLOW=0.5), slowDuration (SLOW=2s).

## Enemy Stats (from ENEMY_STATS)

| Enemy | Health | Speed | Credit Value | Contact Damage |
|-------|--------|-------|--------------|----------------|
| BASIC | 100 | 2 | 12 | 0.5 |
| FAST | 50 | 4 | 18 | 0.3 |
| TANK | 500 | 1 | 60 | 1.0 |
| BOSS | 2000 | 1.5 | 500 | 2.0 |
| FLYING | 80 | 3 | 20 | 0.4 |

### Flying Damage Model
- AA towers deal 3x damage to flying enemies (10 base × 3 = 30/hit, 45 DPS)
- Non-AA towers deal 25% damage to flying (small arms vs plane)
- AA towers ONLY target flying enemies (skip ground)
- Flying enemies bypass BFS pathfinding — fly straight from spawn to goal

### Air Wave Scheduling
- ~35% chance per wave (from wave 2+) to schedule an air wave 3 waves ahead
- HUD countdown: "✈ Air in 3/2/1" (yellow), "✈ AIR WAVE" (red)
- Flying enemies are 15% of wave total (min 2) on air waves only

## Economy Flow
1. **Start**: Players begin with startingCredits (default 2000)
2. **Build phase**: Place/upgrade/sell towers. Sell refund = 60% of total invested (SELL_REFUND_RATIO=0.6)
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

Spawn timing: Total enemies spread over WAVE_SPAWN_DURATION (45 seconds), shuffled order.

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
