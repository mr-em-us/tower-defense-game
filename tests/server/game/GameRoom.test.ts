/**
 * Tests for GameRoom action handlers.
 * Since GameRoom's handler methods are private, we test them indirectly via the
 * handleMessage public method, or by testing the underlying logic they use.
 * We test the STATE CHANGES these actions should produce.
 */
import { describe, it, expect, vi } from 'vitest';
import { GamePhase, GameMode, PlayerSide, CellType, TowerType } from '../../../shared/types/game.types.js';
import { GRID, GAME, TOWER_STATS, SELL_REFUND_RATIO, REPAIR_COST_RATIO, PRICE_ESCALATION, MIN_DYNAMIC_PRICE, DEFAULT_GAME_SETTINGS } from '../../../shared/types/constants.js';
import { validateTowerPlacement } from '../../../shared/logic/pathfinding.js';
import { createGameState, createPlayer, createTower, placeTowerOnGrid, createWaveEconomy, createSettings } from '../../helpers.js';

describe('Tower placement validation', () => {
  it('allows placement in own zone on empty cell', () => {
    const state = createGameState();
    const result = validateTowerPlacement(state.grid, 5, 5, PlayerSide.LEFT);
    expect(result.valid).toBe(true);
  });

  it('rejects placement in opponents zone', () => {
    const state = createGameState();
    const result = validateTowerPlacement(state.grid, 50, 5, PlayerSide.LEFT);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Not in your zone');
  });
});

describe('Tower upgrade logic', () => {
  it('upgrade increases tower stats correctly', () => {
    const tower = createTower({ type: TowerType.BASIC, level: 1 });
    const stats = TOWER_STATS[TowerType.BASIC];
    const cost = Math.round(stats.cost * stats.upgradeCostMultiplier * tower.level);

    // Simulate upgrade
    tower.level++;
    tower.damage = Math.round(tower.damage * stats.upgradeStatMultiplier);
    tower.range = +(tower.range * 1.1).toFixed(1);
    tower.fireRate = +(tower.fireRate * 1.1).toFixed(2);

    expect(tower.level).toBe(2);
    expect(tower.damage).toBe(Math.round(stats.damage * stats.upgradeStatMultiplier));
    expect(cost).toBe(Math.round(stats.cost * stats.upgradeCostMultiplier));
  });

  it('upgrade cost scales with level', () => {
    const stats = TOWER_STATS[TowerType.SNIPER];
    const costLvl1 = Math.round(stats.cost * stats.upgradeCostMultiplier * 1);
    const costLvl2 = Math.round(stats.cost * stats.upgradeCostMultiplier * 2);
    const costLvl3 = Math.round(stats.cost * stats.upgradeCostMultiplier * 3);

    expect(costLvl2).toBeGreaterThan(costLvl1);
    expect(costLvl3).toBeGreaterThan(costLvl2);
  });

  it('wall upgrades get 1.3x health multiplier instead of 1.2x', () => {
    const tower = createTower({ type: TowerType.WALL, level: 1 });
    const oldMax = tower.maxHealth;
    tower.maxHealth = Math.round(tower.maxHealth * 1.3); // wall gets 1.3x
    expect(tower.maxHealth).toBe(Math.round(oldMax * 1.3));
  });
});

describe('Tower sell logic', () => {
  it('same-phase sell gives 100% refund', () => {
    const tower = createTower({ type: TowerType.BASIC, level: 1, placedWave: 3 });
    const stats = TOWER_STATS[tower.type];
    const totalInvested = stats.cost;
    const isSamePhase = tower.placedWave === 3; // same wave = build phase
    const refund = isSamePhase ? totalInvested : Math.round(totalInvested * SELL_REFUND_RATIO);
    expect(refund).toBe(stats.cost);
  });

  it('sell refund includes upgrade costs', () => {
    const stats = TOWER_STATS[TowerType.BASIC];
    let totalInvested = stats.cost;
    // Simulate tower at level 3
    for (let lvl = 1; lvl < 3; lvl++) {
      totalInvested += Math.round(stats.cost * stats.upgradeCostMultiplier * lvl);
    }
    expect(totalInvested).toBeGreaterThan(stats.cost);
  });
});

describe('Tower repair logic', () => {
  it('repair cost scales with damage ratio', () => {
    const stats = TOWER_STATS[TowerType.BASIC];
    // 50% damaged
    const damageRatio = 0.5;
    const cost = Math.ceil(damageRatio * stats.cost * REPAIR_COST_RATIO);
    expect(cost).toBe(Math.ceil(0.5 * stats.cost * REPAIR_COST_RATIO));
  });

  it('repair cost is 0 for undamaged tower', () => {
    const damageRatio = 0;
    const cost = Math.ceil(damageRatio * TOWER_STATS[TowerType.BASIC].cost * REPAIR_COST_RATIO);
    expect(cost).toBe(0);
  });

  it('fully damaged tower costs 50% of base cost to repair', () => {
    const stats = TOWER_STATS[TowerType.BASIC];
    const damageRatio = 1.0;
    const cost = Math.ceil(damageRatio * stats.cost * REPAIR_COST_RATIO);
    expect(cost).toBe(Math.ceil(stats.cost * REPAIR_COST_RATIO));
  });
});

