import { effect, Injectable, signal } from '@angular/core';

const PC_COLLAPSED_KEY = 'king_shield_pc_collapsed';
const PARTNER_PC_COLLAPSED_KEY = 'king_shield_partner_pc_collapsed';
const PC_ORDER_KEY = 'king_shield_pc_order';
const PC_RESERVE_KEY = 'king_shield_pc_reserve';

function readOrder(key = PC_ORDER_KEY): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

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

  readonly pcOrder = signal<readonly string[] | null>(readOrder());

  readonly reserve = signal<readonly string[]>(readOrder(PC_RESERVE_KEY) ?? []);

  addToReserve(key: string, index = this.reserve().length): void {
    this.reserve.update((keys) => {
      const next = keys.filter((k) => k !== key);
      next.splice(Math.max(0, Math.min(index, next.length)), 0, key);
      return next;
    });
  }

  removeFromReserve(key: string): void {
    this.reserve.update((keys) => keys.filter((k) => k !== key));
  }

  constructor() {
    effect(() => {
      const reserve = this.reserve();
      try {
        localStorage.setItem(PC_RESERVE_KEY, JSON.stringify(reserve));
      } catch {
        // Storage unavailable: the reserve only lasts for this visit
      }
    });
    effect(() => {
      const order = this.pcOrder();
      try {
        if (order) localStorage.setItem(PC_ORDER_KEY, JSON.stringify(order));
        else localStorage.removeItem(PC_ORDER_KEY);
      } catch {
        // Storage unavailable: the order only lasts for this visit
      }
    });
  }

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
