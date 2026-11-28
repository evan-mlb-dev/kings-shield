import { inject } from '@angular/core';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import { SaveFileParser } from '../services/save-file-parser';
import { GameStateService } from './game-state';
import { SaveBytesState } from './save-bytes';

export const DEFAULT_SAVE_NAME = 'TEST-SAVE.sav';

export async function loadDefaultSave(): Promise<void> {
  const gameState = inject(GameStateService);
  const saveBytes = inject(SaveBytesState);
  const parser = inject(SaveFileParser);
  const db = inject(PokemonDb);
  // A save from an earlier visit: its game's data must be there before anything is shown
  const cached = gameState.pkmnData();
  if (cached) await db.useGame(cached.game ?? 'radical-red');
  if (cached || saveBytes.bytes()) return;

  try {
    const response = await fetch(DEFAULT_SAVE_NAME);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    // The player may have loaded a save meanwhile
    if (gameState.pkmnData() || saveBytes.bytes()) return;

    const parsed = parser.parseSaveFile(buffer);
    if (!parsed) throw new Error('unreadable save');
    await db.useGame(parsed.game ?? 'radical-red');
    gameState.setSaveName(DEFAULT_SAVE_NAME);
    gameState.setPkmnData(parsed);
    saveBytes.set(new Uint8Array(buffer));
  } catch (error) {
    console.warn('Demo save not loaded:', error);
  }
}
