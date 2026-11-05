import { Injectable } from '@angular/core';
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

import abilitiesJson from '../../data/abilities.json';
import itemsJson from '../../data/items.json';
import movesJson from '../../data/moves.json';
import naturesJson from '../../data/natures.json';
import speciesJson from '../../data/species.json';
import growthRatesJson from '../../data/growth-rates.json';
import smogonJson from '../../data/smogon.json';
import typesJson from '../../data/types.json';
import type { GrowthRate } from '../../shared/experience';

@Injectable({
  providedIn: 'root',
})
export class PokemonDb implements PokemonLookup {
  readonly types: ReadonlyMap<string, PokemonType>;
  readonly natures: readonly Nature[];
  readonly species: ReadonlyMap<number, SpeciesEntry>;
  readonly moves: ReadonlyMap<number, Move>;
  readonly abilities: ReadonlyMap<number, Ability>;
  readonly items: ReadonlyMap<number, Item>;

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

    const growthRates = growthRatesJson as Record<string, string>;
    const smogon = smogonJson as Record<string, { tier: string; slug: string }>;
    const species = new Map<number, SpeciesEntry>();
    for (const [id, s] of Object.entries(
      speciesJson as Record<
        string,
        { dex: number; name: string; types: string[]; abilityIds: number[]; baseStats: Stats }
      >,
    )) {
      species.set(Number(id), {
        name: s.name,
        types: s.types.map((name) => types.get(name)).filter((t): t is PokemonType => !!t),
        abilityIds: s.abilityIds,
        baseStats: s.baseStats,
        growthRate: (growthRates[s.dex] as GrowthRate | undefined) ?? null,
        tier: smogon[id]?.tier ?? null,
        smogonSlug: smogon[id]?.slug ?? null,
      });
    }
    this.species = species;

    const moves = new Map<number, Move>();
    for (const m of movesJson) {
      moves.set(
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
          (m as { spread?: MoveSpread }).spread ?? null,
        ),
      );
    }
    this.moves = moves;

    this.abilities = new Map(
      abilitiesJson.map((a) => [a.id, new Ability(a.id, a.name, a.description)]),
    );
    this.items = new Map(itemsJson.map((i) => [i.id, new Item(i.id, i.name, i.description)]));
  }
}
