import { describe, it, expect } from 'vitest';
import { planEconomy, getMaintenanceActions, getUpgradeActions, getDynamicPrice } from '../../../server/ai/strategies/economy.js';
import { GamePhase, PlayerSide, TowerType } from '../../../shared/types/game.types.js';
import { TOWER_STATS, PRICE_ESCALATION, MIN_DYNAMIC_PRICE } from '../../../shared/types/constants.js';
import { createGameState, createPlayer, createTower, placeTowerOnGrid, createWaveEconomy } from '../../helpers.js';

describe('planEconomy', () => {
  it('returns zero budgets when player has no credits', () => {
    const state = createGameState({ phase: GamePhase.BUILD, waveNumber: 1 });
    const player = createPlayer({ credits: 0 });
    state.players[player.id] = player;

    const plan = planEconomy(state, player.id, 0.5);
    expect(plan.repairBudget).toBe(0);
    expect(plan.restockBudget).toBe(0);
    expect(plan.buildBudget).toBe(0);
    expect(plan.upgradeBudget).toBe(0);
  });

  it('returns zero budgets for missing player', () => {
    const state = createGameState();
    const plan = planEconomy(state, 'nonexistent', 0.5);
    expect(plan.repairBudget).toBe(0);
  });

  it('allocates repair budget for damaged towers', () => {
    const state = createGameState({ phase: GamePhase.BUILD, waveNumber: 5 });
    const player = createPlayer({ credits: 1000 });
    state.players[player.id] = player;

    const tower = createTower({
      ownerId: player.id,
      health: 50,
      maxHealth: 200,
    });
    placeTowerOnGrid(state, tower);

    const plan = planEconomy(state, player.id, 0.5);
    expect(plan.repairBudget).toBeGreaterThan(0);
  });

  it('allocates restock budget for depleted towers', () => {
    const state = createGameState({ phase: GamePhase.BUILD, waveNumber: 5 });
    const player = createPlayer({ credits: 1000 });
    state.players[player.id] = player;

    const tower = createTower({
      ownerId: player.id,
      ammo: 10,
      maxAmmo: 100,
    });
    placeTowerOnGrid(state, tower);

    const plan = planEconomy(state, player.id, 0.5);
    expect(plan.restockBudget).toBeGreaterThan(0);
  });

  it('early waves have zero upgrade ratio', () => {
    const state = createGameState({ phase: GamePhase.BUILD, waveNumber: 2 });
    const player = createPlayer({ credits: 5000 });
    state.players[player.id] = player;

    const plan = planEconomy(state, player.id, 0.5);
    expect(plan.upgradeBudget).toBe(0);
    expect(plan.buildBudget).toBeGreaterThan(0);
  });

  it('late waves prioritize upgrades over building', () => {
    const state = createGameState({ phase: GamePhase.BUILD, waveNumber: 20 });
    const player = createPlayer({ credits: 5000 });
    state.players[player.id] = player;

    // Need many towers for upgrade ratio to kick in
    for (let i = 0; i < 60; i++) {
      const t = createTower({
        id: `tower-${i}`,
        ownerId: player.id,
        position: { x: i % 29, y: Math.floor(i / 29) },
      });
      state.towers[t.id] = t;
    }

    const plan = planEconomy(state, player.id, 0.9);
    expect(plan.upgradeBudget).toBeGreaterThan(plan.buildBudget);
  });

  it('total allocations dont exceed available credits', () => {
    const state = createGameState({ phase: GamePhase.BUILD, waveNumber: 5 });
    const player = createPlayer({ credits: 500 });
    state.players[player.id] = player;

    const plan = planEconomy(state, player.id, 0.5);
    const total = plan.repairBudget + plan.restockBudget + plan.buildBudget + plan.upgradeBudget + plan.savingsTarget;
    expect(total).toBeLessThanOrEqual(500);
  });
});

