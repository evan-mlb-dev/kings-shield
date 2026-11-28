import type { AbilityRandomizer } from '../../shared/ability-randomizer';
export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spe: number;
  spa: number;
  spd: number;
}

export interface ParsedPokemon {
  location: 'party' | 'box';
  region?: 'main' | 'extra';
  box?: number;
  slot: number;
  personality: number;
  trainerId: number;
  secretId: number;
  nickname: string;
  otName: string;
  language: number;
  speciesId: number;
  heldItem: number;
  experience: number;
  friendship: number;
  /** Ball it was caught in (shared/balls.ts numbering); missing in saves cached before */
  ball?: number;
  /** Move IDs (empty moves removed) */
  moves: number[];
  /** Remaining PP (party only) */
  pp: number[];
  ppBonuses: number;
  evs: Stats;
  ivs: Stats;
  isEgg: boolean;
  abilitySlot: number;
  /** Has the species' hidden ability (when it has one) */
  hiddenAbility?: boolean;
  /** Set when the run randomizes abilities: the species slots are remapped */
  randomAbilities?: AbilityRandomizer;
  /** Set when the run randomizes learnsets: level-up moves are remapped */
  randomMoves?: AbilityRandomizer;
  isShiny: boolean;
  metLocation: number;
  /** Party only */
  level?: number;
  currentHp?: number;
  stats?: { maxHp: number; atk: number; def: number; spa: number; spd: number; spe: number };
}

export class PokemonType {
  constructor(
    public readonly id: number,
    public readonly name: string,
    /** Types this type deals double damage to */
    public readonly strongAgainst: readonly string[] = [],
    /** Types this type deals half damage to */
    public readonly weakAgainst: readonly string[] = [],
    /** Types this type cannot damage at all */
    public readonly noEffectAgainst: readonly string[] = [],
  ) {
    Object.freeze(this);
  }

  effectivenessAgainst(defender: string): number {
    if (this.noEffectAgainst.includes(defender)) return 0;
    if (this.strongAgainst.includes(defender)) return 2;
    if (this.weakAgainst.includes(defender)) return 0.5;
    return 1;
  }
}

export type MoveCategory = 'physical' | 'special' | 'status';

/** A move (attack). Immutable once created. */
export class Move {
  constructor(
    /** Radical Red internal move ID, as found in the save file */
    public readonly id: number,
    public readonly name: string,
    public readonly type: PokemonType,
    public readonly category: MoveCategory,
    /** Base power, or null for status / variable-power moves */
    public readonly power: number | null,
    public readonly accuracy: number | null,
    public readonly basePp: number,
    public readonly description = '',
  ) {
    Object.freeze(this);
  }
}

export class Pokemon {
  constructor(
    public readonly speciesId: number,
    public readonly speciesName: string,
    /** Nickname set by the player (may equal the species name) */
    public readonly nickname: string,
    public readonly types: readonly PokemonType[],
    public readonly moves: readonly Move[],
    public readonly level: number | null,
    public readonly experience: number,
    public readonly heldItemId: number,
    public readonly friendship: number,
    public readonly ivs: Readonly<Stats>,
    public readonly evs: Readonly<Stats>,
    public readonly isEgg: boolean,
    public readonly isShiny: boolean,
    public readonly location: 'party' | 'box',
    public readonly box: number | null,
    /** Party position (1-6) or box position (1-30) */
    public readonly slot: number,
  ) {
    Object.freeze(this.types);
    Object.freeze(this.moves);
    Object.freeze(this.ivs);
    Object.freeze(this.evs);
    Object.freeze(this);
  }

  static fromParsed(
    parsed: ParsedPokemon,
    speciesTable: ReadonlyMap<number, { name: string; types: readonly PokemonType[] }>,
    moveTable: ReadonlyMap<number, Move>,
  ): Pokemon {
    const species = speciesTable.get(parsed.speciesId);
    const speciesName = species?.name ?? `Unknown #${parsed.speciesId}`;

    return new Pokemon(
      parsed.speciesId,
      speciesName,
      parsed.nickname || speciesName,
      species?.types ?? [],
      parsed.moves.map((id) => moveTable.get(id)).filter((m): m is Move => !!m),
      parsed.level ?? null,
      parsed.experience,
      parsed.heldItem,
      parsed.friendship,
      { ...parsed.ivs },
      { ...parsed.evs },
      parsed.isEgg,
      parsed.isShiny,
      parsed.location,
      parsed.box ?? null,
      parsed.slot,
    );
  }
}
