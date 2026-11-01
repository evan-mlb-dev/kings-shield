import learnsetsJson from '../data/learnsets.json';
import type { Move, PokemonLookup } from '../services/pokemon.models';

interface LearnsetData {
  /** [tmNumber, moveId] */
  tms: [number, number][];
  species: Record<string, { levelup: [number, number][]; tm: number[] }>;
}

const DATA = learnsetsJson as unknown as LearnsetData;
const TM_MOVES = new Map(DATA.tms);

export interface LearnableMove {
  move: Move;
  level: number | null;
  /** Taught by this TM number */
  tm: number | null;
  /** Can be taught now: level reached, or TM in the bag */
  available: boolean;
  note: string;
}

export function ownedTmNumbers(itemIds: readonly number[], lookup: PokemonLookup): Set<number> {
  const owned = new Set<number>();
  for (const id of itemIds) {
    const match = /^(TM|HM)(\d+)$/.exec(lookup.items.get(id)?.name ?? '');
    if (match) owned.add(Number(match[2]) + (match[1] === 'HM' ? 120 : 0));
  }
  return owned;
}

/** "TM05", "HM02" (HMs come after the 120 TMs) */
export function tmLabel(tm: number): string {
  return tm > 120 ? `HM${String(tm - 120).padStart(2, '0')}` : `TM${String(tm).padStart(2, '0')}`;
}

export function learnableMoves(
  speciesId: number,
  level: number,
  ownedTms: ReadonlySet<number> | null,
  lookup: PokemonLookup,
): LearnableMove[] {
  const data = DATA.species[speciesId];
  if (!data) return [];
  const byMove = new Map<number, LearnableMove>();

  for (const [moveId, learnLevel] of data.levelup) {
    const move = lookup.moves.get(moveId);
    if (!move) continue;
    const previous = byMove.get(moveId);
    if (previous?.level !== null && previous?.level !== undefined && previous.level <= learnLevel) {
      continue;
    }
    const available = learnLevel <= level;
    byMove.set(moveId, {
      move,
      level: learnLevel,
      tm: null,
      available,
      note: learnLevel === 0 ? 'Evolution' : `Lv ${learnLevel}`,
    });
  }

  for (const tm of data.tm) {
    const moveId = TM_MOVES.get(tm);
    const move = moveId ? lookup.moves.get(moveId) : undefined;
    if (!move) continue;
    const owned = ownedTms?.has(tm) ?? false;
    const previous = byMove.get(move.id);
    if (previous?.available) continue;
    byMove.set(move.id, {
      move,
      level: previous?.level ?? null,
      tm,
      available: owned,
      note: owned
        ? tmLabel(tm)
        : previous
          ? `${previous.note} · ${tmLabel(tm)} not in the bag`
          : `${tmLabel(tm)} not in the bag`,
    });
  }

  return [...byMove.values()].sort(
    (a, b) =>
      Number(b.available) - Number(a.available) ||
      (b.move.power ?? 0) - (a.move.power ?? 0) ||
      a.move.name.localeCompare(b.move.name),
  );
}
