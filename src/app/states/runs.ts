import { effect, Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'king_shield_runs';

export interface RunMon {
  speciesId: number;
  /** Empty when the Pokémon had no nickname */
  nickname: string;
  level: number | null;
}

export interface RunDeath {
  at: number | null;
  mine: RunMon | null;
  theirs: RunMon | null;
  blame: 'mine' | 'theirs';
}

export interface Run {
  id: string;
  name: string;
  /** First death (or end) time, ms */
  startedAt: number;
  endedAt: number;
  myName: string;
  partnerName: string;
  wipedOut: 'mine' | 'theirs' | null;
  /** Oldest first */
  deaths: RunDeath[];
  myTeam: RunMon[];
  partnerTeam: RunMon[];
}

/** The same run seen from the other player */
export function swapRun(run: Run): Run {
  const swap = <T>(side: T): T =>
    (side === 'mine' ? 'theirs' : side === 'theirs' ? 'mine' : side) as T;
  return {
    ...run,
    myName: run.partnerName,
    partnerName: run.myName,
    wipedOut: swap(run.wipedOut),
    deaths: run.deaths.map((d) => ({ ...d, mine: d.theirs, theirs: d.mine, blame: swap(d.blame) })),
    myTeam: run.partnerTeam,
    partnerTeam: run.myTeam,
  };
}

function readRuns(): Run[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

@Injectable({
  providedIn: 'root',
})
export class RunsState {
  private readonly _runs = signal<Run[]>(readRuns());
  /** Most recent first */
  readonly runs = this._runs.asReadonly();

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._runs()));
      } catch (error) {
        console.warn('Could not store the runs (storage full or blocked):', error);
      }
    });
  }

  add(run: Run): void {
    this._runs.update((runs) => (runs.some((r) => r.id === run.id) ? runs : [run, ...runs]));
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this._runs.update((runs) => runs.map((r) => (r.id === id ? { ...r, name: trimmed } : r)));
  }

  remove(id: string): void {
    this._runs.update((runs) => runs.filter((r) => r.id !== id));
  }

  defaultName(): string {
    const names = new Set(this._runs().map((r) => r.name));
    let n = 1;
    while (names.has(`Run ${n}`)) n++;
    return `Run ${n}`;
  }
}
