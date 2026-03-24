import { describe, it, expect } from 'vitest';
import { GRID, GAME, TOWER_STATS, ENEMY_STATS, GOAL_ROWS, CENTER_SPAWN, PROJECTILE_SPEED, SELL_REFUND_RATIO, REPAIR_COST_RATIO, PRICE_ESCALATION, DEFAULT_GAME_SETTINGS, AI } from '../../shared/types/constants.js';
import { TowerType, EnemyType } from '../../shared/types/game.types.js';

describe('GRID constants', () => {
  it('has correct dimensions', () => {
    expect(GRID.WIDTH).toBe(60);
    expect(GRID.HEIGHT).toBe(30);
    expect(GRID.CELL_SIZE).toBe(20);
  });

  it('zone boundary splits grid in half', () => {
    expect(GRID.LEFT_ZONE_END).toBe(29);
    expect(GRID.RIGHT_ZONE_START).toBe(30);
    expect(GRID.RIGHT_ZONE_START).toBe(GRID.LEFT_ZONE_END + 1);
  });
});

describe('GAME constants', () => {
  it('has reasonable tick rate', () => {
    expect(GAME.TICK_RATE).toBe(20);
  });

  it('has positive starting values', () => {
    expect(GAME.STARTING_CREDITS).toBeGreaterThan(0);
    expect(GAME.PLAYER_MAX_HEALTH).toBeGreaterThan(0);
    expect(GAME.BUILD_PHASE_DURATION).toBeGreaterThan(0);
  });
});

describe('TOWER_STATS', () => {
  it('defines all tower types', () => {
    const types = [TowerType.BASIC, TowerType.SNIPER, TowerType.SPLASH, TowerType.SLOW, TowerType.WALL, TowerType.AA];
    for (const type of types) {
      expect(TOWER_STATS[type]).toBeDefined();
      expect(TOWER_STATS[type].cost).toBeGreaterThan(0);
      expect(TOWER_STATS[type].maxHealth).toBeGreaterThan(0);
    }
  });

  it('WALL has no damage/range/fireRate', () => {
    const wall = TOWER_STATS[TowerType.WALL];
    expect(wall.damage).toBe(0);
    expect(wall.range).toBe(0);
    expect(wall.fireRate).toBe(0);
    expect(wall.maxAmmo).toBe(0);
  });

  it('BASIC is cheapest offensive tower', () => {
    expect(TOWER_STATS[TowerType.BASIC].cost).toBeLessThan(TOWER_STATS[TowerType.SNIPER].cost);
    expect(TOWER_STATS[TowerType.BASIC].cost).toBeLessThan(TOWER_STATS[TowerType.SPLASH].cost);
  });

  it('SNIPER has highest range', () => {
    const types = [TowerType.BASIC, TowerType.SNIPER, TowerType.SPLASH, TowerType.SLOW];
    const sniperRange = TOWER_STATS[TowerType.SNIPER].range;
    for (const type of types) {
      expect(sniperRange).toBeGreaterThanOrEqual(TOWER_STATS[type].range);
    }
  });

  it('SPLASH has splash radius', () => {
    expect(TOWER_STATS[TowerType.SPLASH].splashRadius).toBeGreaterThan(0);
  });

  it('SLOW has slow amount and duration', () => {
    expect(TOWER_STATS[TowerType.SLOW].slowAmount).toBeGreaterThan(0);
    expect(TOWER_STATS[TowerType.SLOW].slowDuration).toBeGreaterThan(0);
  });

  it('all offensive towers have positive ammo', () => {
    const offensive = [TowerType.BASIC, TowerType.SNIPER, TowerType.SPLASH, TowerType.SLOW, TowerType.AA];
    for (const type of offensive) {
      expect(TOWER_STATS[type].maxAmmo).toBeGreaterThan(0);
    }
  });
});

