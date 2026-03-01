import { GRID } from '../../shared/types/constants.js';
import { GamePhase, PlayerSide } from '../../shared/types/game.types.js';
import { GameClient } from './GameClient.js';

export class InputHandler {
  private canvasRect: DOMRect;
  private lastPinchDistance = 0;
  private brushDragging = false;
  private lastBrushTime = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private gameClient: GameClient,
  ) {
    this.canvasRect = canvas.getBoundingClientRect();

    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('click', (e) => this.onClick(e));

    // Brush drag support
    canvas.addEventListener('mousedown', (e) => {
      if (this.gameClient.clientState.activeTool === 'brush') {
        this.brushDragging = true;
        this.onBrush(e);
      }
    });
    canvas.addEventListener('mousemove', (e) => {
      if (this.brushDragging) {
        this.onBrush(e);
      }
    });
    canvas.addEventListener('mouseup', () => {
      this.brushDragging = false;
    });

    // Mouse wheel zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const cs = this.gameClient.clientState;
      const oldZoom = cs.zoom;
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      cs.zoom = Math.max(1.0, Math.min(3.0, cs.zoom * zoomFactor));

      // Zoom toward mouse position
      this.canvasRect = canvas.getBoundingClientRect();
      const mouseX = (e.clientX - this.canvasRect.left) * (canvas.width / this.canvasRect.width);
      const mouseY = (e.clientY - this.canvasRect.top) * (canvas.height / this.canvasRect.height);
      const zoomChange = cs.zoom / oldZoom;
      cs.panOffset.x = mouseX - zoomChange * (mouseX - cs.panOffset.x);
      cs.panOffset.y = mouseY - zoomChange * (mouseY - cs.panOffset.y);
      this.clampPan();
    }, { passive: false });

    // Touch support for mobile
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.canvasRect = canvas.getBoundingClientRect();

      if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        this.lastPinchDistance = Math.sqrt(dx * dx + dy * dy);
        return;
      }

      if (e.touches.length === 1) {
        const touch = e.touches[0];
        this.onMouseMove(touch as unknown as MouseEvent);
        if (this.gameClient.clientState.activeTool === 'brush') {
          this.brushDragging = true;
          this.onBrush(touch as unknown as MouseEvent);
        } else {
          this.onClick(touch as unknown as MouseEvent);
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.canvasRect = canvas.getBoundingClientRect();

      if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (this.lastPinchDistance > 0) {
          const cs = this.gameClient.clientState;
          const oldZoom = cs.zoom;
          const scale = dist / this.lastPinchDistance;
          cs.zoom = Math.max(1.0, Math.min(3.0, cs.zoom * scale));

          // Zoom toward center of two fingers
          const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const canvasX = (centerX - this.canvasRect.left) * (this.canvas.width / this.canvasRect.width);
          const canvasY = (centerY - this.canvasRect.top) * (this.canvas.height / this.canvasRect.height);
          const zoomChange = cs.zoom / oldZoom;
          cs.panOffset.x = canvasX - zoomChange * (canvasX - cs.panOffset.x);
          cs.panOffset.y = canvasY - zoomChange * (canvasY - cs.panOffset.y);
          this.clampPan();
        }
        this.lastPinchDistance = dist;
        return;
      }

      if (e.touches.length === 1) {
        const touch = e.touches[0];
        this.onMouseMove(touch as unknown as MouseEvent);
        if (this.brushDragging) {
          this.onBrush(touch as unknown as MouseEvent);
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      this.brushDragging = false;
    });

    // Keyboard: reset zoom with 0 or Home, arrow keys to pan
    window.addEventListener('keydown', (e) => {
      if (e.key === '0' || e.key === 'Home') {
        this.gameClient.clientState.zoom = 1.0;
        this.gameClient.clientState.panOffset = { x: 0, y: 0 };
      }
      const panStep = 40;
      if (e.key === 'ArrowLeft') {
        this.gameClient.clientState.panOffset.x += panStep;
        this.clampPan();
      } else if (e.key === 'ArrowRight') {
        this.gameClient.clientState.panOffset.x -= panStep;
        this.clampPan();
      } else if (e.key === 'ArrowUp') {
        this.gameClient.clientState.panOffset.y += panStep;
        this.clampPan();
      } else if (e.key === 'ArrowDown') {
        this.gameClient.clientState.panOffset.y -= panStep;
        this.clampPan();
      }
    });

    window.addEventListener('resize', () => {
      this.canvasRect = canvas.getBoundingClientRect();
    });
  }

  private pixelToGrid(px: number, py: number): { x: number; y: number } | null {
    const cs = this.gameClient.clientState;
    // Step 1: Map screen coords to canvas buffer coords (CSS scaling)
    const scaleX = this.canvas.width / this.canvasRect.width;
    const scaleY = this.canvas.height / this.canvasRect.height;
    let canvasX = (px - this.canvasRect.left) * scaleX;
    let canvasY = (py - this.canvasRect.top) * scaleY;
    // Step 2: Reverse zoom+pan transform
    canvasX = (canvasX - cs.panOffset.x) / cs.zoom;
    canvasY = (canvasY - cs.panOffset.y) / cs.zoom;
    // Step 3: Convert to grid coords
    const gx = Math.floor(canvasX / GRID.CELL_SIZE);
    const gy = Math.floor(canvasY / GRID.CELL_SIZE);
    if (gx < 0 || gx >= GRID.WIDTH || gy < 0 || gy >= GRID.HEIGHT) return null;
    return { x: gx, y: gy };
  }

  private clampPan(): void {
    const cs = this.gameClient.clientState;
    const W = GRID.WIDTH * GRID.CELL_SIZE;
    const H = GRID.HEIGHT * GRID.CELL_SIZE;
    // Grid must always fill the viewport — no blue border visible
    // At zoom >= 1, the grid (W*zoom x H*zoom) is larger than the canvas (W x H)
    // panOffset.x can range from 0 (left edge aligned) to W - W*zoom (right edge aligned)
    const minPanX = W - W * cs.zoom; // negative when zoomed in
    const minPanY = H - H * cs.zoom;
    cs.panOffset.x = Math.max(minPanX, Math.min(0, cs.panOffset.x));
    cs.panOffset.y = Math.max(minPanY, Math.min(0, cs.panOffset.y));
  }

  private onMouseMove(e: MouseEvent): void {
    const cell = this.pixelToGrid(e.clientX, e.clientY);
    this.gameClient.clientState.hoveredCell = cell;
  }

  private onBrush(e: MouseEvent): void {
    // Throttle to max ~5 per second
    const now = Date.now();
    if (now - this.lastBrushTime < 200) return;
    this.lastBrushTime = now;

    const state = this.gameClient.getState();
    if (!state) return;
    if (state.phase !== GamePhase.BUILD && state.phase !== GamePhase.COMBAT) return;

    const cell = this.pixelToGrid(e.clientX, e.clientY);
    if (!cell) return;

    this.gameClient.brushRepairAndRestock(cell.x, cell.y);
  }

  private pixelToCanvas(px: number, py: number): { x: number; y: number } {
    const scaleX = this.canvas.width / this.canvasRect.width;
    const scaleY = this.canvas.height / this.canvasRect.height;
    return {
      x: (px - this.canvasRect.left) * scaleX,
      y: (py - this.canvasRect.top) * scaleY,
    };
  }

  private onClick(e: MouseEvent): void {
    const state = this.gameClient.getState();
    if (!state) return;
    if (state.phase !== GamePhase.BUILD && state.phase !== GamePhase.COMBAT) return;

    // Check chart widget click
    const charts = this.gameClient.chartsOverlay;
    if (charts.isVisible()) {
      const canvasCoord = this.pixelToCanvas(e.clientX, e.clientY);
      const side = this.gameClient.getPlayerSide();
      const W = GRID.WIDTH * GRID.CELL_SIZE;
      const wx = side === PlayerSide.RIGHT ? W - 160 - 12 : 12;
      const wy = 52;
      const localX = canvasCoord.x - wx;
      const localY = canvasCoord.y - wy;
      if (charts.hitTestWidget(localX, localY)) {
        if (charts.hitTestTab(localX, localY)) {
          charts.cycleTab();
        }
        return; // click inside widget, don't pass through
      }
    }

    const cs = this.gameClient.clientState;

    // Brush tool handles its own click via mousedown/onBrush
    if (cs.activeTool === 'brush') return;

    const cell = this.pixelToGrid(e.clientX, e.clientY);
    if (!cell) return;

    // Check if clicking on own tower (for selection) - allowed in BUILD and COMBAT
    const existingTower = Object.values(state.towers).find(
      (t) => t.position.x === cell.x && t.position.y === cell.y,
    );

    if (existingTower && existingTower.ownerId === this.gameClient.getPlayerId()) {
      const isShift = e.shiftKey;

      if (isShift) {
        // Shift-click: toggle tower in/out of selection
        const idx = cs.selectedTowerIds.indexOf(existingTower.id);
        if (idx >= 0) {
          cs.selectedTowerIds = cs.selectedTowerIds.filter(id => id !== existingTower.id);
        } else {
          cs.selectedTowerIds = [...cs.selectedTowerIds, existingTower.id];
        }
      } else {
        // Normal click: single select
        cs.selectedTowerIds = [existingTower.id];
      }
      cs.selectedTowerType = null;
      return;
    }

    // Place new tower (only during build phase with a tower type selected)
    if (state.phase === GamePhase.BUILD && cs.selectedTowerType) {
      cs.selectedTowerIds = [];
      this.gameClient.placeTower(cell);
    }
  }
}
