import { Component, computed, input } from '@angular/core';
import { Pokemon } from '../../services/pokemon.models';
import { scoreLabel } from '../../shared/coverage-score';
import { PC_SCORE_DEPTH, pcScore } from '../../shared/pc-score';

let nextId = 0;

@Component({
  selector: 'app-pc-score',
  template: `
    <span class="pc-score" tabindex="0" [style.--hue]="hue()" [attr.aria-describedby]="tooltipId">
      PC score <b>{{ score() }}</b> · {{ grade() }}
      <span class="tooltip" role="tooltip" [id]="tooltipId">
        <b>PC score: how strong your reserve is</b>
        <span>
          The average strength of the {{ depth }} best Pokémon left in the PC, the team you could
          field if you had to replace yours.
        </span>
        <span>
          Each Pokémon is rated on its <b>base stat total</b> (60%) and its <b>Smogon tier</b>
          (40%). Without a tier, only its base stats count.
        </span>
        <span class="muted">
          Team members and fainted Pokémon are not counted. With fewer than {{ depth }}
          Pokémon, the missing ones count as 0.
        </span>
        <span class="scale">0–39 Poor · 40 Fair · 60 Good · 75 Great · 90 Excellent</span>
      </span>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      margin-left: auto;
    }

    .pc-score {
      position: relative;
      display: inline-block;
      padding: 3px 10px;
      font-size: 0.7rem;
      font-weight: normal;
      color: hsl(var(--hue) 80% 72%);
      white-space: nowrap;
      cursor: help;
      background: hsl(var(--hue) 60% 40% / 18%);
      border: 1px solid hsl(var(--hue) 70% 55% / 60%);
      border-radius: 999px;
      outline: none;

      &:focus-visible {
        box-shadow: 0 0 0 2px var(--primary-color);
      }
    }

    .tooltip {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 40;
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 290px;
      padding: 12px 14px;
      font-size: 0.7rem;
      line-height: 1.45;
      color: #e8e8f0;
      white-space: normal;
      pointer-events: none;
      visibility: hidden;
      background: var(--bg-dark, #121212);
      border: 1px solid hsl(var(--hue) 70% 55% / 50%);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgb(0 0 0 / 60%);
      opacity: 0;
      transition: opacity 0.15s ease;

      b {
        color: hsl(var(--hue) 80% 72%);
      }

      .pc-score:hover &,
      .pc-score:focus-visible & {
        visibility: visible;
        opacity: 1;
      }
    }

    .muted {
      opacity: 0.65;
    }

    .scale {
      padding-top: 6px;
      font-size: 0.62rem;
      border-top: 1px solid rgb(255 255 255 / 10%);
      opacity: 0.65;
    }
  `,
})
export class PcScore {
  readonly mons = input.required<readonly Pokemon[]>();
  protected readonly depth = PC_SCORE_DEPTH;
  protected readonly tooltipId = `pc-score-tooltip-${nextId++}`;

  protected readonly score = computed(() => pcScore(this.mons()));
  protected readonly grade = computed(() => scoreLabel(this.score()));
  protected readonly hue = computed(() =>
    Math.round(Math.min(1, Math.max(0, (this.score() - 20) / 75)) * 180),
  );
}
