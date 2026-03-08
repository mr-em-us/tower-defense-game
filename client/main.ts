import { GRID, DEFAULT_GAME_SETTINGS } from '../shared/types/constants.js';
import { GameMode, GameSettings } from '../shared/types/game.types.js';
import { computeDifficultyFactor, getDifficultyLabel } from '../shared/utils/difficulty.js';
import { NetworkClient } from './network/NetworkClient.js';
import { GameClient } from './game/GameClient.js';
import { InputHandler } from './game/InputHandler.js';
import { Renderer } from './rendering/Renderer.js';
import { HUD } from './ui/HUD.js';
import { SettingsPanel } from './ui/SettingsPanel.js';
import { UsernamePanel } from './ui/UsernamePanel.js';
import { LeaderboardPanel } from './ui/LeaderboardPanel.js';
import { SavePanel } from './ui/SavePanel.js';

const HUD_HEIGHT = window.innerWidth <= 900 ? 36 : 48;

function getServerUrl(): string {
  const host = window.location.hostname || 'localhost';
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  // In production, server handles both static files and WS on the same port.
  // In dev, esbuild serves client on a different port, so always target 8080.
  const wsPort = window.location.port === '8080' ? '8080' : '8080';
  return `${protocol}://${host}:${wsPort}`;
}

let currentSettings: GameSettings = { ...DEFAULT_GAME_SETTINGS };
const settingsPanel = new SettingsPanel('settings-panel');
const usernamePanel = new UsernamePanel('username-panel');
const leaderboardPanel = new LeaderboardPanel('leaderboard-panel', (settings: GameSettings) => {
  leaderboardPanel.hide();
  settingsPanel.showReadOnly(settings);
});

function updateDifficultyIndicator(): void {
  const el = document.getElementById('menu-difficulty')!;
  const label = document.getElementById('menu-difficulty-label')!;
  const value = document.getElementById('menu-difficulty-value')!;

  const diffLabel = getDifficultyLabel(currentSettings);
  if (diffLabel === 'Normal') {
    el.classList.add('hidden');
    return;
  }

  const factor = computeDifficultyFactor(currentSettings);
  label.textContent = diffLabel + ':';
  value.textContent = factor.toFixed(2) + 'x';
  el.classList.remove('hidden');
}

type MenuResult = { type: 'new'; gameMode: GameMode } | { type: 'load'; saveId: string };

let savePanel: SavePanel | null = null;

function showModeMenu(playerName: string): Promise<MenuResult> {
  return new Promise((resolve) => {
    const menu = document.getElementById('mode-menu')!;
    menu.classList.remove('hidden');
    updateDifficultyIndicator();

    const onSingle = () => {
      menu.classList.add('hidden');
      cleanup();
      resolve({ type: 'new', gameMode: GameMode.SINGLE });
    };
    const onMulti = () => {
      menu.classList.add('hidden');
      cleanup();
      resolve({ type: 'new', gameMode: GameMode.MULTI });
    };
    const onSettings = async () => {
      menu.classList.add('hidden');
      currentSettings = await settingsPanel.show(currentSettings);
      menu.classList.remove('hidden');
      updateDifficultyIndicator();
    };
    const onLeaderboard = () => {
      menu.classList.add('hidden');
      leaderboardPanel.show();

      const panel = document.getElementById('leaderboard-panel')!;
      const observer = new MutationObserver(() => {
        if (panel.classList.contains('hidden')) {
          observer.disconnect();
          menu.classList.remove('hidden');
        }
      });
      observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
    };
    const onLoadSave = () => {
      menu.classList.add('hidden');
      if (!savePanel) {
        savePanel = new SavePanel('save-panel', (saveId: string) => {
          cleanup();
          resolve({ type: 'load', saveId });
        });
      }
      savePanel.show(playerName);

      const panel = document.getElementById('save-panel')!;
      const observer = new MutationObserver(() => {
        if (panel.classList.contains('hidden')) {
          observer.disconnect();
          menu.classList.remove('hidden');
        }
      });
      observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
    };
    const onDifficultyClick = async () => {
      menu.classList.add('hidden');
      currentSettings = await settingsPanel.show(currentSettings);
      menu.classList.remove('hidden');
      updateDifficultyIndicator();
    };

    const btnSingle = document.getElementById('btn-single')!;
    const btnMulti = document.getElementById('btn-multi')!;
    const btnSettings = document.getElementById('btn-settings')!;
    const btnLeaderboard = document.getElementById('btn-leaderboard')!;
    const btnLoadSave = document.getElementById('btn-load-save')!;
    const diffIndicator = document.getElementById('menu-difficulty')!;

    btnSingle.addEventListener('click', onSingle);
    btnMulti.addEventListener('click', onMulti);
    btnSettings.addEventListener('click', onSettings);
    btnLeaderboard.addEventListener('click', onLeaderboard);
    btnLoadSave.addEventListener('click', onLoadSave);
    diffIndicator.addEventListener('click', onDifficultyClick);

    function cleanup() {
      btnSingle.removeEventListener('click', onSingle);
      btnMulti.removeEventListener('click', onMulti);
      btnSettings.removeEventListener('click', onSettings);
      btnLeaderboard.removeEventListener('click', onLeaderboard);
      btnLoadSave.removeEventListener('click', onLoadSave);
      diffIndicator.removeEventListener('click', onDifficultyClick);
    }
  });
}

function applyResponsiveScaling(canvas: HTMLCanvasElement): void {
  const gameWidth = GRID.WIDTH * GRID.CELL_SIZE;
  const gameHeight = GRID.HEIGHT * GRID.CELL_SIZE;
  const availWidth = window.innerWidth;
  const availHeight = window.innerHeight;
  const scale = Math.min(1, availWidth / gameWidth, availHeight / gameHeight);
  canvas.style.width = `${gameWidth * scale}px`;
  canvas.style.height = `${gameHeight * scale}px`;
  canvas.style.marginTop = `${Math.max(0, (availHeight - gameHeight * scale) / 2)}px`;
}

async function main(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;

  canvas.width = GRID.WIDTH * GRID.CELL_SIZE;
  canvas.height = GRID.HEIGHT * GRID.CELL_SIZE;

  applyResponsiveScaling(canvas);
  window.addEventListener('resize', () => applyResponsiveScaling(canvas));

  const playerName = await usernamePanel.show();
  settingsPanel.setUsername(playerName);
  const menuResult = await showModeMenu(playerName);

  const network = new NetworkClient(getServerUrl());
  const gameClient = new GameClient(network);
  const renderer = new Renderer(ctx, gameClient);
  const _input = new InputHandler(canvas, gameClient);
  const hud = new HUD(gameClient);

  await network.connect();
  if (menuResult.type === 'load') {
    gameClient.loadSave(menuResult.saveId);
  } else {
    gameClient.joinGame(menuResult.gameMode, playerName, currentSettings);
  }

  let lastTime = performance.now();

  function loop(): void {
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    gameClient.update(dt);
    renderer.render(dt);
    hud.update();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

main().catch(console.error);