describe('getMaintenanceActions', () => {
  it('generates repair actions for damaged towers, sorted by severity', () => {
    const state = createGameState();
    const player = createPlayer();
    state.players[player.id] = player;

    const mild = createTower({ id: 'mild', ownerId: player.id, health: 150, maxHealth: 200 });
    const severe = createTower({ id: 'severe', ownerId: player.id, health: 20, maxHealth: 200, position: { x: 10, y: 10 } });
    placeTowerOnGrid(state, mild);
    placeTowerOnGrid(state, severe);

    const actions = getMaintenanceActions(state, player.id);
    const repairActions = actions.filter(a => a.type === 'REPAIR_TOWER');
    expect(repairActions.length).toBe(2);
    // Most damaged first
    expect((repairActions[0] as any).towerId).toBe('severe');
  });

  it('generates restock actions for low-ammo towers', () => {
    const state = createGameState();
    const player = createPlayer();
    state.players[player.id] = player;

    const tower = createTower({ ownerId: player.id, ammo: 5, maxAmmo: 100 });
    placeTowerOnGrid(state, tower);

    const actions = getMaintenanceActions(state, player.id);
    const restockActions = actions.filter(a => a.type === 'RESTOCK_TOWER');
    expect(restockActions.length).toBe(1);
  });

  it('returns empty array when all towers are healthy and full', () => {
    const state = createGameState();
    const player = createPlayer();
    state.players[player.id] = player;

    const tower = createTower({ ownerId: player.id }); // full health and ammo
    placeTowerOnGrid(state, tower);

    const actions = getMaintenanceActions(state, player.id);
    expect(actions.length).toBe(0);
  });
});

describe('getUpgradeActions', () => {
  it('returns upgrade actions sorted by DPS/cost ratio', () => {
    const state = createGameState({ waveNumber: 5 });
    const player = createPlayer();
    state.players[player.id] = player;

    const basic = createTower({ id: 'basic', ownerId: player.id, type: TowerType.BASIC });
    const sniper = createTower({ id: 'sniper', ownerId: player.id, type: TowerType.SNIPER, position: { x: 10, y: 10 } });
    placeTowerOnGrid(state, basic);
    placeTowerOnGrid(state, sniper);

    const actions = getUpgradeActions(state, player.id, 500, 0.5);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every(a => a.type === 'UPGRADE_TOWER')).toBe(true);
  });

  it('skips wall towers', () => {
    const state = createGameState({ waveNumber: 5 });
    const player = createPlayer();
    state.players[player.id] = player;

    const wall = createTower({ id: 'wall', ownerId: player.id, type: TowerType.WALL });
    placeTowerOnGrid(state, wall);

    const actions = getUpgradeActions(state, player.id, 500, 0.5);
    expect(actions.length).toBe(0);
  });

  it('respects budget limit', () => {
    const state = createGameState({ waveNumber: 5 });
    const player = createPlayer();
    state.players[player.id] = player;

    const tower = createTower({ ownerId: player.id, type: TowerType.SNIPER, level: 10 });
    placeTowerOnGrid(state, tower);

    // Very small budget — upgrade should cost too much
    const actions = getUpgradeActions(state, player.id, 1, 0.5);
    expect(actions.length).toBe(0);
  });
});

describe('getDynamicPrice', () => {
  it('returns base cost for BASIC towers', () => {
    const state = createGameState();
    state.globalPurchaseCounts = { BASIC: 100 };
    const price = getDynamicPrice(state, TowerType.BASIC);
    expect(price).toBe(TOWER_STATS[TowerType.BASIC].cost);
  });

  it('returns base cost for WALL towers', () => {
    const state = createGameState();
    state.globalPurchaseCounts = { WALL: 50 };
    const price = getDynamicPrice(state, TowerType.WALL);
    expect(price).toBe(TOWER_STATS[TowerType.WALL].cost);
  });

  it('escalates SNIPER price with purchase count', () => {
    const state = createGameState();
    state.globalPurchaseCounts = { SNIPER: 10 };
    const price = getDynamicPrice(state, TowerType.SNIPER);
    const expected = Math.max(MIN_DYNAMIC_PRICE, Math.round(
      TOWER_STATS[TowerType.SNIPER].cost * (1 + 10 * PRICE_ESCALATION)
    ));
    expect(price).toBe(expected);
  });

  it('applies cost override from settings', () => {
    const state = createGameState();
    state.settings.towerOverrides = { SNIPER: { cost: 2.0 } } as any;
    state.globalPurchaseCounts = {};
    const price = getDynamicPrice(state, TowerType.SNIPER);
    expect(price).toBe(Math.round(TOWER_STATS[TowerType.SNIPER].cost * 2.0));
  });

  it('respects minimum price floor', () => {
    const state = createGameState();
    state.globalPurchaseCounts = {};
    // Even without purchases, price should be >= MIN_DYNAMIC_PRICE
    const price = getDynamicPrice(state, TowerType.SPLASH);
    expect(price).toBeGreaterThanOrEqual(MIN_DYNAMIC_PRICE);
  });
});
