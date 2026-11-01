import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'king_shield_level_cap';
const DEFAULT_CAP = 50;

function clamp(cap: number): number {
  return Math.max(1, Math.min(100, Math.round(cap) || 1));
}

function read(): number {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return value >= 1 && value <= 100 ? value : DEFAULT_CAP;
  } catch {
    return DEFAULT_CAP;
  }
}

@Injectable({
  providedIn: 'root',
})
export class LevelCapState {
  private readonly _cap = signal(read());
  readonly cap = this._cap.asReadonly();

  set(cap: number): void {
    const value = clamp(cap);
    this._cap.set(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Storage unavailable: only for this visit
    }
  }
}
