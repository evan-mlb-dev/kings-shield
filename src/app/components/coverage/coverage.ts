import { Component, computed, inject, signal } from '@angular/core';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import { Pokemon, PokemonType } from '../../services/pokemon.models';
import { PokemonSprite } from '../../shared/icons/pokemon-sprite';
import { TypeIcon } from '../../shared/icons/type-icon';
import { defensiveScore, offensiveScore, scoreLabel } from '../../shared/coverage-score';
import { TYPE_ORDER } from '../../shared/type-order';
import { GameStateService, pokemonKey } from '../../states/game-state';
import { PcFiltersState } from '../../states/pc-filters';
import { SoulLinkService } from '../../states/soul-link';

export type CoverageTab = 'defensive' | 'offensive';

const COLLAPSED_KEY = 'king_shield_coverage_collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

const SOLID_RESIST_COUNT = 3;

const CRITICAL_WEAK_COUNT = 3;

/** One team member as a coverage column */
interface Member {
  key: string;
  mon: Pokemon;
}

interface Cell {
  multiplier: number | null;
  label: string;
  tone: 'great' | 'good' | 'bad' | 'awful' | 'immune' | 'neutral' | 'none';
  title: string;
}

interface Row {
  type: PokemonType;
  cells: Cell[];
  primary: number;
  secondary: number;
  warning: boolean;
  critical: boolean;
  solid: boolean;
}

@Component({
  imports: [PokemonSprite, TypeIcon],
  selector: 'app-coverage',
  styleUrl: './coverage.scss',
  templateUrl: './coverage.html',
})
export class Coverage {
  private db = inject(PokemonDb);
  private gameState = inject(GameStateService);
  private pcFilters = inject(PcFiltersState);

  protected filterPc(type: string): void {
    this.pcFilters.showEffectiveAgainst(type);
  }

  protected readonly tab = signal<CoverageTab>('defensive');

  protected readonly collapsed = signal(readCollapsed());

