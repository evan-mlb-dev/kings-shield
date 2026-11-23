import { inject, Injectable, signal } from '@angular/core';
import { Analytics } from '../services/analytics';

/** A web page shown in the side panel (app-side-browser) */
export interface SidePage {
  url: string;
  title: string;
}

@Injectable({
  providedIn: 'root',
})
export class SidePanelState {
  private readonly analytics = inject(Analytics);
  private readonly _page = signal<SidePage | null>(null);
  readonly page = this._page.asReadonly();

  /** Shows this page (replaces the one shown) */
  open(page: SidePage): void {
    this._page.set(page);
  }

  toggle(page: SidePage): void {
    this._page.update((current) => (current?.url === page.url ? null : page));
  }

  close(): void {
    this._page.set(null);
  }

  handleClick(event: MouseEvent, page: SidePage): void {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    if (!this._page()) this.analytics.event('smogon-panel-opened');
    this.toggle(page);
  }
}
