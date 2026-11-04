import { Component, input, output } from '@angular/core';

export interface AbilityOption {
  /** 0 / 1: ability 1 / 2, 2: hidden */
  choice: number;
  name: string;
  /** Can be picked: the needed items are in the bag */
  allowed: boolean;
  /** Items missing from the bag */
  missing: string[];
}

@Component({
  selector: 'app-ability-picker',
  template: `
    <label class="label" for="edit-ability">Ability</label>
    <div class="column">
      <select
        id="edit-ability"
        class="text-input"
        [disabled]="options().length < 2"
        [title]="lock() ?? ''"
        (change)="valueChange.emit(+$any($event.target).value)"
      >
        @for (option of options(); track option.choice) {
          <option
            [value]="option.choice"
            [selected]="value() === option.choice"
            [disabled]="!option.allowed"
          >
            {{ option.name }}{{ option.allowed ? '' : ' · needs ' + option.missing.join(' + ') }}
          </option>
        }
      </select>
      <div class="info" [title]="description()">
        <span class="description">{{ description() }}</span>
      </div>
    </div>
  `,
  styles: `
    .label {
      align-self: flex-start;
      width: 70px;
      padding-top: 9px;
      font-size: 0.75rem;
      opacity: 0.7;
    }

    .column {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
      width: 320px;
    }

    select {
      width: 100%;
      min-width: 0;
    }

    select:disabled {
      cursor: default;
      opacity: 0.45;
    }

    .info {
      display: grid;
      align-content: start;
      gap: 2px;
      height: 2.5em;
      overflow: hidden;
      font-size: 0.72rem;
      line-height: 1.25;
    }

    .description {
      display: -webkit-box;
      overflow: hidden;
      opacity: 0.55;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
  `,
})
export class AbilityPicker {
  readonly options = input.required<readonly AbilityOption[]>();
  readonly value = input.required<number>();
  readonly description = input('');
  readonly lock = input<string | null>(null);
  readonly valueChange = output<number>();
}