describe('ENEMY_STATS', () => {
  it('defines all enemy types', () => {
    const types = [EnemyType.BASIC, EnemyType.FAST, EnemyType.TANK, EnemyType.BOSS, EnemyType.FLYING];
    for (const type of types) {
      expect(ENEMY_STATS[type]).toBeDefined();
      expect(ENEMY_STATS[type].health).toBeGreaterThan(0);
      expect(ENEMY_STATS[type].speed).toBeGreaterThan(0);
      expect(ENEMY_STATS[type].creditValue).toBeGreaterThan(0);
    }
  });

  it('FAST has highest speed', () => {
    expect(ENEMY_STATS[EnemyType.FAST].speed).toBeGreaterThan(ENEMY_STATS[EnemyType.BASIC].speed);
    expect(ENEMY_STATS[EnemyType.FAST].speed).toBeGreaterThan(ENEMY_STATS[EnemyType.TANK].speed);
  });

  it('TANK has highest health among non-bosses', () => {
    expect(ENEMY_STATS[EnemyType.TANK].health).toBeGreaterThan(ENEMY_STATS[EnemyType.BASIC].health);
    expect(ENEMY_STATS[EnemyType.TANK].health).toBeGreaterThan(ENEMY_STATS[EnemyType.FAST].health);
  });

  it('BOSS has highest credit value', () => {
    const bossValue = ENEMY_STATS[EnemyType.BOSS].creditValue;
    for (const type of [EnemyType.BASIC, EnemyType.FAST, EnemyType.TANK, EnemyType.FLYING]) {
      expect(bossValue).toBeGreaterThan(ENEMY_STATS[type].creditValue);
    }
  });

  it('BOSS has most health', () => {
    expect(ENEMY_STATS[EnemyType.BOSS].health).toBeGreaterThan(ENEMY_STATS[EnemyType.TANK].health);
  });
});

describe('GOAL_ROWS', () => {
  it('contains contiguous rows in center area', () => {
    expect(GOAL_ROWS).toEqual([12, 13, 14, 15, 16, 17]);
  });
});

describe('CENTER_SPAWN', () => {
  it('is at center of grid', () => {
    expect(CENTER_SPAWN.X_MIN).toBe(29);
    expect(CENTER_SPAWN.X_MAX).toBe(30);
    expect(CENTER_SPAWN.Y_ROWS).toEqual([14]);
  });
});

describe('Economy constants', () => {
  it('sell refund is 100%', () => {
    expect(SELL_REFUND_RATIO).toBe(1.0);
  });

  it('repair costs 50% of tower cost', () => {
    expect(REPAIR_COST_RATIO).toBe(0.5);
  });

  it('price escalation is 12%', () => {
    expect(PRICE_ESCALATION).toBe(0.12);
  });
});

describe('DEFAULT_GAME_SETTINGS', () => {
  it('has 40-element difficulty curve', () => {
    expect(DEFAULT_GAME_SETTINGS.difficultyCurve.length).toBe(40);
  });

  it('difficulty curve starts at 1.0', () => {
    expect(DEFAULT_GAME_SETTINGS.difficultyCurve[0]).toBe(1.0);
  });

  it('difficulty curve is monotonically non-decreasing', () => {
    for (let i = 1; i < DEFAULT_GAME_SETTINGS.difficultyCurve.length; i++) {
      expect(DEFAULT_GAME_SETTINGS.difficultyCurve[i]).toBeGreaterThanOrEqual(
        DEFAULT_GAME_SETTINGS.difficultyCurve[i - 1]
      );
    }
  });

  it('has reasonable default starting values', () => {
    expect(DEFAULT_GAME_SETTINGS.startingHealth).toBe(500);
    expect(DEFAULT_GAME_SETTINGS.startingCredits).toBe(5000);
    expect(DEFAULT_GAME_SETTINGS.firstWaveEnemies).toBe(15);
  });
});

describe('AI constants', () => {
  it('depth values are between 0 and 1', () => {
    expect(AI.DEPTH_EASY).toBeGreaterThan(0);
    expect(AI.DEPTH_EASY).toBeLessThan(1);
    expect(AI.DEPTH_HARD).toBeLessThan(1);
    expect(AI.DEPTH_EASY).toBeLessThan(AI.DEPTH_MEDIUM);
    expect(AI.DEPTH_MEDIUM).toBeLessThan(AI.DEPTH_HARD);
  });
});
