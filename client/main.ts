import { GRID, DEFAULT_GAME_SETTINGS } from '../shared/types/constants.js';
import { GameMode, GameSettings, AIDifficulty } from '../shared/types/game.types.js';
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
import { TemplatePanel } from './ui/TemplatePanel.js';
import { TowerTemplate } from './data/TemplateStore.js';

// Injected by scripts/build-client.mjs via esbuild --define.
declare const __VERSION__: string;

const HUD_HEIGHT = window.innerWidth <= 900 ? 36 : 48;

function getServerUrl(): string {
  const host = window.location.hostname || 'localhost';
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  // In production (Render), server handles both static files and WS on the same port.
  // The page is served from the server, so location.port is correct.
  // In dev, esbuild serves client on port 8000, but server is on 9090.
  const isDev = window.location.port !== '' && window.location.port !== '9090'
    && window.location.port !== '443' && window.location.port !== '80';
  const wsPort = isDev ? '9090' : window.location.port;
  return wsPort ? `${protocol}://${host}:${wsPort}` : `${protocol}://${host}`;
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

type MenuResult =
  | { type: 'new'; gameMode: GameMode; template?: TowerTemplate }
  | { type: 'load'; saveId: string };

let savePanel: SavePanel | null = null;
let templatePanel: TemplatePanel | null = null;
let pendingTemplate: TowerTemplate | null = null;

function showModeMenu(playerName: string): Promise<MenuResult> {
  return new Promise((resolve) => {
    const menu = document.getElementById('mode-menu')!;
    menu.classList.remove('hidden');
    updateDifficultyIndicator();

    const aiToggle = document.getElementById('ai-toggle') as HTMLInputElement;
    const startWaveSelect = document.getElementById('start-wave-select') as HTMLSelectElement;

    const onSingle = () => {
      currentSettings.aiEnabled = aiToggle.checked;
      currentSettings.aiDifficulty = AIDifficulty.HARD;
      currentSettings.startWave = parseInt(startWaveSelect.value) || 1;
      menu.classList.add('hidden');
      cleanup();
      resolve({ type: 'new', gameMode: GameMode.SINGLE, template: pendingTemplate ?? undefined });
      pendingTemplate = null;
    };
    const onMulti = () => {
      currentSettings.startWave = parseInt(startWaveSelect.value) || 1;
      menu.classList.add('hidden');
      cleanup();
      resolve({ type: 'new', gameMode: GameMode.MULTI });
    };
    const onObserver = () => {
      currentSettings.aiEnabled = true;
      currentSettings.aiDifficulty = AIDifficulty.HARD;
      currentSettings.startWave = parseInt(startWaveSelect.value) || 1;
      menu.classList.add('hidden');
      cleanup();
      resolve({ type: 'new', gameMode: GameMode.OBSERVER });
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
    let saveLoadResolved = false;
    const onLoadSave = () => {
      menu.classList.add('hidden');
      if (!savePanel) {
        savePanel = new SavePanel('save-panel', (saveId: string) => {
          saveLoadResolved = true;
          cleanup();
          menu.classList.add('hidden');
          resolve({ type: 'load', saveId });
        });
      }
      savePanel.show(playerName);

      const panel = document.getElementById('save-panel')!;
      const observer = new MutationObserver(() => {
        if (panel.classList.contains('hidden')) {
          observer.disconnect();
          // Only re-show menu if user pressed Back, not if they loaded a save
          if (!saveLoadResolved) {
            menu.classList.remove('hidden');
          }
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

    const onLoadTemplate = () => {
      menu.classList.add('hidden');
      if (!templatePanel) {
        templatePanel = new TemplatePanel('template-panel', (tpl) => {
          pendingTemplate = tpl;
          refreshTemplateButtonLabel();
        });
      }
      templatePanel.show(playerName);

      const panel = document.getElementById('template-panel')!;
      const observer = new MutationObserver(() => {
        if (panel.classList.contains('hidden')) {
          observer.disconnect();
          menu.classList.remove('hidden');
        }
      });
      observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
    };

    const btnSingle = document.getElementById('btn-single')!;
    const btnMulti = document.getElementById('btn-multi')!;
    const btnObserver = document.getElementById('btn-observer')!;
    const btnSettings = document.getElementById('btn-settings')!;
    const btnLeaderboard = document.getElementById('btn-leaderboard')!;
    const btnLoadSave = document.getElementById('btn-load-save')!;
    const btnLoadTemplate = document.getElementById('btn-load-template')!;
    const diffIndicator = document.getElementById('menu-difficulty')!;

    const refreshTemplateButtonLabel = () => {
      btnLoadTemplate.textContent = pendingTemplate
        ? `Template: ${pendingTemplate.name} (${pendingTemplate.cost.toLocaleString()}c) ✓`
        : 'Load Template';
    };
    refreshTemplateButtonLabel();

    btnSingle.addEventListener('click', onSingle);
    btnMulti.addEventListener('click', onMulti);
    btnObserver.addEventListener('click', onObserver);
    btnSettings.addEventListener('click', onSettings);
    btnLeaderboard.addEventListener('click', onLeaderboard);
    btnLoadSave.addEventListener('click', onLoadSave);
    btnLoadTemplate.addEventListener('click', onLoadTemplate);
    diffIndicator.addEventListener('click', onDifficultyClick);

    function cleanup() {
      btnSingle.removeEventListener('click', onSingle);
      btnMulti.removeEventListener('click', onMulti);
      btnObserver.removeEventListener('click', onObserver);
      btnSettings.removeEventListener('click', onSettings);
      btnLeaderboard.removeEventListener('click', onLeaderboard);
      btnLoadSave.removeEventListener('click', onLoadSave);
      btnLoadTemplate.removeEventListener('click', onLoadTemplate);
      diffIndicator.removeEventListener('click', onDifficultyClick);
    }
  });
}

function applyResponsiveScaling(canvas: HTMLCanvasElement): void {
  const gameWidth = GRID.WIDTH * GRID.CELL_SIZE;
  const gameHeight = GRID.HEIGHT * GRID.CELL_SIZE;
  const availWidth = window.innerWidth;
  // Only reserve HUD at top. Tower bar is position:fixed center-bottom and lets
  // the canvas run behind it — reserving its full height letterboxes the sides.
  const hudHeight = document.getElementById('hud')?.offsetHeight || 48;
  const towerBar = document.getElementById('tower-bar');
  const towerBarHeight = towerBar?.offsetHeight || 90;
  // Reserve a small bottom strip so some playable grid stays visible below the tower bar
  // on narrower displays; on wider displays the canvas can run full-width with tower bar
  // overlapping the center-bottom (tower bar doesn't span full width).
  const bottomReserve = Math.min(towerBarHeight * 0.35, 40);
  const availHeight = window.innerHeight - hudHeight - bottomReserve;
  const scale = Math.min(availWidth / gameWidth, availHeight / gameHeight);
  canvas.style.width = `${gameWidth * scale}px`;
  canvas.style.height = `${gameHeight * scale}px`;
  canvas.style.marginTop = `${hudHeight + Math.max(0, (availHeight - gameHeight * scale) / 2)}px`;
}

async function main(): Promise<void> {
  const versionEl = document.getElementById('version-stamp');
  if (versionEl) versionEl.textContent = __VERSION__;

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;

  canvas.width = GRID.WIDTH * GRID.CELL_SIZE;
  canvas.height = GRID.HEIGHT * GRID.CELL_SIZE;

  applyResponsiveScaling(canvas);
  window.addEventListener('resize', () => applyResponsiveScaling(canvas));
  // Re-run after UI elements render (tower bar height may change)
  setTimeout(() => applyResponsiveScaling(canvas), 500);
  setTimeout(() => applyResponsiveScaling(canvas), 2000);

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
    if (menuResult.template) gameClient.setPendingTemplate(menuResult.template);
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
