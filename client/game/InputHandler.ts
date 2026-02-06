import { GRID } from '../../shared/types/constants.js';
import { GamePhase } from '../../shared/types/game.types.js';
import { GameClient } from './GameClient.js';

export class InputHandler {
  private canvasRect: DOMRect;

  constructor(
    private canvas: HTMLCanvasElement,
    private gameClient: GameClient,
  ) {
    this.canvasRect = canvas.getBoundingClientRect();

    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('click', (e) => this.onClick(e));

    // Touch support for mobile
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.canvasRect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      this.onMouseMove(touch as unknown as MouseEvent);
      this.onClick(touch as unknown as MouseEvent);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.canvasRect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      this.onMouseMove(touch as unknown as MouseEvent);
    }, { passive: false });

    window.addEventListener('resize', () => {
      this.canvasRect = canvas.getBoundingClientRect();
    });
  }

  private pixelToGrid(px: number, py: number): { x: number; y: number } | null {
    const gx = Math.floor((px - this.canvasRect.left) / GRID.CELL_SIZE);
    const gy = Math.floor((py - this.canvasRect.top) / GRID.CELL_SIZE);
    if (gx < 0 || gx >= GRID.WIDTH || gy < 0 || gy >= GRID.HEIGHT) return null;
    return { x: gx, y: gy };
  }

  private onMouseMove(e: MouseEvent): void {
    const cell = this.pixelToGrid(e.clientX, e.clientY);
    this.gameClient.clientState.hoveredCell = cell;
  }

  private onClick(e: MouseEvent): void {
    const state = this.gameClient.getState();
    if (!state || state.phase !== GamePhase.BUILD) return;

    const cell = this.pixelToGrid(e.clientX, e.clientY);
    if (!cell) return;

    // Check if clicking on own tower (for selection) - always allowed during build
    const existingTower = Object.values(state.towers).find(
      (t) => t.position.x === cell.x && t.position.y === cell.y,
    );

    if (existingTower && existingTower.ownerId === this.gameClient.getPlayerId()) {
      this.gameClient.clientState.selectedTowerId = existingTower.id;
      this.gameClient.clientState.selectedTowerType = null;
      return;
    }

    // Place new tower (only when a tower type is selected)
    if (this.gameClient.clientState.selectedTowerType) {
      this.gameClient.clientState.selectedTowerId = null;
      this.gameClient.placeTower(cell);
    }
  }
}
