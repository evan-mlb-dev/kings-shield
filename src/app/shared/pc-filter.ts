import { computed, signal, WritableSignal } from '@angular/core';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import { Pokemon } from '../services/pokemon.models';

export interface PcFilterEntry {
  key: string;
  mon: Pokemon;
}

export type SortKey = 'tier' | 'total' | 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

const DEFAULT_SORT: SortKey = 'total';

const TIER_ORDER = [
  'AG',
  'Uber',
  'OU',
  'UUBL',
  'UU',
  'RUBL',
  'RU',
  'NUBL',
  'NU',
  'PUBL',
  'PU',
  'ZUBL',
  'ZU',
  'NFE',
  'LC',
] as const;

export function tierRank(tier: string | null): number {
  const index = tier ? TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number]) : -1;
  return index < 0 ? 0 : TIER_ORDER.length - index;
}

const EXCELLENT_TIER_RANK = tierRank('OU');

const STAT_RED_UNTIL = 60;
const STAT_CYAN_FROM = 130;
const STAT_EXCELLENT_FROM = 150;
const TOTAL_EXCELLENT_FROM = 670;

const MAX_TYPE_FILTERS = 2;

export interface MatchupBadge {
  label: string;
  /** Full explanation, shown as a tooltip */
  title: string;
  kind: 'stab' | 'offense' | 'defense' | 'weak';
}

/** How a Pokémon fares against one type, on both sides */
interface Matchup {
  typeEffective: boolean;
  /** It knows a damaging move super effective against X */
  moveEffective: boolean;
  stabMoveEffective: boolean;
  defense: number;
}

const DEFENSE_BADGES: ReadonlyMap<number, MatchupBadge> = new Map([
  [0, { label: 'Immune', title: 'Takes no damage from', kind: 'defense' as const }],
  [
    0.25,
    {
      label: 'Double resist',
      title: 'Takes 4 times less damage from',
      kind: 'defense' as const,
    },
  ],
  [0.5, { label: 'Resists', title: 'Takes half damage from', kind: 'defense' as const }],
  [2, { label: 'Weak', title: 'Takes double damage from', kind: 'weak' as const }],
  [4, { label: 'Double weak', title: 'Takes 4 times more damage from', kind: 'weak' as const }],
]);

function matchupScore(m: Matchup | undefined): number {
  if (!m) return 0;
  const defense =
    m.defense === 0 ? 3 : m.defense < 1 ? (m.defense <= 0.25 ? 2 : 1) : m.defense > 1 ? -2 : 0;
  const offense =
    (m.typeEffective ? 4 : 0) + (m.moveEffective ? 4 : 0) + (m.stabMoveEffective ? 2 : 0);
  return offense + defense;
}

export class PcFilter<T extends PcFilterEntry = PcFilterEntry> {
  constructor(
    private readonly db: PokemonDb,
    private readonly source: () => readonly T[],
    readonly effectiveAgainst: WritableSignal<string | null> = signal(null),
    readonly manualOrder: WritableSignal<readonly string[] | null> = signal(null),
  ) {
    this.typeNames = [...db.types.keys()].filter((name) => name !== '???');
  }

  readonly search = signal('');

  /** Selected types: a Pokémon must have all of them (max 2) */
  readonly typeFilters = signal<string[]>([]);
  readonly sortKey = signal<SortKey>(DEFAULT_SORT);
  readonly sortDescending = signal(true);

  readonly isDefaultSort = computed(() => this.sortKey() === DEFAULT_SORT && this.sortDescending());

  readonly sortOptions: readonly { key: SortKey; label: string }[] = [
    { key: 'tier', label: 'Tier' },
    { key: 'hp', label: 'HP' },
    // Offense side by side, then defense side by side
    { key: 'atk', label: 'Atk' },
    { key: 'spa', label: 'SpA' },
    { key: 'def', label: 'Def' },
    { key: 'spd', label: 'SpD' },
    { key: 'spe', label: 'Spe' },
  ];

  /** Every real type, for the filter chips ("???" left out) */
  readonly typeNames: readonly string[];

  readonly hasFilters = computed(
    () =>
      !!this.search().trim() ||
      this.typeFilters().length > 0 ||
      this.effectiveAgainst() !== null ||
      !this.isDefaultSort(),
  );

  private readonly matchups = computed<ReadonlyMap<string, Matchup>>(() => {
    const target = this.effectiveAgainst();
    const attacker = target ? this.db.types.get(target) : undefined;
    const map = new Map<string, Matchup>();
    if (!target || !attacker) return map;

    for (const e of this.source()) {
      const effectiveMoves = e.mon.moves.filter(
        (m) => m.category !== 'status' && m.type.effectivenessAgainst(target) > 1,
      );
      map.set(e.key, {
        typeEffective: e.mon.types.some((t) => t.effectivenessAgainst(target) > 1),
        moveEffective: effectiveMoves.length > 0,
        stabMoveEffective: effectiveMoves.some((m) =>
          e.mon.types.some((t) => t.name === m.type.name),
        ),
        defense: e.mon.types.reduce((mult, t) => mult * attacker.effectivenessAgainst(t.name), 1),
      });
    }
    return map;
  });

