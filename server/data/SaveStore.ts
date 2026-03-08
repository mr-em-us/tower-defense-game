import fs from 'fs';
import path from 'path';
import { GameSaveFile, SaveMetadata } from '../../shared/types/save.types.js';

const SAVES_DIR = path.resolve('data', 'saves');
const MAX_SAVES_PER_PLAYER = 10;

export class SaveStore {
  constructor() {
    if (!fs.existsSync(SAVES_DIR)) {
      fs.mkdirSync(SAVES_DIR, { recursive: true });
    }
  }

  listSaves(playerName: string): SaveMetadata[] {
    if (!fs.existsSync(SAVES_DIR)) return [];
    const files = fs.readdirSync(SAVES_DIR).filter(f => f.endsWith('.json'));
    const results: SaveMetadata[] = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(SAVES_DIR, file), 'utf-8');
        const save: GameSaveFile = JSON.parse(raw);
        if (save.metadata.playerName === playerName) {
          results.push(save.metadata);
        }
      } catch { /* skip corrupt files */ }
    }
    results.sort((a, b) => b.timestamp - a.timestamp);
    return results;
  }

  getSave(saveId: string): GameSaveFile | null {
    const safeId = saveId.replace(/[^a-zA-Z0-9\-]/g, '');
    const filePath = path.join(SAVES_DIR, `${safeId}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as GameSaveFile;
    } catch { return null; }
  }

  createSave(save: GameSaveFile): boolean {
    const existing = this.listSaves(save.metadata.playerName);
    if (existing.length >= MAX_SAVES_PER_PLAYER) {
      return false;
    }
    const safeId = save.metadata.id.replace(/[^a-zA-Z0-9\-]/g, '');
    const filePath = path.join(SAVES_DIR, `${safeId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(save));
    return true;
  }

  deleteSave(saveId: string, playerName: string): boolean {
    const safeId = saveId.replace(/[^a-zA-Z0-9\-]/g, '');
    const filePath = path.join(SAVES_DIR, `${safeId}.json`);
    if (!fs.existsSync(filePath)) return false;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const save: GameSaveFile = JSON.parse(raw);
      if (save.metadata.playerName !== playerName) return false;
      fs.unlinkSync(filePath);
      return true;
    } catch { return false; }
  }
}
