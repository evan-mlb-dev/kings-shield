import { computed, effect, Injectable, signal } from '@angular/core';
import { ParsedPokemon, ParsedSave } from '../services/save-file-parser';

const CACHE_KEY = 'king_shield_save';
const CACHE_VERSION = 1;

@Injectable({
  providedIn: 'root',
})
export class GameStateService {
  readonly saveName = signal<string | null>(null);
  /** Single source of truth: the full parser output */
  readonly pkmnData = signal<ParsedSave | null>(null);

  readonly team = computed<ParsedPokemon[]>(() => this.pkmnData()?.team ?? []);
  readonly pc = computed<ParsedPokemon[]>(() => this.pkmnData()?.pc ?? []);

  constructor() {
    this.hydrate();
    effect(() => this.persist(this.saveName(), this.pkmnData()));
  }

  setSaveName(name: string): void {
    this.saveName.set(name);
  }

  setPkmnData(data: ParsedSave): void {
    this.pkmnData.set(data);
  }

  clear(): void {
    this.saveName.set(null);
    this.pkmnData.set(null);
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (error) {
      console.warn('Could not clear the cached save (storage unavailable):', error);
    }
  }

  private hydrate(): void {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;

      const cached = JSON.parse(raw);
      if (cached.version !== CACHE_VERSION) {
        console.warn(
          `Cached save ignored: version ${cached.version} does not match expected ${CACHE_VERSION}.`,
        );
        return;
      }

      this.saveName.set(cached.saveName);
      this.pkmnData.set(cached.data);
    } catch (error) {
      console.error('Failed to restore the cached save, starting empty:', error);
    }
  }

  private persist(saveName: string | null, data: ParsedSave | null): void {
    try {
      if (!saveName || !data) return;
      localStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, saveName, data }));
    } catch (error) {
      console.warn('Could not cache the save (storage full or blocked):', error);
    }
  }
}
