import { inject, Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

interface GoatCounter {
  count(vars: { path: string; title?: string; event?: boolean }): void;
}

declare global {
  interface Window {
    goatcounter?: GoatCounter;
  }
}

@Injectable({
  providedIn: 'root',
})
export class Analytics {
  private readonly router = inject(Router);

  trackPages(): void {
    let first = true;
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        // The first page is already counted by count.js on load
        if (first) {
          first = false;
          return;
        }
        window.goatcounter?.count({ path: location.pathname, title: document.title });
      });
  }

  event(name: string): void {
    window.goatcounter?.count({ path: name, title: name, event: true });
  }
}
