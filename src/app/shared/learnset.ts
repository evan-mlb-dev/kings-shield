import learnsetsJson from '../data/learnsets.json';
import type { Move, PokemonLookup } from '../services/pokemon.models';
import { type MoveRandomizer, randomizeMove } from './move-randomizer';

interface LearnsetData {
  /** [tmNumber, moveId] */
  tms: [number, number][];
  tutors: [number, number, number, string][];
  /** [stage, boss, levelCap]: progress splits, in order */
  caps: [number, string, number][];
  species: Record<string, { levelup: [number, number][]; tm: number[]; tutor?: number[] }>;
}

const RADICAL_RED = learnsetsJson as unknown as LearnsetData;

interface Tables {
  data: LearnsetData;
  tmMoves: Map<number, number>;
  tutors: Map<number, { move: number; stage: number; place: string }>;
}
const tables = new WeakMap<LearnsetData, Tables>();

/** Learnsets of the game of the loaded save: Radical Red unless the lookup carries others */
function tablesFor(lookup?: PokemonLookup): Tables {
  const data = (lookup?.learnsets as LearnsetData | undefined) ?? RADICAL_RED;
  let t = tables.get(data);
  if (!t) {
    t = {
      data,
      tmMoves: new Map(data.tms),
      tutors: new Map(
        data.tutors.map(([index, move, stage, place]) => [index, { move, stage, place }]),
      ),
    };
    tables.set(data, t);
  }
  return t;
}

export function progressStage(levelCap: number, lookup?: PokemonLookup): number {
  const { caps } = tablesFor(lookup).data;
  // No progress splits known for this game: every tutor counts as reached
  if (!caps.length) return Number.MAX_SAFE_INTEGER;
  const next = caps.find(([, , cap]) => cap >= levelCap);
  return next ? next[0] : caps[caps.length - 1][0];
}

function bossBefore(stage: number, data: LearnsetData): string | null {
  const previous = data.caps.filter(([s]) => s < stage).pop();
  return previous ? previous[1].replace(/-\d+$/, '') : null;
}

export interface LearnableMove {
  move: Move;
  level: number | null;
  /** Taught by this TM number */
  tm: number | null;
  /** Taught by a move tutor, found there */
  tutorPlace?: string;
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
  stage: number | null = null,
  randomMoves: MoveRandomizer | null = null,
): LearnableMove[] {
  const t = tablesFor(lookup);
  const data = t.data.species[speciesId];
  if (!data) return [];
  const byMove = new Map<number, LearnableMove>();

  for (const [originalId, learnLevel] of data.levelup) {
    const moveId = randomizeMove(originalId, speciesId, randomMoves);
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
    const moveId = t.tmMoves.get(tm);
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

  for (const index of data.tutor ?? []) {
    const tutor = t.tutors.get(index);
    const move = tutor ? lookup.moves.get(tutor.move) : undefined;
    if (!tutor || !move) continue;
    const previous = byMove.get(move.id);
    if (previous?.available) continue;
    const reached = stage !== null && tutor.stage <= stage;
    const after = bossBefore(tutor.stage, t.data);
    const tutorNote = reached ? 'Tutor' : after ? `Tutor after ${after}` : 'Tutor';
    byMove.set(move.id, {
      move,
      level: previous?.level ?? null,
      tm: previous?.tm ?? null,
      available: reached,
      note: previous && !reached ? `${previous.note} · ${tutorNote}` : tutorNote,
      tutorPlace: tutor.place,
    });
  }

  return [...byMove.values()].sort(
    (a, b) =>
      Number(b.available) - Number(a.available) ||
      (b.move.power ?? 0) - (a.move.power ?? 0) ||
      a.move.name.localeCompare(b.move.name),
  );
}