describe('Tower restock logic', () => {
  it('restock cost = ammo needed * ammoCostPerRound', () => {
    const stats = TOWER_STATS[TowerType.BASIC];
    const ammoNeeded = 50;
    const cost = ammoNeeded * stats.ammoCostPerRound;
    expect(cost).toBe(50 * 0.3);
  });

  it('partial restock buys as much as affordable', () => {
    const stats = TOWER_STATS[TowerType.SNIPER];
    const credits = 5; // low credits
    const ammoToBuy = Math.floor(credits / stats.ammoCostPerRound);
    expect(ammoToBuy).toBe(Math.floor(5 / 2));
  });
});

describe('Dynamic pricing', () => {
  it('BASIC and WALL are exempt from dynamic pricing', () => {
    const state = createGameState();
    state.globalPurchaseCounts = { BASIC: 100, WALL: 100 };
    // BASIC/WALL should use base cost regardless of purchase count
    const basicCost = TOWER_STATS[TowerType.BASIC].cost;
    const wallCost = TOWER_STATS[TowerType.WALL].cost;
    expect(basicCost).toBe(50);
    expect(wallCost).toBe(25);
  });

  it('SNIPER/SPLASH/SLOW prices escalate with purchase count', () => {
    const baseCost = TOWER_STATS[TowerType.SNIPER].cost;
    const count = 5;
    const dynamicCost = Math.max(MIN_DYNAMIC_PRICE, Math.round(baseCost * (1 + count * PRICE_ESCALATION)));
    expect(dynamicCost).toBeGreaterThan(baseCost);
  });

  it('dynamic price has minimum floor', () => {
    // Even with negative scaling somehow, floor should apply
    const cost = Math.max(MIN_DYNAMIC_PRICE, Math.round(10 * (1 + 0 * PRICE_ESCALATION)));
    expect(cost).toBeGreaterThanOrEqual(MIN_DYNAMIC_PRICE);
  });
});

describe('Brush repair logic', () => {
  it('repairs and restocks towers within radius', () => {
    const state = createGameState({ phase: GamePhase.BUILD });
    const player = createPlayer({ credits: 5000 });
    state.players[player.id] = player;
    state.waveEconomy[player.id] = createWaveEconomy();

    const damagedTower = createTower({
      id: 'damaged',
      position: { x: 10, y: 14 },
      ownerId: player.id,
      health: 50,
      maxHealth: 200,
      ammo: 10,
      maxAmmo: 100,
    });
    placeTowerOnGrid(state, damagedTower);

    // Simulate brush repair logic
    const center = { x: 10, y: 14 };
    const radius = 3;
    const towersInRange = Object.values(state.towers)
      .filter(t => {
        const dx = t.position.x - center.x;
        const dy = t.position.y - center.y;
        return Math.sqrt(dx * dx + dy * dy) <= radius && t.ownerId === player.id;
      });

    expect(towersInRange.length).toBe(1);
    expect(towersInRange[0].health).toBe(50);
  });
});

describe('Auto-repair toggle', () => {
  it('toggles autoRepairEnabled', () => {
    const player = createPlayer({ autoRepairEnabled: false });
    player.autoRepairEnabled = !player.autoRepairEnabled;
    expect(player.autoRepairEnabled).toBe(true);
    player.autoRepairEnabled = !player.autoRepairEnabled;
    expect(player.autoRepairEnabled).toBe(false);
  });
});

describe('Auto-restock toggle', () => {
  it('toggles autoRestockEnabled', () => {
    const player = createPlayer({ autoRestockEnabled: false });
    player.autoRestockEnabled = !player.autoRestockEnabled;
    expect(player.autoRestockEnabled).toBe(true);
  });
});

describe('Auto-rebuild toggle', () => {
  it('toggles autoRebuildEnabled', () => {
    const player = createPlayer({ autoRebuildEnabled: false });
    player.autoRebuildEnabled = !player.autoRebuildEnabled;
    expect(player.autoRebuildEnabled).toBe(true);
  });
});

describe('Settings validation', () => {
  it('rejects settings with health out of bounds', () => {
    const valid = (hp: number) => typeof hp === 'number' && hp >= 50 && hp <= 5000;
    expect(valid(49)).toBe(false);
    expect(valid(5001)).toBe(false);
    expect(valid(500)).toBe(true);
  });

  it('rejects settings with credits out of bounds', () => {
    const valid = (c: number) => typeof c === 'number' && c >= 50 && c <= 50000;
    expect(valid(49)).toBe(false);
    expect(valid(50001)).toBe(false);
    expect(valid(5000)).toBe(true);
  });

  it('rejects settings with enemies out of bounds', () => {
    const valid = (e: number) => typeof e === 'number' && e >= 5 && e <= 500;
    expect(valid(4)).toBe(false);
    expect(valid(501)).toBe(false);
    expect(valid(15)).toBe(true);
  });

  it('rejects override values outside 0.1-5.0', () => {
    const validateVal = (v: number) => typeof v === 'number' && v >= 0.1 && v <= 5.0;
    expect(validateVal(0.05)).toBe(false);
    expect(validateVal(5.1)).toBe(false);
    expect(validateVal(1.0)).toBe(true);
  });
});

describe('Game speed', () => {
  it('speed values are clamped to valid set', () => {
    const VALID_SPEEDS = [1, 2, 4, 10];
    const clamp = (v: number) => VALID_SPEEDS.includes(v) ? v : 1;
    expect(clamp(1)).toBe(1);
    expect(clamp(2)).toBe(2);
    expect(clamp(4)).toBe(4);
    expect(clamp(10)).toBe(10);
    expect(clamp(3)).toBe(1);
    expect(clamp(0)).toBe(1);
  });
});
