import type { ParsedPokemon, Stats } from './save-file-parser';

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

/** An ability. Immutable once created. */
export class Ability {
  constructor(
    /** Radical Red internal ability ID */
    public readonly id: number,
    public readonly name: string,
    public readonly description: string,
  ) {
    Object.freeze(this);
  }
}

/** A held item. Immutable once created. */
export class Item {
  constructor(
    /** Radical Red internal item ID, as found in the save file */
    public readonly id: number,
    public readonly name: string,
    public readonly description: string,
  ) {
    Object.freeze(this);
  }
}

export type NatureStat = 'atk' | 'def' | 'spe' | 'spa' | 'spd';

export class Nature {
  constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly increasedStat: NatureStat | null,
    public readonly decreasedStat: NatureStat | null,
  ) {
    Object.freeze(this);
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

/** Species data needed to build a Pokémon. */
export interface SpeciesEntry {
  name: string;
  types: readonly PokemonType[];
  /** [hidden, ability 1, ability 2], 0 = empty slot */
  abilityIds: readonly number[];
  baseStats: Readonly<Stats>;
}

export interface PokemonLookup {
  species: ReadonlyMap<number, SpeciesEntry>;
  moves: ReadonlyMap<number, Move>;
  abilities: ReadonlyMap<number, Ability>;
  items: ReadonlyMap<number, Item>;
  natures: readonly Nature[];
}

export class Pokemon {
  readonly baseStatTotal: number;

  constructor(
    public readonly speciesId: number,
    public readonly speciesName: string,
    /** Nickname set by the player (may equal the species name) */
    public readonly nickname: string,
    public readonly types: readonly PokemonType[],
    public readonly moves: readonly Move[],
    public readonly ability: Ability | null,
    /** Null when there is no item or its ID is unknown */
    public readonly heldItem: Item | null,
    public readonly nature: Nature | null,
    public readonly level: number | null,
    public readonly experience: number,
    public readonly friendship: number,
    public readonly ivs: Readonly<Stats>,
    public readonly evs: Readonly<Stats>,
    public readonly isEgg: boolean,
    public readonly isShiny: boolean,
    public readonly location: 'party' | 'box',
    public readonly box: number | null,
    /** Party position (1-6) or box position (1-30) */
    public readonly slot: number,
    /** Species base stats; null when the species is unknown */
    public readonly baseStats: Readonly<Stats> | null = null,
  ) {
    Object.freeze(this.types);
    Object.freeze(this.moves);
    Object.freeze(this.ivs);
    Object.freeze(this.evs);
    this.baseStatTotal = baseStats
      ? baseStats.hp + baseStats.atk + baseStats.def + baseStats.spa + baseStats.spd + baseStats.spe
      : 0;
    Object.freeze(this);
  }

  static fromParsed(parsed: ParsedPokemon, lookup: PokemonLookup): Pokemon {
    const species = lookup.species.get(parsed.speciesId);
    const speciesName = species?.name ?? `Unknown #${parsed.speciesId}`;

    return new Pokemon(
      parsed.speciesId,
      speciesName,
      parsed.nickname || speciesName,
      species?.types ?? [],
      parsed.moves.map((id) => lookup.moves.get(id)).filter((m): m is Move => !!m),
      Pokemon.resolveAbility(species?.abilityIds ?? [], parsed.abilitySlot, lookup.abilities),
      lookup.items.get(parsed.heldItem) ?? null,
      lookup.natures[parsed.personality % 25] ?? null,
      parsed.level ?? null,
      parsed.experience,
      parsed.friendship,
      { ...parsed.ivs },
      { ...parsed.evs },
      parsed.isEgg,
      parsed.isShiny,
      parsed.location,
      parsed.box ?? null,
      parsed.slot,
      species?.baseStats ?? null,
    );
  }

  private static resolveAbility(
    abilityIds: readonly number[],
    slot: number,
    abilities: ReadonlyMap<number, Ability>,
  ): Ability | null {
    const id = abilityIds[1 + slot] || abilityIds[1] || 0;
    return abilities.get(id) ?? null;
  }
}
