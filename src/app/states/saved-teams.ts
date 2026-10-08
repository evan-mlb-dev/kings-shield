import { effect, Injectable, signal } from '@angular/core';
import { ParsedPokemon } from '../services/save-file-parser';

const STORAGE_KEY = 'king_shield_saved_teams';
const STORAGE_VERSION = 1;

export interface SavedTeam {
  id: string;
  name: string;
  /** ISO date of the save */
  createdAt: string;
  /** Save file the team was built from */
  saveName: string | null;
  members: ParsedPokemon[];
}

@Injectable({
  providedIn: 'root',
})
export class SavedTeamsState {
  private readonly _teams = signal<SavedTeam[]>(readTeams());
  /** Most recent first */
  readonly teams = this._teams.asReadonly();

  constructor() {
    effect(() => writeTeams(this._teams()));
  }

  save(name: string, members: readonly ParsedPokemon[], saveName: string | null): SavedTeam {
    const team: SavedTeam = {
      id: crypto.randomUUID(),
      name: name.trim() || this.defaultName(),
      createdAt: new Date().toISOString(),
      saveName,
      members: structuredClone([...members]),
    };
    this._teams.update((teams) => [team, ...teams]);
    return team;
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this._teams.update((teams) => teams.map((t) => (t.id === id ? { ...t, name: trimmed } : t)));
  }

  remove(id: string): void {
    this._teams.update((teams) => teams.filter((t) => t.id !== id));
  }

  defaultName(): string {
    const names = new Set(this._teams().map((t) => t.name));
    let n = 1;
    while (names.has(`Team ${n}`)) n++;
    return `Team ${n}`;
  }
}

function readTeams(): SavedTeam[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return data.version === STORAGE_VERSION && Array.isArray(data.teams) ? data.teams : [];
  } catch {
    return [];
  }
}

function writeTeams(teams: SavedTeam[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, teams }));
  } catch (error) {
    console.warn('Could not store the saved teams (storage full or blocked):', error);
  }
}
