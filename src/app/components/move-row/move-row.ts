import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { Component, computed, ElementRef, inject, input, OnDestroy, signal } from '@angular/core';
import type { Move } from '../../services/pokemon.models';
import { MoveCategoryIcon } from '../../shared/icons/move-category-icon';
import { typeColor } from '../../shared/type-colors';

@Component({
  selector: 'app-move-row',
  imports: [MoveCategoryIcon, OverlayModule],
  template: `
    @if (move(); as move) {
      <app-move-category-icon [category]="move.category" />
      <span class="name">{{ move.name }}</span>
      <ng-content />
      <span class="accuracy">{{ move.accuracy === null ? '—' : move.accuracy + '%' }}</span>
      <span class="power">{{ move.power ?? '—' }}</span>
    } @else {
      <span class="placeholder">{{ placeholder() }}</span>
    }

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="host"
      [cdkConnectedOverlayOpen]="showTooltip() && !!move()"
      [cdkConnectedOverlayPositions]="positions"
    >
      @if (move(); as move) {
        <div class="move-tooltip" role="tooltip" [style.--move-color]="color()">
          <div class="tooltip-head">
            <app-move-category-icon [category]="move.category" />
            <b>{{ move.name }}</b>
            <span class="tooltip-type">{{ move.type.name }}</span>
          </div>
          <dl class="tooltip-stats">
            <div>
              <dt>Power</dt>
              <dd>{{ move.power ?? '—' }}</dd>
            </div>
            <div>
              <dt>Accuracy</dt>
              <dd>{{ move.accuracy === null ? '—' : move.accuracy + '%' }}</dd>
            </div>
            <div>
              <dt>PP</dt>
              <dd>{{ move.basePp }}</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{{ move.category }}</dd>
            </div>
          </dl>
          @if (move.description) {
            <p class="tooltip-text">{{ move.description }}</p>
          }
          @if (hint(); as hint) {
            <p class="tooltip-hint">{{ hint }}</p>
          }
        </div>
      }
    </ng-template>
  `,
  host: {
    '[class.empty]': '!move()',
    '[style.--move-color]': 'color()',
    '(mouseenter)': 'openSoon()',
    '(mouseleave)': 'close()',
    '(mousedown)': 'close()',
  },
  styles: `
    :host {
      --move-color: #555;

      display: flex;
      gap: 8px;
      align-items: center;
      min-height: 32px;
      padding: 2px 10px 2px 8px;
      font-size: 0.78rem;
      background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--move-color) 45%, rgb(0 0 0 / 30%)),
        color-mix(in srgb, var(--move-color) 15%, rgb(0 0 0 / 30%))
      );
      border-left: 3px solid var(--move-color);
      border-radius: 6px;
    }

    :host(.empty) {
      justify-content: center;
      font-size: 0.7rem;
      background: rgb(0 0 0 / 20%);
      border-left-color: rgb(255 255 255 / 10%);
      opacity: 0.5;
    }

    app-move-category-icon {
      flex-shrink: 0;
      width: 32px;
    }

    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .accuracy,
    .power {
      flex-shrink: 0;
      min-width: 28px;
      font-size: 0.76rem;
      font-weight: 700;
      text-align: right;
    }

    .move-tooltip {
      --move-color: #555;

      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 280px;
      padding: 12px 14px;
      font-size: 0.72rem;
      line-height: 1.45;
      color: #e8e8f0;
      pointer-events: none;
      background: var(--bg-dark, #121212);
      border: 1px solid color-mix(in srgb, var(--move-color) 70%, transparent);
      border-top: 3px solid var(--move-color);
      border-radius: 10px;
      box-shadow: 0 10px 30px rgb(0 0 0 / 60%);
    }

    .tooltip-head {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 0.85rem;
    }

    .tooltip-type {
      padding: 1px 8px;
      margin-left: auto;
      font-size: 0.65rem;
      text-transform: uppercase;
      background: color-mix(in srgb, var(--move-color) 45%, transparent);
      border-radius: 999px;
    }

    .tooltip-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      margin: 0;

      div {
        padding: 4px;
        text-align: center;
        background: rgb(255 255 255 / 5%);
        border-radius: 6px;
      }

      dt {
        font-size: 0.58rem;
        text-transform: uppercase;
        opacity: 0.55;
      }

      dd {
        margin: 0;
        font-weight: 700;
        text-transform: capitalize;
      }
    }

    .tooltip-text {
      margin: 0;
      opacity: 0.85;
    }

    .tooltip-hint {
      padding-top: 6px;
      margin: 0;
      color: #f0d58c;
      border-top: 1px solid rgb(255 255 255 / 10%);
    }

    .accuracy {
      min-width: 40px;
      color: #cfe3ff;
    }

    .power {
      color: #fff;
    }
  `,
})
export class MoveRow implements OnDestroy {
  readonly move = input<Move | null>(null);
  /** Shown when there is no move */
  readonly placeholder = input('—');
  readonly hint = input<string | null>(null);

  protected readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly showTooltip = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** Below the row, or above it when there is no room */
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  ];

  protected openSoon(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.showTooltip.set(true), 350);
  }

  protected close(): void {
    clearTimeout(this.timer);
    this.showTooltip.set(false);
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  protected readonly color = computed(() => {
    const move = this.move();
    return move ? typeColor(move.type.name) : null;
  });
}
