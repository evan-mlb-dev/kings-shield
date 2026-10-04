import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import { Component, computed, inject, signal } from '@angular/core';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import { Pokemon } from '../../services/pokemon.models';
import { ParsedPokemon } from '../../services/save-file-parser';
import { GameStateService, MAX_TEAM_SIZE, pokemonKey } from '../../states/game-state';
import { TypeIcon } from '../../shared/icons/type-icon';
import { typeColor } from '../../shared/type-colors';
import { PokemonCard } from '../pokemon-card/pokemon-card';

interface Entry {
  key: string;
  parsed: ParsedPokemon;
  mon: Pokemon;
}

type DropData = number | Entry[];

export type SortKey = 'total' | 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

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

@Component({
  selector: 'app-team-builder',
  imports: [PokemonCard, TypeIcon, CdkDropListGroup, CdkDropList, CdkDrag, CdkDragPlaceholder],
  templateUrl: './team-builder.html',
  styleUrl: './team-builder.scss',
})
export class TeamBuilder {
  // services
  private db = inject(PokemonDb);
  // states
  protected gameState = inject(GameStateService);

  protected readonly maxTeamSize = MAX_TEAM_SIZE;

  protected readonly team = computed<Entry[]>(() =>
    this.gameState.team().map((p) => this.toEntry(p)),
  );
  private readonly pc = computed<Entry[]>(() => this.gameState.pc().map((p) => this.toEntry(p)));

  protected readonly slots = computed<(Entry | null)[]>(() =>
    Array.from({ length: MAX_TEAM_SIZE }, (_, i) => this.team()[i] ?? null),
  );

  protected readonly search = signal('');

  /** Selected types: a Pokémon must have all of them (max 2) */
  protected readonly typeFilters = signal<string[]>([]);
  protected readonly effectiveAgainst = signal<string | null>(null);
  protected readonly sortKey = signal<SortKey | null>(null);
  protected readonly sortDescending = signal(true);

  protected readonly sortOptions: readonly { key: SortKey; label: string }[] = [
    { key: 'total', label: 'Total' },
    { key: 'hp', label: 'HP' },
    { key: 'atk', label: 'Atk' },
    { key: 'def', label: 'Def' },
    { key: 'spa', label: 'SpA' },
    { key: 'spd', label: 'SpD' },
    { key: 'spe', label: 'Spe' },
  ];

  /** Every real type, for the filter chips ("???" left out) */
  protected readonly typeNames = [...this.db.types.keys()].filter((name) => name !== '???');
  protected readonly typeColor = typeColor;

  protected readonly hasFilters = computed(
    () =>
      !!this.search().trim() ||
      this.typeFilters().length > 0 ||
      this.effectiveAgainst() !== null ||
      this.sortKey() !== null,
  );

