import { Injectable, signal } from '@angular/core';

const PC_COLLAPSED_KEY = 'king_shield_pc_collapsed';
const PARTNER_PC_COLLAPSED_KEY = 'king_shield_partner_pc_collapsed';

/** Tabs of the PC panel */
export type PcView = 'pc' | 'fainted';

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

  readonly partnerPcCollapsed = signal(readFlag(PARTNER_PC_COLLAPSED_KEY));

  togglePartnerPc(): void {
    this.partnerPcCollapsed.update((c) => !c);
    writeFlag(PARTNER_PC_COLLAPSED_KEY, this.partnerPcCollapsed());
  }

  readonly pcView = signal<PcView>('pc');

  readonly revealRequest = signal(0);

  setPcCollapsed(collapsed: boolean): void {
    this.pcCollapsed.set(collapsed);
    writeFlag(PC_COLLAPSED_KEY, collapsed);
  }

  showView(view: PcView): void {
    this.pcView.set(view);
    if (this.pcCollapsed()) this.setPcCollapsed(false);
  }

  togglePc(): void {
    this.setPcCollapsed(!this.pcCollapsed());
  }

  showEffectiveAgainst(type: string): void {
    this.effectiveAgainst.set(type);
    this.showView('pc');
    this.revealRequest.update((n) => n + 1);
  }
}
