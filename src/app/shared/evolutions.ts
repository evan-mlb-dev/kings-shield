import evolutionsJson from '../data/evolutions.json';
import type { PokemonLookup } from '../services/pokemon.models';

const LEVEL_METHODS = new Set([4, 8, 9, 10, 11, 12, 13]);
const FRIENDSHIP_METHODS = new Set([1, 2, 3]);
const LEVEL_NOTES: Readonly<Record<number, string>> = {
  8: ' (Atk > Def)',
  9: ' (Atk = Def)',
  10: ' (Atk < Def)',
};

const EVOLUTIONS = evolutionsJson as unknown as Record<string, [number, number, number][]>;

export interface Evolution {
  speciesId: number;
  name: string;
  how: string;
  level: number | null;
  kind: 'level' | 'friendship' | 'other';
  via?: string;
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
          : first.kind === 'level' || second.kind === 'level'
            ? 'level'
            : 'friendship',
      via: first.name,
    })),
  );
  const seen = new Set(direct.map((e) => e.speciesId));
  return [...direct, ...twoSteps.filter((e) => !seen.has(e.speciesId) && seen.add(e.speciesId))];
}

function directEvolutionsOf(speciesId: number, lookup: PokemonLookup): Evolution[] {
  const seen = new Set<number>();
  return (EVOLUTIONS[speciesId] ?? [])
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
          : ('other' as const),
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
    case 6:
    case 7:
      return `${method === 6 ? 'Trade holding' : 'Use'} ${lookup.items.get(param)?.name ?? 'an item'}`;
    default:
      return 'Special condition';
  }
}
