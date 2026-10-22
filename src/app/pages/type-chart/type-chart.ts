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
  /** 1 or 2 selected types (empty when nothing is selected) */
  names: string[];
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

  protected readonly selected = signal<string[]>([]);

  protected isSelected(name: string): boolean {
    return this.selected().includes(name);
  }

  protected select(name: string): void {
    this.selected.update((current) =>
      current.includes(name) ? current.filter((t) => t !== name) : [...current, name].slice(-2),
    );
  }

  protected clearSelection(): void {
    this.selected.set([]);
  }

  private readonly scoreRange = computeScoreRange(this.types);

  protected readonly tierLists: { title: string; tiers: { tier: string; types: string[] }[] }[] = [
    { title: 'Offensive', tiers: buildTiers(this.types, (t) => rawOffense([t], this.types)) },
    { title: 'Defensive', tiers: buildTiers(this.types, (t) => rawDefense([t], this.types)) },
  ];

  protected readonly typeScores = computed(() => {
    const types = this.selected()
      .map((n) => this.db.types.get(n))
      .filter((t): t is PokemonType => !!t);
    if (types.length === 0) return null;
    const { def, off } = this.scoreRange;
    const scale = (raw: number, r: { min: number; max: number }) =>
      Math.round(((raw - r.min) / (r.max - r.min)) * 100);
    const defense = scale(rawDefense(types, this.types), def);
    const offense = scale(rawOffense(types, this.types), off);
    return [
      {
        label: 'Defense',
        value: defense,
        help: 'Immunities and resistances minus weaknesses, compared with every single and dual type (100 = best)',
      },
      {
        label: 'Offense',
        value: offense,
        help: 'Types hit super effectively (best of the two types) minus resisted / immune ones, compared with every type (100 = best)',
      },
    ];
  });

  protected scoreHue(value: number): number {
    return Math.round(Math.min(1, Math.max(0, (value - 20) / 75)) * 180);
  }

  protected readonly details = computed<TypeDetails | null>(() => {
    const names = this.selected();
    const types = names.map((n) => this.db.types.get(n)).filter((t): t is PokemonType => !!t);
    if (types.length === 0) return null;

    const list = (m: (t: PokemonType) => number, wanted: (x: number) => boolean) =>
      this.types.filter((t) => wanted(m(t))).map((t) => t.name);
    const attacking = (t: PokemonType) =>
      Math.max(...types.map((a) => a.effectivenessAgainst(t.name)));
    const defending = (t: PokemonType) =>
      types.reduce((m, d) => m * t.effectivenessAgainst(d.name), 1);

    return {
      names: types.map((t) => t.name),
      offense: [
        {
          label: 'Super effective against',
          hint: '×2',
          types: list(attacking, (x) => x > 1),
          tone: 'good',
        },
        {
          label: 'Not very effective against',
          hint: '×½',
          types: list(attacking, (x) => x > 0 && x < 1),
          tone: 'bad',
        },
        { label: 'No effect on', hint: '×0', types: list(attacking, (x) => x === 0), tone: 'none' },
      ],
      defense: [
        { label: 'Very weak to', hint: '×4', types: list(defending, (x) => x >= 4), tone: 'bad' },
        {
          label: 'Weak to',
          hint: '×2',
          types: list(defending, (x) => x > 1 && x < 4),
          tone: 'bad',
        },
        {
          label: 'Resists',
          hint: '×½',
          types: list(defending, (x) => x > 0.25 && x < 1),
          tone: 'good',
        },
        {
          label: 'Strongly resists',
          hint: '×¼',
          types: list(defending, (x) => x > 0 && x <= 0.25),
          tone: 'good',
        },
        { label: 'Immune to', hint: '×0', types: list(defending, (x) => x === 0), tone: 'good' },
      ],
    };
  });

  protected readonly panel = computed<TypeDetails>(() => this.details() ?? EMPTY_DETAILS);

  protected hover(row: number | null, col: number | null): void {
    this.hoveredRow.set(row);
    this.hoveredCol.set(col);
  }

  protected cellTitle(row: Row, cell: Cell): string {
    return `${row.attacker.name} → ${cell.defender}: ×${formatMultiplier(cell.multiplier)} · click: select ${row.attacker.name} (2 types = dual type)`;
  }
}

const emptyGroup = (label: string, hint: string, tone: MatchupGroup['tone']): MatchupGroup => ({
  label,
  hint,
  types: [],
  tone,
});

const EMPTY_DETAILS: TypeDetails = {
  names: [],
  offense: [
    emptyGroup('Super effective against', '×2', 'good'),
    emptyGroup('Not very effective against', '×½', 'bad'),
    emptyGroup('No effect on', '×0', 'none'),
  ],
  defense: [
    emptyGroup('Very weak to', '×4', 'bad'),
    emptyGroup('Weak to', '×2', 'bad'),
    emptyGroup('Resists', '×½', 'good'),
    emptyGroup('Strongly resists', '×¼', 'good'),
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

function rawDefense(defender: readonly PokemonType[], all: readonly PokemonType[]): number {
  return all.reduce((sum, attacker) => {
    const m = defender.reduce((acc, d) => acc * attacker.effectivenessAgainst(d.name), 1);
    if (m === 0) return sum + 3;
    if (m <= 0.25) return sum + 1.5;
    if (m < 1) return sum + 1;
    if (m >= 4) return sum - 2;
    if (m > 1) return sum - 1;
    return sum;
  }, 0);
}

function rawOffense(attacker: readonly PokemonType[], all: readonly PokemonType[]): number {
  return all.reduce((sum, defender) => {
    const m = Math.max(...attacker.map((a) => a.effectivenessAgainst(defender.name)));
    if (m > 1) return sum + 1;
    if (m === 0) return sum - 1;
    if (m < 1) return sum - 0.5;
    return sum;
  }, 0);
}

const TIERS: readonly { tier: string; from: number }[] = [
  { tier: 'S', from: 80 },
  { tier: 'A', from: 60 },
  { tier: 'B', from: 40 },
  { tier: 'C', from: 20 },
  { tier: 'D', from: 0 },
];

function buildTiers(types: readonly PokemonType[], raw: (t: PokemonType) => number) {
  const scored = types.map((t) => ({ name: t.name, raw: raw(t) })).sort((a, b) => b.raw - a.raw);
  const min = Math.min(...scored.map((t) => t.raw));
  const max = Math.max(...scored.map((t) => t.raw));
  const score = (r: number) => (max === min ? 100 : ((r - min) / (max - min)) * 100);
  return TIERS.map(({ tier, from }, i) => {
    const to = i === 0 ? Infinity : TIERS[i - 1].from;
    return {
      tier,
      types: scored.filter((t) => score(t.raw) >= from && score(t.raw) < to).map((t) => t.name),
    };
  });
}

function computeScoreRange(all: readonly PokemonType[]) {
  const def = { min: Infinity, max: -Infinity };
  const off = { min: Infinity, max: -Infinity };
  for (let i = 0; i < all.length; i++) {
    for (let j = i; j < all.length; j++) {
      const combo = i === j ? [all[i]] : [all[i], all[j]];
      const d = rawDefense(combo, all),
        o = rawOffense(combo, all);
      def.min = Math.min(def.min, d);
      def.max = Math.max(def.max, d);
      off.min = Math.min(off.min, o);
      off.max = Math.max(off.max, o);
    }
  }
  return { def, off };
}

function formatMultiplier(m: number): string {
  return m === 0.5 ? '0.5' : String(m);
}
