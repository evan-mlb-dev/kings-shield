import { computed, inject, Injectable, signal } from '@angular/core';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import { levelFromExperience } from '../shared/experience';
import { GameStateService } from './game-state';

const STORAGE_KEY = 'king_shield_level_cap';
/** Without a save, nor a value set by the player */
const FALLBACK_CAP = 50;

function clamp(cap: number): number {
  return Math.max(1, Math.min(100, Math.round(cap) || 1));
}

function read(): number | null {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return value >= 1 && value <= 100 ? value : null;
  } catch {
    return null;
  }
}

@Injectable({
  providedIn: 'root',
})
export class LevelCapState {
  private readonly gameState = inject(GameStateService);
  private readonly db = inject(PokemonDb);

  private readonly _explicit = signal(read());
  readonly explicit = this._explicit.asReadonly();

  readonly highestLevel = computed(() => {
    let highest: number | null = null;
    for (const p of [...this.gameState.team(), ...this.gameState.pc()]) {
      if (p.isEgg) continue;
      const rate = this.db.species.get(p.speciesId)?.growthRate;
      const level = p.level ?? (rate ? levelFromExperience(rate, p.experience) : null);
      if (level !== null && (highest === null || level > highest)) highest = level;
    }
    return highest;
  });

  readonly cap = computed(() => this._explicit() ?? this.highestLevel() ?? FALLBACK_CAP);

  set(cap: number): void {
    const value = clamp(cap);
    this._explicit.set(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Storage unavailable: only for this visit
    }
  }
}
