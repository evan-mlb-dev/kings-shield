import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { Component, computed, ElementRef, inject, input, OnDestroy, signal } from '@angular/core';
import type { Move, MoveSpread } from '../../services/pokemon.models';
import { MoveCategoryIcon } from '../../shared/icons/move-category-icon';
import { TypeIcon } from '../../shared/icons/type-icon';
import { typeColor } from '../../shared/type-colors';

@Component({
  selector: 'app-move-row',
  imports: [MoveCategoryIcon, TypeIcon, OverlayModule],
  template: `
    @if (move(); as move) {
      <app-move-category-icon [category]="move.category" />
      <app-type-icon class="type" [name]="move.type.name" variant="square" />
      <span class="name">{{ move.name }}</span>
      <span class="spread-slot">
        @if (move.spread; as spread) {
          <svg
            class="spread"
            [class.all]="spread === 'all'"
            viewBox="0 0 18 14"
            role="img"
            [attr.aria-label]="spreadLabel(spread)"
          >
            <title>{{ spreadLabel(spread) }}</title>
            @if (spread === 'all') {
              <circle cx="4.5" cy="4" r="3" />
              <circle cx="13.5" cy="4" r="3" />
              <circle cx="9" cy="10.5" r="3" />
            } @else {
              <circle cx="4.5" cy="7" r="3.2" />
              <circle cx="13.5" cy="7" r="3.2" />
            }
          </svg>
        }
      </span>
      <ng-content />
      <span class="accuracy">{{ move.accuracy === null ? '—' : move.accuracy + '%' }}</span>
      <span
        class="power"
        [class.excellent]="excellent()"
        [style.color]="powerColor()"
        [attr.data-power]="move.power ?? '—'"
        >{{ move.power ?? '—' }}</span
      >
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
        <div
          class="move-tooltip"
          role="tooltip"
          [class.with-priority]="!!move.priority"
          [style.--move-color]="color()"
        >
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
            @if (move.priority) {
              <div class="priority" [class.negative]="move.priority < 0">
                <dt>Priority</dt>
                <dd>{{ move.priority > 0 ? '+' : '' }}{{ move.priority }}</dd>
              </div>
            }
          </dl>
          @if (move.description) {
            <p class="tooltip-text">{{ move.description }}</p>
          }
          @if (move.spread; as spread) {
            <p class="tooltip-spread" [class.all]="spread === 'all'">{{ spreadLabel(spread) }}</p>
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

    .spread-slot {
      display: flex;
      flex-shrink: 0;
      width: 18px;
    }

    .spread {
      width: 18px;
      height: 14px;
      fill: #ff8a82;
    }

    .spread.all,
    .tooltip-spread.all {
      fill: #f0c060;
      color: #f0c060;
    }

    .priority dd {
      font-weight: 700;
      color: #7ee08a;
    }

    .priority.negative dd {
      color: #ff8a82;
    }

    .tooltip-spread {
      margin: 0;
      font-size: 0.72rem;
      font-weight: 700;
      color: #ff8a82;
    }

    .type {
      --type-icon-size: 18px;

      margin-left: -2px;
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

    .move-tooltip.with-priority {
      width: 340px;
    }

    .tooltip-stats {
      display: grid;
      grid-auto-columns: 1fr;
      grid-auto-flow: column;
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
      position: relative;
      color: #fff;
    }

    .power.excellent {
      text-shadow: 0 0 6px rgb(255 200 60 / 55%);
      animation: power-glow 2.4s ease-in-out infinite;
    }

    .power.excellent::after {
      position: absolute;
      inset: 0;
      color: transparent;
      content: attr(data-power);
      background: linear-gradient(
          100deg,
          transparent 35%,
          rgb(255 255 255 / 95%) 50%,
          transparent 65%
        )
        no-repeat;
      background-clip: text;
      background-size: 250% 100%;
      animation: power-shine 2.4s ease-in-out infinite;
    }

    @keyframes power-shine {
      from {
        background-position: 100% 0;
      }
      60%,
      to {
        background-position: -150% 0;
      }
    }

    @keyframes power-glow {
      50% {
        text-shadow: 0 0 10px rgb(255 200 60 / 90%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .power.excellent,
      .power.excellent::after {
        animation: none;
      }
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

  protected readonly powerColor = computed(() => {
    const power = this.move()?.power;
    if (!power) return null;
    const strength = Math.round(Math.max(0, Math.min(1, (power - 40) / 80)) * 100);
    return `color-mix(in srgb, #ffc93c ${strength}%, #ffffff)`;
  });

  protected spreadLabel(spread: MoveSpread): string {
    return spread === 'all' ? 'Hits everyone around, ally included' : 'Hits both foes';
  }

  /** Excellent move (power 100+): animated */
  protected readonly excellent = computed(() => (this.move()?.power ?? 0) >= 100);

  protected readonly color = computed(() => {
    const move = this.move();
    return move ? typeColor(move.type.name) : null;
  });
}
