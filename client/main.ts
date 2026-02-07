import { GRID } from '../shared/types/constants.js';
import { GameMode } from '../shared/types/game.types.js';
import { NetworkClient } from './network/NetworkClient.js';
import { GameClient } from './game/GameClient.js';
import { InputHandler } from './game/InputHandler.js';
import { Renderer } from './rendering/Renderer.js';
import { HUD } from './ui/HUD.js';

const HUD_HEIGHT = window.innerWidth <= 900 ? 36 : 48;

function getServerUrl(): string {
  const host = window.location.hostname || 'localhost';
  const port = window.location.port;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return port ? `${protocol}://${host}:${port}` : `${protocol}://${host}`;
}

function showModeMenu(): Promise<GameMode> {
  return new Promise((resolve) => {
    const menu = document.getElementById('mode-menu')!;
    menu.classList.remove('hidden');

    document.getElementById('btn-single')!.addEventListener('click', () => {
      menu.classList.add('hidden');
      resolve(GameMode.SINGLE);
    });

    document.getElementById('btn-multi')!.addEventListener('click', () => {
      menu.classList.add('hidden');
      resolve(GameMode.MULTI);
    });
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

  const gameMode = await showModeMenu();

  const network = new NetworkClient(getServerUrl());
  const gameClient = new GameClient(network);
  const renderer = new Renderer(ctx, gameClient);
  const _input = new InputHandler(canvas, gameClient);
  const hud = new HUD(gameClient);

  await network.connect();
  gameClient.joinGame(gameMode);

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
