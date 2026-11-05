// Usage:  node src/app/data/fetch-move-targets.mjs [movesFile]

import { readFile, writeFile } from 'node:fs/promises';

const file = process.argv[2] ?? new URL('./moves.json', import.meta.url);
const MOVES_URL = 'https://play.pokemonshowdown.com/data/moves.js';
const SPREAD = { allAdjacent: 'all', allAdjacentFoes: 'foes' };

/** Showdown ID: lowercase ASCII letters and digits */
const toId = (name) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const res = await fetch(MOVES_URL);
if (!res.ok) throw new Error(`${MOVES_URL}: HTTP ${res.status}`);
const source = await res.text();

const targets = new Map();
const starts = [...source.matchAll(/"?([a-z0-9]+)"?:\{num:/g)];
starts.forEach((match, i) => {
  const end = starts[i + 1]?.index ?? source.length;
  const target = /target:"([a-zA-Z]+)"/.exec(source.slice(match.index, end))?.[1];
  if (target) targets.set(match[1], target);
});

const moves = JSON.parse(await readFile(file, 'utf8'));
const counts = { all: 0, foes: 0 };
for (const move of moves) {
  const spread = SPREAD[targets.get(toId(move.name))];
  delete move.spread;
  if (spread) {
    move.spread = spread;
    counts[spread]++;
  }
}

await writeFile(file, JSON.stringify(moves));
console.log(`${counts.all} moves hit everyone around, ${counts.foes} hit both foes`);
