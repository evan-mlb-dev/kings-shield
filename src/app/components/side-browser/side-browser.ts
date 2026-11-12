import { Component, computed, inject, input, linkedSignal, OnDestroy, output } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/** Only these sites may be shown in the panel */
const ALLOWED_ORIGINS = ['https://www.smogon.com'];

@Component({
  selector: 'app-side-browser',
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <aside class="panel" [attr.aria-label]="title()">
      <div class="actions">
        <a
          class="action tab-link"
          [href]="url()"
          target="_blank"
          rel="noopener noreferrer"
          title="Open in a new tab"
          aria-label="Open in a new tab"
          >↗</a
        >
        <button
          type="button"
          class="action close"
          title="Close (Esc)"
          aria-label="Close the panel"
          (click)="closed.emit()"
        >
          ×
        </button>
      </div>
      @if (safeUrl(); as src) {
        @if (loading()) {
          <div class="loading" role="status">
            <span class="spinner" aria-hidden="true"></span>
            Loading {{ title() }}…
          </div>
        }
        <iframe
          [src]="src"
          [title]="title()"
          [class.ready]="!loading()"
          referrerpolicy="no-referrer"
          (load)="onLoad()"
        ></iframe>
      }
    </aside>
  `,
  styleUrl: './side-browser.scss',
})
export class SideBrowser implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);

  readonly url = input.required<string>();
  readonly title = input('');
  readonly closed = output<void>();

  /** Shown until the page is loaded; again for each new page */
  protected readonly loading = linkedSignal(() => {
    this.url();
    return true;
  });

  private timer?: ReturnType<typeof setTimeout>;
  protected onLoad(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.loading.set(false), 250);
  }

  /** The iframe address, trusted only for the allowed sites */
  protected readonly safeUrl = computed(() => {
    const url = this.url();
    return ALLOWED_ORIGINS.some((origin) => url.startsWith(origin + '/'))
      ? this.sanitizer.bypassSecurityTrustResourceUrl(url)
      : null;
  });

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }
}
