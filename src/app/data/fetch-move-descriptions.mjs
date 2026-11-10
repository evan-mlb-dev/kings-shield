// Usage:  node src/app/data/fetch-move-descriptions.mjs [movesFile]

import { readFile, writeFile } from 'node:fs/promises';

const file = process.argv[2] ?? new URL('./moves.json', import.meta.url);
const TEXT_URL =
  'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/text/moves.ts';

/** Showdown ID: lowercase ASCII letters and digits */
const toId = (name) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const res = await fetch(TEXT_URL);
if (!res.ok) throw new Error(`${TEXT_URL}: HTTP ${res.status}`);
const source = await res.text();

const texts = new Map();
let current = null;
for (const line of source.split('\n')) {
  const entry = /^\t([a-z0-9]+): \{$/.exec(line);
  if (entry) {
    current = { desc: null, shortDesc: null };
    texts.set(entry[1], current);
    continue;
  }
  const field = /^\t\t(desc|shortDesc): ("(?:[^"\\]|\\.)*"),?$/.exec(line);
  if (field && current) current[field[1]] = JSON.parse(field[2]);
}

const moves = JSON.parse(await readFile(file, 'utf8'));
const missing = [];
for (const move of moves) {
  const text = texts.get(toId(move.name));
  const description = text?.shortDesc ?? text?.desc;
  if (description) move.description = description;
  else missing.push(move.name);
}

await writeFile(file, JSON.stringify(moves));
console.log(`${moves.length - missing.length}/${moves.length} descriptions from Smogon`);
if (missing.length) console.log(`Kept in-game: ${missing.join(', ')}`);
