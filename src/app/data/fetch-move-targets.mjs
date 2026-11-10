// Usage:  node src/app/data/fetch-move-targets.mjs [movesFile]

import { readFile, writeFile } from 'node:fs/promises';

const file = process.argv[2] ?? new URL('./moves.json', import.meta.url);
const MOVES_URL = 'https://play.pokemonshowdown.com/data/moves.js';
const SPREAD = { allAdjacent: 'all', allAdjacentFoes: 'foes' };

/** Showdown ID: lowercase ASCII letters and digits */
const toId = (name) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const res = await fetch(MOVES_URL);
if (!res.ok) throw new Error(`${MOVES_URL}: HTTP ${res.status}`);
const source = await res.text();

const targets = new Map();
const priorities = new Map();
const starts = [...source.matchAll(/"?([a-z0-9]+)"?:\{num:/g)];
starts.forEach((match, i) => {
  const end = starts[i + 1]?.index ?? source.length;
  const entry = source.slice(match.index, end);
  const target = /target:"([a-zA-Z]+)"/.exec(entry)?.[1];
  if (target) targets.set(match[1], target);
  const priority = /priority:(-?\d+)/.exec(entry)?.[1];
  if (priority) priorities.set(match[1], Number(priority));
});

const moves = JSON.parse(await readFile(file, 'utf8'));
const counts = { all: 0, foes: 0, priority: 0 };
for (const move of moves) {
  const id = toId(move.name);
  const spread = SPREAD[targets.get(id)];
  delete move.spread;
  if (spread) {
    move.spread = spread;
    counts[spread]++;
  }
  delete move.priority;
  if (priorities.get(id)) {
    move.priority = priorities.get(id);
    counts.priority++;
  }
}

await writeFile(file, JSON.stringify(moves));
console.log(
  `${counts.all} moves hit everyone around, ${counts.foes} hit both foes, ` +
    `${counts.priority} have a priority`,
);