  protected toggleCollapsed(): void {
    this.collapsed.update((c) => !c);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(this.collapsed()));
    } catch {
      // Storage unavailable: the choice only lasts for this visit
    }
  }

  private readonly types: PokemonType[] = TYPE_ORDER.map((name) => this.db.types.get(name)).filter(
    (t): t is PokemonType => !!t,
  );

  private readonly soulLink = inject(SoulLinkService);

  private readonly teamMembers = computed<Member[]>(() =>
    this.gameState.team().map((p) => ({ key: pokemonKey(p), mon: Pokemon.fromParsed(p, this.db) })),
  );

  protected readonly preview = computed<Member | null>(() => {
    const pair = this.soulLink.active() ? this.soulLink.previewPair() : null;
    return pair
      ? { key: pokemonKey(pair.mine), mon: Pokemon.fromParsed(pair.mine, this.db) }
      : null;
  });

  /** Coverage columns: the team, plus the previewed pick */
  protected readonly members = computed<Member[]>(() => {
    const preview = this.preview();
    return preview ? [...this.teamMembers(), preview] : this.teamMembers();
  });

  private readonly baseScores = computed(() => {
    const mons = this.teamMembers().map((m) => m.mon);
    if (mons.length === 0) return { defense: 0, offense: 0 };
    return {
      defense: defensiveScore(
        this.types.map((t) => mons.map((mon) => defensiveCell(t, mon).multiplier ?? 1)),
      ),
      offense: offensiveScore(
        this.types.map((t) => mons.map((mon) => offensiveCell(t, mon).multiplier)),
      ),
    };
  });

  protected readonly defensiveRows = computed<Row[]>(() =>
    this.types.map((attacker) => {
      const cells = this.members().map(({ mon }) => defensiveCell(attacker, mon));
      const weak = cells.filter((c) => (c.multiplier ?? 1) > 1).length;
      const resist = cells.filter((c) => (c.multiplier ?? 1) < 1).length;
      const critical = weak >= CRITICAL_WEAK_COUNT;
      return {
        type: attacker,
        cells,
        primary: weak,
        secondary: resist,
        warning: critical || weak > resist,
        critical,
        solid: resist >= SOLID_RESIST_COUNT,
      };
    }),
  );

  protected readonly offensiveRows = computed<Row[]>(() =>
    this.types.map((defender) => {
      const cells = this.members().map(({ mon }) => offensiveCell(defender, mon));
      const superEffective = cells.filter((c) => (c.multiplier ?? 0) > 1).length;
      const poor = cells.filter((c) => c.multiplier !== null && c.multiplier < 1).length;
      return {
        type: defender,
        cells,
        primary: superEffective,
        secondary: poor,
        warning: this.members().length > 0 && superEffective === 0,
        critical: false,
        solid: false,
      };
    }),
  );

  protected readonly scores = computed(() => {
    if (this.members().length === 0) return null;
    const defense = defensiveScore(
      this.defensiveRows().map((r) => r.cells.map((c) => c.multiplier ?? 1)),
    );
    const offense = offensiveScore(
      this.offensiveRows().map((r) => r.cells.map((c) => c.multiplier)),
    );
    const base = this.baseScores();
    const preview = !!this.preview();
    return [
      {
        key: 'defense',
        label: 'Defense',
        value: defense,
        delta: preview ? defense - base.defense : null,
        grade: scoreLabel(defense),
        help: 'How well the team takes hits from each type: a good switch-in and few weak members',
      },
      {
        key: 'offense',
        label: 'Offense',
        value: offense,
        delta: preview ? offense - base.offense : null,
        grade: scoreLabel(offense),
        help: 'How well the team hits each type with its moves: super effective, by several members',
      },
    ];
  });

  /** Gauge color: red (0) -> yellow -> green -> cyan (100) */
  protected scoreHue(value: number): number {
    return Math.round(Math.min(1, Math.max(0, (value - 20) / 75)) * 180);
  }

  protected readonly rows = computed(() =>
    this.tab() === 'defensive' ? this.defensiveRows() : this.offensiveRows(),
  );

  protected readonly criticals = computed(() =>
    this.rows()
      .filter((r) => r.critical)
      .sort((a, b) => b.primary - a.primary)
      .map((r) => ({ name: r.type.name, count: r.primary })),
  );

  protected readonly solids = computed(() => {
    if (this.tab() === 'defensive') {
      return this.rows()
        .filter((r) => r.solid)
        .sort((a, b) => b.secondary - a.secondary)
        .map((r) => ({ name: r.type.name, count: r.secondary }));
    }
    return this.rows()
      .filter((r) => r.primary >= SOLID_RESIST_COUNT)
      .sort((a, b) => b.primary - a.primary)
      .map((r) => ({ name: r.type.name, count: r.primary }));
  });

  protected readonly warnings = computed(() =>
    this.rows()
      .filter((r) => r.warning && !r.critical)
      .map((r) => r.type.name),
  );
}

function defensiveCell(attacker: PokemonType, mon: Pokemon): Cell {
  const m = mon.types.reduce((acc, t) => acc * attacker.effectivenessAgainst(t.name), 1);
  const title = `${mon.nickname} takes ×${format(m)} from ${attacker.name} moves`;
  if (m === 0) return { multiplier: m, label: '0', tone: 'immune', title };
  if (m >= 4) return { multiplier: m, label: '4', tone: 'awful', title };
  if (m > 1) return { multiplier: m, label: '2', tone: 'bad', title };
  if (m <= 0.25) return { multiplier: m, label: '¼', tone: 'great', title };
  if (m < 1) return { multiplier: m, label: '½', tone: 'good', title };
  return { multiplier: m, label: '', tone: 'neutral', title };
}

function offensiveCell(defender: PokemonType, mon: Pokemon): Cell {
  const damaging = mon.moves.filter((m) => m.category !== 'status');
  if (damaging.length === 0) {
    return {
      multiplier: null,
      label: '—',
      tone: 'none',
      title: `${mon.nickname} has no damaging move`,
    };
  }
  const best = damaging.reduce(
    (top, move) => {
      const m = move.type.effectivenessAgainst(defender.name);
      return m > top.m ? { m, move } : top;
    },
    { m: -1, move: damaging[0] },
  );
  const title = `${mon.nickname}: best move vs ${defender.name} is ${best.move.name} (×${format(best.m)})`;
  if (best.m === 0) return { multiplier: 0, label: '0', tone: 'immune', title };
  if (best.m > 1) return { multiplier: best.m, label: '2', tone: 'good', title };
  if (best.m < 1) return { multiplier: best.m, label: '½', tone: 'bad', title };
  return { multiplier: best.m, label: '', tone: 'neutral', title };
}

function format(m: number): string {
  if (m === 0.5) return '0.5';
  if (m === 0.25) return '0.25';
  return String(m);
}
