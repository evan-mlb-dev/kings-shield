import { computed, effect, Injectable, signal } from '@angular/core';
import { ParsedPokemon, ParsedSave } from '../services/save-file-parser';

const CACHE_KEY = 'king_shield_save';
const CACHE_VERSION = 2;

export const MAX_TEAM_SIZE = 6;

export function pokemonKey(p: ParsedPokemon): string {
  return `${p.personality}-${p.trainerId}-${p.secretId}`;
}

@Injectable({
  providedIn: 'root',
})
export class GameStateService {
  readonly saveName = signal<string | null>(null);
  /** Full parser output, as read from the save file */
  readonly pkmnData = signal<ParsedSave | null>(null);

  private readonly _team = signal<ParsedPokemon[]>([]);
  readonly team = this._team.asReadonly();

  /** Every Pokémon of the save: party + PC */
  private readonly all = computed<ParsedPokemon[]>(() => {
    const data = this.pkmnData();
    return data ? [...data.team, ...data.pc] : [];
  });

  readonly pc = computed<ParsedPokemon[]>(() => {
    const inTeam = new Set(this._team().map(pokemonKey));
    return this.all().filter((p) => !inTeam.has(pokemonKey(p)));
  });

  readonly boxNames = computed<string[]>(() => this.pkmnData()?.boxNames ?? []);
  readonly isTeamFull = computed(() => this._team().length >= MAX_TEAM_SIZE);

  constructor() {
    this.hydrate();
    effect(() => this.persist(this.saveName(), this.pkmnData(), this._team()));
  }

  setSaveName(name: string): void {
    this.saveName.set(name);
  }

  setPkmnData(data: ParsedSave): void {
    this.pkmnData.set(data);
    this._team.set(data.team.slice(0, MAX_TEAM_SIZE));
  }

  addToTeam(mon: ParsedPokemon, index = this._team().length): void {
    const key = pokemonKey(mon);
    this._team.update((team) => {
      if (team.some((p) => pokemonKey(p) === key)) return team;
      const next = [...team];
      const at = Math.max(0, Math.min(index, next.length));
      if (next.length >= MAX_TEAM_SIZE) {
        next[Math.min(at, next.length - 1)] = mon;
      } else {
        next.splice(at, 0, mon);
      }
      return next;
    });
  }

  placeInTeam(mon: ParsedPokemon, slot: number): void {
    const key = pokemonKey(mon);
    this._team.update((team) => {
      if (team.some((p) => pokemonKey(p) === key)) return team;
      if (slot < 0 || slot >= MAX_TEAM_SIZE) return team;
      const next = [...team];
      if (slot < next.length) next[slot] = mon;
      else next.push(mon);
      return next;
    });
  }

  swapInTeam(from: number, to: number): void {
    this._team.update((team) => {
      if (from === to || from < 0 || from >= team.length || to < 0) return team;
      const next = [...team];
      if (to < next.length) {
        [next[from], next[to]] = [next[to], next[from]];
      } else {
        next.push(...next.splice(from, 1));
      }
      return next;
    });
  }

  removeFromTeam(mon: ParsedPokemon): void {
    const key = pokemonKey(mon);
    this._team.update((team) => team.filter((p) => pokemonKey(p) !== key));
  }

  moveInTeam(from: number, to: number): void {
    this._team.update((team) => {
      if (from === to || from < 0 || from >= team.length) return team;
      const next = [...team];
      const [mon] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(to, next.length)), 0, mon);
      return next;
    });
  }

  /** Sends every team member back to the PC. */
  clearTeam(): void {
    this._team.set([]);
  }

  /** Puts the save's original party back. */
  resetTeam(): void {
    this._team.set(this.pkmnData()?.team.slice(0, MAX_TEAM_SIZE) ?? []);
  }

  clear(): void {
    this.saveName.set(null);
    this.pkmnData.set(null);
    this._team.set([]);
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

      const data: ParsedSave = cached.data;
      const byKey = new Map([...data.team, ...data.pc].map((p) => [pokemonKey(p), p]));
      const team = (cached.teamKeys as string[])
        .map((k) => byKey.get(k))
        .filter((p): p is ParsedPokemon => !!p);

      this.saveName.set(cached.saveName);
      this.pkmnData.set(data);
      this._team.set(team.slice(0, MAX_TEAM_SIZE));
    } catch (error) {
      console.error('Failed to restore the cached save, starting empty:', error);
    }
  }

  private persist(saveName: string | null, data: ParsedSave | null, team: ParsedPokemon[]): void {
    try {
      if (!saveName || !data) return;
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          version: CACHE_VERSION,
          saveName,
          data,
          teamKeys: team.map(pokemonKey),
        }),
      );
    } catch (error) {
      console.warn('Could not cache the save (storage full or blocked):', error);
    }
  }
}
