import { Component, computed, inject, input } from '@angular/core';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import type { Move, PokemonType } from '../../services/pokemon.models';
import { TypeIcon } from '../../shared/icons/type-icon';
import { TYPE_ORDER } from '../../shared/type-order';

interface TypeMark {
  name: string;
  stab?: boolean;
  /** Takes no damage from it */
  immune?: boolean;
}

@Component({
  selector: 'app-mon-coverage',
  imports: [TypeIcon],
  template: `
    @for (row of rows(); track row.label) {
      <div class="row" [class]="row.kind">
        <span class="label">{{ row.label }}</span>
        <span class="types">
          @for (t of row.types; track t.name) {
            <span
              class="type"
              [class.stab]="t.stab"
              [class.immune]="t.immune"
              [title]="t.name + (t.stab ? ' (STAB)' : '') + (t.immune ? ' (immune)' : '')"
            >
              <app-type-icon [name]="t.name" variant="square" />
            </span>
          } @empty {
            <span class="none">—</span>
          }
        </span>
      </div>
    }
  `,
  styleUrl: './mon-coverage.scss',
})
export class MonCoverage {
  private readonly db = inject(PokemonDb);

  readonly types = input.required<readonly PokemonType[]>();
  /** Its moves (null: empty slot) */
  readonly moves = input.required<readonly (Move | null)[]>();

  private readonly allTypes = computed(() =>
    TYPE_ORDER.map((name) => this.db.types.get(name)).filter((t): t is PokemonType => !!t),
  );

  private taken(attacker: PokemonType): number {
    return this.types().reduce((m, t) => m * attacker.effectivenessAgainst(t.name), 1);
  }

  protected readonly rows = computed(() => {
    const own = new Set(this.types().map((t) => t.name));
    const attacks = this.moves().filter((m): m is Move => !!m && m.category !== 'status');
    const hits: TypeMark[] = [];
    for (const defender of this.allTypes()) {
      const se = attacks.filter((m) => m.type.effectivenessAgainst(defender.name) >= 2);
      if (se.length) hits.push({ name: defender.name, stab: se.some((m) => own.has(m.type.name)) });
    }
    hits.sort((a, b) => Number(!!b.stab) - Number(!!a.stab));

    const taken = this.allTypes().map((t) => ({ name: t.name, x: this.taken(t) }));
    const marks = (list: { name: string; x: number }[]): TypeMark[] =>
      list.map((t) => ({ name: t.name, immune: t.x === 0 }));
    return [
      { label: 'Hits', kind: 'hits', types: hits },
      { label: 'Resists', kind: 'resists', types: marks(taken.filter((t) => t.x < 1)) },
      { label: 'Weak', kind: 'weak', types: marks(taken.filter((t) => t.x === 2)) },
      { label: 'Weak ×4', kind: 'very-weak', types: marks(taken.filter((t) => t.x >= 4)) },
    ];
  });
}
