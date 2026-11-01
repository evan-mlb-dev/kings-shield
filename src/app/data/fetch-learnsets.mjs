// Usage:  node src/app/data/fetch-learnsets.mjs

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://raw.githubusercontent.com/JwowSquared/Radical-Red-Pokedex/master/data.js';

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Download failed: ${response.status}`);
const text = await response.text();

const table = /\},'tmMoves':\{([^}]*)\}/.exec(text);
if (!table) throw new Error('TM table not found');
const tms = table[1]
  .split(',')
  .map((pair) => pair.split(':').map(Number))
  .map(([index, move]) => [index + 1, move]);

const start = text.indexOf("'species':{");
const end = text.indexOf("},'moves'", start);
const section = text.slice(start, end > 0 ? end : undefined);
const numbers = (part, key) => {
  const match = new RegExp(`'${key}':(\\[[-\\d,\\[\\]]*\\])`).exec(part);
  return match ? JSON.parse(match[1]) : [];
};

const species = {};
for (const part of section.split(/(?=\{'ID':\d+,)/).slice(1)) {
  const id = Number(/^\{'ID':(\d+),/.exec(part)[1]);
  const levelup = numbers(part, 'levelupMoves').filter(([move]) => move > 0);
  const tm = numbers(part, 'tmMoves').map((index) => index + 1);
  if (levelup.length || tm.length) species[id] = { levelup, tm };
}

const out = join(dirname(fileURLToPath(import.meta.url)), 'learnsets.json');
await writeFile(out, JSON.stringify({ tms, species }));
console.log(`${tms.length} TMs, ${Object.keys(species).length} species -> ${out}`);