  readonly matchupBadges = computed<ReadonlyMap<string, MatchupBadge[]>>(() => {
    const target = this.effectiveAgainst() ?? '';
    const badges = new Map<string, MatchupBadge[]>();
    for (const [key, m] of this.matchups()) {
      const list: MatchupBadge[] = [];
      if (m.stabMoveEffective) {
        list.push({
          label: 'STAB move',
          title: `Knows a super effective move of its own type against ${target} (STAB ×1.5)`,
          kind: 'stab',
        });
      } else if (m.typeEffective) {
        list.push({
          label: 'Type',
          title: `One of its types is super effective against ${target}`,
          kind: 'offense',
        });
      }
      if (m.moveEffective && !m.stabMoveEffective) {
        list.push({
          label: 'Move',
          title: `Knows a move that is super effective against ${target}`,
          kind: 'offense',
        });
      }
      const defense = DEFENSE_BADGES.get(m.defense);
      if (defense) {
        list.push({ ...defense, title: `${defense.title} ${target} (×${m.defense})` });
      }
      badges.set(key, list);
    }
    return badges;
  });

  readonly canReorder = computed(() => this.isDefaultSort() && this.effectiveAgainst() === null);

  /** The PC follows the order set by hand */
  readonly usesManualOrder = computed(() => this.canReorder() && !!this.manualOrder());

  private readonly baseOrder = computed<T[]>(() => {
    const byTotal = [...this.source()].sort(
      (a, b) => this.statOf(b.mon, DEFAULT_SORT) - this.statOf(a.mon, DEFAULT_SORT),
    );
    const manual = this.manualOrder();
    if (!manual) return byTotal;
    const rank = new Map(manual.map((key, i) => [key, i]));
    return [...byTotal].sort(
      (a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity) || 0,
    );
  });

  reorder(movedKey: string, targetKey: string): void {
    if (movedKey === targetKey || !this.canReorder()) return;
    const keys = this.baseOrder().map((e) => e.key);
    const from = keys.indexOf(movedKey);
    const to = keys.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    keys.splice(from, 1);
    keys.splice(to, 0, movedKey);
    this.manualOrder.set(keys);
  }

  /** Back to the order by base stat total */
  resetOrder(): void {
    this.manualOrder.set(null);
  }

  readonly visible = computed<T[]>(() => {
    const query = this.search().trim().toLowerCase();
    const types = this.typeFilters();
    const matchups = this.matchups();
    const hasTarget = this.effectiveAgainst() !== null;

    let list = this.source().filter(
      (e) =>
        (!query ||
          e.mon.nickname.toLowerCase().includes(query) ||
          e.mon.speciesName.toLowerCase().includes(query)) &&
        types.every((name) => e.mon.types.some((t) => t.name === name)) &&
        (!hasTarget || this.isEffective(matchups.get(e.key))),
    );

    const key = this.sortKey();
    if (hasTarget && this.isDefaultSort()) {
      list = [...list].sort(
        (a, b) =>
          matchupScore(matchups.get(b.key)) - matchupScore(matchups.get(a.key)) ||
          this.statOf(b.mon, key) - this.statOf(a.mon, key),
      );
    } else if (this.usesManualOrder()) {
      // Order set by hand, filters applied on top
      const rank = new Map(this.baseOrder().map((e, i) => [e.key, i]));
      list = [...list].sort((a, b) => rank.get(a.key)! - rank.get(b.key)!);
    } else {
      const sign = this.sortDescending() ? -1 : 1;
      list = [...list].sort((a, b) => sign * (this.statOf(a.mon, key) - this.statOf(b.mon, key)));
    }
    return list;
  });

  statOf(mon: Pokemon, key: SortKey): number {
    if (key === 'tier') return tierRank(mon.tier);
    if (key === 'total') return mon.baseStatTotal;
    return mon.baseStats?.[key] ?? 0;
  }

  /** Text of the badge shown on each PC tile while sorting */
  badgeLabel(mon: Pokemon, key: SortKey): string {
    return key === 'tier' ? (mon.tier ?? '—') : String(this.statOf(mon, key));
  }

  isExcellentStat(value: number, key: SortKey): boolean {
    if (key === 'tier') return value >= EXCELLENT_TIER_RANK;
    return value >= (key === 'total' ? TOTAL_EXCELLENT_FROM : STAT_EXCELLENT_FROM);
  }

  statHue(value: number, key: SortKey): number {
    if (key === 'tier') {
      return Math.round(Math.min(1, Math.max(0, (value - 1) / (TIER_ORDER.length - 4))) * 180);
    }
    const perStat = key === 'total' ? value / 6 : value;
    const ratio = (perStat - STAT_RED_UNTIL) / (STAT_CYAN_FROM - STAT_RED_UNTIL);
    return Math.round(Math.min(1, Math.max(0, ratio)) * 180);
  }

  isTypeSelected(name: string): boolean {
    return this.typeFilters().includes(name);
  }

  toggleType(name: string): void {
    this.typeFilters.update((selected) =>
      selected.includes(name)
        ? selected.filter((t) => t !== name)
        : [...selected, name].slice(-MAX_TYPE_FILTERS),
    );
  }

  toggleEffectiveAgainst(name: string): void {
    this.effectiveAgainst.update((current) => (current === name ? null : name));
  }

  private isEffective(m: Matchup | undefined): boolean {
    return !!m && (m.typeEffective || m.moveEffective);
  }

  setSort(key: SortKey | null): void {
    this.sortKey.set(key === null || key === this.sortKey() ? DEFAULT_SORT : key);
    this.sortDescending.set(true);
  }

  clearFilters(): void {
    this.search.set('');
    this.typeFilters.set([]);
    this.effectiveAgainst.set(null);
    this.sortKey.set(DEFAULT_SORT);
    this.sortDescending.set(true);
  }
}
