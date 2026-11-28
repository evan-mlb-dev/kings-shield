import { Injectable, signal } from '@angular/core';
import {
  Ability,
  Item,
  Move,
  type MoveSpread,
  MoveCategory,
  Nature,
  NatureStat,
  PokemonLookup,
  PokemonType,
  SpeciesEntry,
} from '../../services/pokemon.models';
import type { Stats } from '../../services/save-file-parser';
import type { GameId } from '../../services/save-file-parser';

import abilitiesJson from '../../data/abilities.json';
import itemsJson from '../../data/items.json';
import movesJson from '../../data/moves.json';
import naturesJson from '../../data/natures.json';
import speciesJson from '../../data/species.json';
import growthRatesJson from '../../data/growth-rates.json';
import growthRateOverridesJson from '../../data/growth-rate-overrides.json';
import smogonJson from '../../data/smogon.json';
import typesJson from '../../data/types.json';
import type { GrowthRate } from '../../shared/experience';

interface RawSpecies {
  dex: number;
  name: string;
  types: string[];
  abilityIds: number[];
  baseStats: Stats;
  /** Given directly by the Unbound data, worked out from the Pokédex number for Radical Red */
  growthRate?: string | null;
}

interface RawMove {
  id: number;
  name: string;
  type: string;
  category: string;
  power: number | null;
  accuracy: number | null;
  pp: number;
  description: string;
  spread?: string;
  priority?: number;
}

interface RawNamed {
  id: number;
  name: string;
  description: string;
}

/** Everything that differs between the supported games */
interface GameData {
  species: Record<string, RawSpecies>;
  moves: RawMove[];
  abilities: RawNamed[];
  items: RawNamed[];
  /** Unset for Radical Red: the learnset and evolution modules carry its data */
  learnsets?: unknown;
  evolutions?: unknown;
  smogon: Record<string, { tier: string; path: string }>;
  /** Species shown with the sprite of another (Radical Red) species ID */
  sprites?: Record<string, number>;
  /** Items shown with the icon of another (Radical Red) item ID */
  itemIcons?: Record<string, number>;
  growthRate?: (s: RawSpecies) => GrowthRate | null;
}

const growthRates = growthRatesJson as Record<string, string>;
const growthOverrides = growthRateOverridesJson as Record<string, string | null>;

const RADICAL_RED: GameData = {
  species: speciesJson as Record<string, RawSpecies>,
  moves: movesJson as RawMove[],
  abilities: abilitiesJson,
  items: itemsJson,
  smogon: smogonJson as Record<string, { tier: string; path: string }>,
  growthRate: (s) =>
    s.name in growthOverrides
      ? (growthOverrides[s.name] as GrowthRate | null)
      : ((growthRates[s.dex] as GrowthRate | undefined) ?? null),
};

@Injectable({
  providedIn: 'root',
})
export class PokemonDb implements PokemonLookup {
  readonly types: ReadonlyMap<string, PokemonType>;
  readonly natures: readonly Nature[];
  // Filled again in place when the game changes, so every holder keeps the same maps
  readonly species = new Map<number, SpeciesEntry>();
  readonly moves = new Map<number, Move>();
  readonly abilities = new Map<number, Ability>();
  readonly items = new Map<number, Item>();

  /** Game whose data is loaded */
  readonly game = signal<GameId>('radical-red');

  /** Learnsets and evolutions of the loaded game, when it is not Radical Red */
  learnsets?: unknown;
  evolutions?: unknown;

  private sprites: Record<string, number> = {};
  private itemIcons: Record<string, number> = {};

  constructor() {
    const types = new Map<string, PokemonType>();
    for (const t of typesJson) {
      types.set(
        t.name,
        new PokemonType(t.id, t.name, t.strongAgainst, t.weakAgainst, t.noEffectAgainst),
      );
    }
    this.types = types;

    this.natures = naturesJson.map(
      (n) =>
        new Nature(
          n.id,
          n.name,
          n.increasedStat as NatureStat | null,
          n.decreasedStat as NatureStat | null,
        ),
    );

    this.fill(RADICAL_RED);
  }

  /** Loads the data of a game (Unbound's is downloaded the first time) */
  async useGame(game: GameId): Promise<void> {
    if (game === this.game()) return;
    const data =
      game === 'unbound'
        ? ((await import('../../data/unbound/game-data.json')).default as unknown as GameData)
        : RADICAL_RED;
    this.fill(data);
    this.game.set(game);
  }

  /** Species ID whose sprite shows this species */
  spriteId(speciesId: number): number {
    return this.sprites[speciesId] ?? speciesId;
  }

  /** Item ID whose icon shows this item */
  itemIconId(itemId: number): number {
    return this.itemIcons[itemId] ?? itemId;
  }

  private fill(data: GameData): void {
    const types = this.types;
    this.species.clear();
    for (const [id, s] of Object.entries(data.species)) {
      this.species.set(Number(id), {
        name: s.name,
        types: s.types.map((name) => types.get(name)).filter((t): t is PokemonType => !!t),
        abilityIds: s.abilityIds,
        baseStats: s.baseStats,
        growthRate: data.growthRate
          ? data.growthRate(s)
          : ((s.growthRate as GrowthRate | null | undefined) ?? null),
        tier: data.smogon[id]?.tier ?? null,
        smogonPath: data.smogon[id]?.path ?? null,
      });
    }

    this.moves.clear();
    for (const m of data.moves) {
      this.moves.set(
        m.id,
        new Move(
          m.id,
          m.name,
          types.get(m.type) ?? types.get('Normal')!,
          m.category as MoveCategory,
          m.power,
          m.accuracy,
          m.pp,
          m.description,
          (m.spread as MoveSpread | undefined) ?? null,
          m.priority ?? 0,
        ),
      );
    }

    this.abilities.clear();
    for (const a of data.abilities)
      this.abilities.set(a.id, new Ability(a.id, a.name, a.description));
    this.items.clear();
    for (const i of data.items) this.items.set(i.id, new Item(i.id, i.name, i.description));

    this.sprites = data.sprites ?? {};
    this.itemIcons = data.itemIcons ?? {};
    this.learnsets = data.learnsets;
    this.evolutions = data.evolutions;
  }
}
