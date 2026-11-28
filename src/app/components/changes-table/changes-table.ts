import { Component, input } from '@angular/core';
import { PendingChange } from '../../states/save-editor-session';

@Component({
  selector: 'app-changes-table',
  template: `
    <div class="change-row head" role="row">
      <span role="columnheader">Pokémon</span>
      <span role="columnheader">Species</span>
      <span role="columnheader">Level</span>
      <span role="columnheader">Nature</span>
      <span role="columnheader">Shiny</span>
      <span role="columnheader">Ability</span>
      <span role="columnheader">Item</span>
      <span role="columnheader">Ball</span>
      <span role="columnheader">Friendship</span>
      <span role="columnheader">OT ID</span>
      <span role="columnheader">Moves</span>
    </div>
    @for (change of changes(); track change.key) {
      <div class="change-row" role="row">
        <b role="cell"
          >{{ change.name }}
          @if (change.renamedFrom) {
            <span class="evolved">(was {{ change.renamedFrom }})</span>
          }
        </b>
        <span role="cell" class="species"
          >{{ change.species }}
          @if (change.evolvedFrom) {
            <span class="evolved">(was {{ change.evolvedFrom }})</span>
          }
        </span>
        <span role="cell">{{ change.level ?? '—' }}</span>
        <span role="cell">{{ change.nature ?? '—' }}</span>
        <span role="cell">{{
          change.shiny === undefined ? '—' : change.shiny ? '★ Shiny' : 'Not shiny'
        }}</span>
        <span role="cell">{{ change.ability ?? '—' }}</span>
        <span role="cell">{{ change.item ?? '—' }}</span>
        <span role="cell">{{ change.ball ?? '—' }}</span>
        <span role="cell">{{ change.friendship ?? '—' }}</span>
        <span role="cell">{{ change.trainerId ?? '—' }}</span>
        <span role="cell">{{ change.moves?.join(', ') ?? '—' }}</span>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.72rem;
      /* Narrow screens: the table scrolls in its own box */
      overflow-x: auto;
    }

    .change-row {
      display: grid;
      grid-template-columns: 1.2fr 1.2fr 0.6fr 1fr 0.8fr 1fr 1fr 0.9fr 0.8fr 0.7fr 3fr;
      min-width: 800px;
      gap: 12px;
      align-items: baseline;
      padding: 3px 0;

      &:not(.head) {
        border-top: 1px solid rgb(255 255 255 / 6%);
      }

      &.head {
        font-size: 0.62rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.5;
      }

      b {
        color: #f0d58c;
      }
    }

    .species {
      opacity: 0.75;
    }

    .evolved {
      color: #b9f5c2;
    }
  `,
})
export class ChangesTable {
  readonly changes = input.required<readonly PendingChange[]>();
}
