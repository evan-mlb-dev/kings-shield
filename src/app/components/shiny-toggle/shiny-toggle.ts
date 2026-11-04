import { Component, model } from '@angular/core';

/** Shiny on / off switch: a pill, gold and glowing when on */
@Component({
  selector: 'app-shiny-toggle',
  template: `
    <button
      type="button"
      [attr.aria-pressed]="value()"
      [title]="value() ? 'Shiny: click to make it normal' : 'Make it shiny'"
      (click)="value.set(!value())"
    >
      <span class="star" aria-hidden="true">★</span> Shiny
    </button>
  `,
  styleUrl: './shiny-toggle.scss',
})
export class ShinyToggle {
  readonly value = model(false);
}
