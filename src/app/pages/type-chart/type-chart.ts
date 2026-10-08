import { Component, computed, inject, signal } from '@angular/core';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import { PokemonType } from '../../services/pokemon.models';
import { TypeIcon } from '../../shared/icons/type-icon';
import { TYPE_ORDER } from '../../shared/type-order';

interface Cell {
  defender: string;
  multiplier: number;
  label: string;
  kind: 'super' | 'resisted' | 'immune' | 'neutral';
}

interface TypeDetails {
  name: string;
  offense: MatchupGroup[];
  defense: MatchupGroup[];
}

interface MatchupGroup {
  label: string;
  hint: string;
  types: string[];
  tone: 'good' | 'bad' | 'none';
}

interface Row {
  attacker: PokemonType;
  cells: Cell[];
}

@Component({
  selector: 'app-type-chart-page',
  imports: [TypeIcon],
  templateUrl: './type-chart.html',
  styleUrl: './type-chart.scss',
})
export class TypeChartPage {
  private db = inject(PokemonDb);

  /** Types in the official order ("???" left out) */
  protected readonly types: PokemonType[] = TYPE_ORDER.map((name) =>
    this.db.types.get(name),
  ).filter((t): t is PokemonType => !!t);

  protected readonly rows: Row[] = this.types.map((attacker) => ({
    attacker,
    cells: this.types.map((defender) => toCell(attacker, defender.name)),
  }));

  protected readonly hoveredRow = signal<number | null>(null);
  protected readonly hoveredCol = signal<number | null>(null);

  protected readonly hoverLabel = computed(() => {
    const r = this.hoveredRow();
    const c = this.hoveredCol();
    if (r === null || c === null) return null;
    const cell = this.rows[r].cells[c];
    return `${this.rows[r].attacker.name} → ${cell.defender}: ×${formatMultiplier(cell.multiplier)}`;
  });

  protected readonly selected = signal<string | null>(null);

  protected select(name: string): void {
    this.selected.update((current) => (current === name ? null : name));
  }

  protected readonly details = computed<TypeDetails | null>(() => {
    const name = this.selected();
    const type = name ? this.db.types.get(name) : undefined;
    if (!name || !type) return null;

    // As attacker: its row; as defender: its column
    const vs = (m: (t: PokemonType) => number, wanted: (x: number) => boolean) =>
      this.types.filter((t) => wanted(m(t))).map((t) => t.name);
    const attacking = (t: PokemonType) => type.effectivenessAgainst(t.name);
    const defending = (t: PokemonType) => t.effectivenessAgainst(name);

    return {
      name,
      offense: [
        {
          label: 'Super effective against',
          hint: '×2',
          types: vs(attacking, (x) => x > 1),
          tone: 'good',
        },
        {
          label: 'Not very effective against',
          hint: '×½',
          types: vs(attacking, (x) => x > 0 && x < 1),
          tone: 'bad',
        },
        { label: 'No effect on', hint: '×0', types: vs(attacking, (x) => x === 0), tone: 'none' },
      ],
      defense: [
        { label: 'Weak to', hint: '×2', types: vs(defending, (x) => x > 1), tone: 'bad' },
        { label: 'Resists', hint: '×½', types: vs(defending, (x) => x > 0 && x < 1), tone: 'good' },
        { label: 'Immune to', hint: '×0', types: vs(defending, (x) => x === 0), tone: 'good' },
      ],
    };
  });

  protected readonly panel = computed<TypeDetails>(() => this.details() ?? EMPTY_DETAILS);

  protected hover(row: number | null, col: number | null): void {
    this.hoveredRow.set(row);
    this.hoveredCol.set(col);
  }

  protected cellTitle(row: Row, cell: Cell): string {
    return `${row.attacker.name} → ${cell.defender}: ×${formatMultiplier(cell.multiplier)}`;
  }
}

const emptyGroup = (label: string, hint: string, tone: MatchupGroup['tone']): MatchupGroup => ({
  label,
  hint,
  types: [],
  tone,
});

const EMPTY_DETAILS: TypeDetails = {
  name: '',
  offense: [
    emptyGroup('Super effective against', '×2', 'good'),
    emptyGroup('Not very effective against', '×½', 'bad'),
    emptyGroup('No effect on', '×0', 'none'),
  ],
  defense: [
    emptyGroup('Weak to', '×2', 'bad'),
    emptyGroup('Resists', '×½', 'good'),
    emptyGroup('Immune to', '×0', 'good'),
  ],
};

function toCell(attacker: PokemonType, defender: string): Cell {
  const multiplier = attacker.effectivenessAgainst(defender);
  if (multiplier === 0) return { defender, multiplier, label: '0', kind: 'immune' };
  if (multiplier > 1) return { defender, multiplier, label: '2', kind: 'super' };
  if (multiplier < 1) return { defender, multiplier, label: '½', kind: 'resisted' };
  return { defender, multiplier, label: '', kind: 'neutral' };
}

function formatMultiplier(m: number): string {
  return m === 0.5 ? '0.5' : String(m);
}