  private readonly matchups = computed<ReadonlyMap<string, Matchup>>(() => {
    const target = this.effectiveAgainst();
    const attacker = target ? this.db.types.get(target) : undefined;
    const map = new Map<string, Matchup>();
    if (!target || !attacker) return map;

    for (const e of this.pc()) {
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

  protected readonly matchupBadges = computed<ReadonlyMap<string, MatchupBadge[]>>(() => {
    const target = this.effectiveAgainst() ?? '';
    const badges = new Map<string, MatchupBadge[]>();
    for (const [key, m] of this.matchups()) {
      const list: MatchupBadge[] = [];
      if (m.stabMoveEffective) {
        list.push({
          label: 'Effective STAB move',
          title: `Knows a super effective move of its own type against ${target} (STAB ×1.5)`,
          kind: 'stab',
        });
      } else if (m.typeEffective) {
        list.push({
          label: 'Effective type',
          title: `One of its types is super effective against ${target}`,
          kind: 'offense',
        });
      }
      if (m.moveEffective && !m.stabMoveEffective) {
        list.push({
          label: 'Effective move',
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

  protected readonly visiblePc = computed<Entry[]>(() => {
    const query = this.search().trim().toLowerCase();
    const types = this.typeFilters();
    const matchups = this.matchups();
    const hasTarget = this.effectiveAgainst() !== null;

    let list = this.pc().filter(
      (e) =>
        (!query ||
          e.mon.nickname.toLowerCase().includes(query) ||
          e.mon.speciesName.toLowerCase().includes(query)) &&
        types.every((name) => e.mon.types.some((t) => t.name === name)) &&
        (!hasTarget || this.isEffective(matchups.get(e.key))),
    );

    const key = this.sortKey();
    if (key) {
      const sign = this.sortDescending() ? -1 : 1;
      list = [...list].sort((a, b) => sign * (this.statOf(a.mon, key) - this.statOf(b.mon, key)));
    } else if (hasTarget) {
      // No stat sort: best match-ups first
      list = [...list].sort(
        (a, b) => matchupScore(matchups.get(b.key)) - matchupScore(matchups.get(a.key)),
      );
    }
    return list;
  });

  /** Stat shown on each PC tile while sorting */
  protected statOf(mon: Pokemon, key: SortKey): number {
    if (key === 'total') return mon.baseStatTotal;
    return mon.baseStats?.[key] ?? 0;
  }

  protected isExcellentStat(value: number, key: SortKey): boolean {
    return value >= (key === 'total' ? TOTAL_EXCELLENT_FROM : STAT_EXCELLENT_FROM);
  }

  protected statHue(value: number, key: SortKey): number {
    const perStat = key === 'total' ? value / 6 : value;
    const ratio = (perStat - STAT_RED_UNTIL) / (STAT_CYAN_FROM - STAT_RED_UNTIL);
    return Math.round(Math.min(1, Math.max(0, ratio)) * 180);
  }

  protected isTypeSelected(name: string): boolean {
    return this.typeFilters().includes(name);
  }

  protected toggleType(name: string): void {
    this.typeFilters.update((selected) =>
      selected.includes(name)
        ? selected.filter((t) => t !== name)
        : [...selected, name].slice(-MAX_TYPE_FILTERS),
    );
  }

  protected toggleEffectiveAgainst(name: string): void {
    this.effectiveAgainst.update((current) => (current === name ? null : name));
  }

  private isEffective(m: Matchup | undefined): boolean {
    return !!m && (m.typeEffective || m.moveEffective);
  }

  protected setSort(key: SortKey | null): void {
    if (key === null || key !== this.sortKey()) {
      this.sortKey.set(key);
      this.sortDescending.set(true);
    } else if (this.sortDescending()) {
      this.sortDescending.set(false);
    } else {
      this.sortKey.set(null);
      this.sortDescending.set(true);
    }
  }

  protected clearFilters(): void {
    this.search.set('');
    this.typeFilters.set([]);
    this.effectiveAgainst.set(null);
    this.sortKey.set(null);
    this.sortDescending.set(true);
  }

  protected dropOnSlot(event: CdkDragDrop<number, DropData, Entry>): void {
    const target = event.container.data;
    const source = event.previousContainer.data;
    if (event.container === event.previousContainer) return;

    if (typeof source === 'number') {
      this.gameState.swapInTeam(source, target);
    } else {
      this.gameState.placeInTeam(event.item.data.parsed, target);
    }
  }

  protected dropOnPc(event: CdkDragDrop<Entry[], DropData, Entry>): void {
    if (event.previousContainer !== event.container) {
      this.gameState.removeFromTeam(event.item.data.parsed);
    }
  }

  protected add(entry: Entry): void {
    if (!this.gameState.isTeamFull()) this.gameState.addToTeam(entry.parsed);
  }

  protected remove(entry: Entry): void {
    this.gameState.removeFromTeam(entry.parsed);
  }

  private toEntry(parsed: ParsedPokemon): Entry {
    return { key: pokemonKey(parsed), parsed, mon: Pokemon.fromParsed(parsed, this.db) };
  }
}
