import { Injectable, signal } from '@angular/core';

const PC_COLLAPSED_KEY = 'king_shield_pc_collapsed';
const FAINTED_COLLAPSED_KEY = 'king_shield_fainted_collapsed';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage unavailable: the choice only lasts for this visit
  }
}

@Injectable({
  providedIn: 'root',
})
export class PcFiltersState {
  readonly effectiveAgainst = signal<string | null>(null);

  readonly pcCollapsed = signal(readFlag(PC_COLLAPSED_KEY));

  /** Fainted box folded; remembered between visits */
  readonly faintedCollapsed = signal(readFlag(FAINTED_COLLAPSED_KEY));

  readonly revealRequest = signal(0);

  setPcCollapsed(collapsed: boolean): void {
    this.pcCollapsed.set(collapsed);
    writeFlag(PC_COLLAPSED_KEY, collapsed);
  }

  toggleFainted(): void {
    this.faintedCollapsed.update((c) => !c);
    writeFlag(FAINTED_COLLAPSED_KEY, this.faintedCollapsed());
  }

  togglePc(): void {
    this.setPcCollapsed(!this.pcCollapsed());
  }

  showEffectiveAgainst(type: string): void {
    this.effectiveAgainst.set(type);
    if (this.pcCollapsed()) this.setPcCollapsed(false);
    this.revealRequest.update((n) => n + 1);
  }
}
