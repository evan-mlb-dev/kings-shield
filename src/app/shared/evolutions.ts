import evolutionsJson from '../data/evolutions.json';
import type { PokemonLookup } from '../services/pokemon.models';

const LEVEL_METHODS = new Set([4, 8, 9, 10, 11, 12, 13, 22, 23, 28]);
const FRIENDSHIP_METHODS = new Set([1, 2, 3]);
const ITEM_METHOD = 7;
const MOVE_METHOD = 26;
const LEVEL_NOTES: Readonly<Record<number, string>> = {
  8: ' (Atk > Def)',
  9: ' (Atk = Def)',
  10: ' (Atk < Def)',
  22: ' (night)',
  23: ' (day)',
  28: ' (dusk)',
};

const RADICAL_RED = evolutionsJson as unknown as Record<string, [number, number, number][]>;

export interface Evolution {
  speciesId: number;
  name: string;
  how: string;
  level: number | null;
  kind: 'level' | 'friendship' | 'item' | 'move' | 'other';
  /** Items it needs (both steps of a two-step evolution) */
  items: number[];
  /** Moves it must know (both steps of a two-step evolution) */
  moves: number[];
  via?: string;
  viaId?: number;
}

export function evolutionsOf(speciesId: number, lookup: PokemonLookup): Evolution[] {
  const direct = directEvolutionsOf(speciesId, lookup);
  const twoSteps = direct.flatMap((first) =>
    directEvolutionsOf(first.speciesId, lookup).map((second): Evolution => ({
      speciesId: second.speciesId,
      name: second.name,
      how: `${first.how}, then ${second.how}`,
      level: Math.max(first.level ?? 0, second.level ?? 0) || null,
      kind:
        first.kind === 'other' || second.kind === 'other'
          ? 'other'
          : first.kind === 'item' || second.kind === 'item'
            ? 'item'
            : first.kind === 'move' || second.kind === 'move'
              ? 'move'
              : first.kind === 'level' || second.kind === 'level'
                ? 'level'
                : 'friendship',
      items: [...first.items, ...second.items],
      moves: [...first.moves, ...second.moves],
      via: first.name,
      viaId: first.speciesId,
    })),
  );
  const seen = new Set(direct.map((e) => e.speciesId));
  return [...direct, ...twoSteps.filter((e) => !seen.has(e.speciesId) && seen.add(e.speciesId))];
}

function directEvolutionsOf(speciesId: number, lookup: PokemonLookup): Evolution[] {
  const seen = new Set<number>();
  // Evolutions of the game of the loaded save: Radical Red unless the lookup carries others
  const evolutions =
    (lookup.evolutions as Record<string, [number, number, number][]> | undefined) ?? RADICAL_RED;
  return (evolutions[speciesId] ?? [])
    .filter(([, , target]) => lookup.species.has(target) && !seen.has(target) && seen.add(target))
    .map(([method, param, target]) => ({
      speciesId: target,
      name: lookup.species.get(target)!.name,
      how: describe(method, param, lookup),
      level: LEVEL_METHODS.has(method) ? param : null,
      kind: LEVEL_METHODS.has(method)
        ? ('level' as const)
        : FRIENDSHIP_METHODS.has(method)
          ? ('friendship' as const)
          : method === ITEM_METHOD
            ? ('item' as const)
            : method === MOVE_METHOD
              ? ('move' as const)
              : ('other' as const),
      items: method === ITEM_METHOD ? [param] : [],
      moves: method === MOVE_METHOD ? [param] : [],
    }));
}

function describe(method: number, param: number, lookup: PokemonLookup): string {
  if (LEVEL_METHODS.has(method)) return `Level ${param}${LEVEL_NOTES[method] ?? ''}`;
  switch (method) {
    case 1:
      return 'Friendship';
    case 2:
      return 'Friendship (day)';
    case 3:
      return 'Friendship (night)';
    case 5:
      return 'Trade';
    case MOVE_METHOD:
      return `Knows ${lookup.moves.get(param)?.name ?? 'a move'}`;
    case 6:
    case 7:
      return `${method === 6 ? 'Trade holding' : 'Use'} ${lookup.items.get(param)?.name ?? 'an item'}`;
    default:
      return 'Special condition';
  }
}
