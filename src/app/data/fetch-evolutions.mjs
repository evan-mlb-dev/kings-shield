// Usage:  node src/app/data/fetch-evolutions.mjs

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://raw.githubusercontent.com/JwowSquared/Radical-Red-Pokedex/master/data.js';
const SKIPPED_METHODS = new Set([14, 254]);

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Download failed: ${response.status}`);
const text = await response.text();

const start = text.indexOf("'species':{");
const end = text.indexOf("},'moves'", start);
const section = text.slice(start, end > 0 ? end : undefined);
const evolutions = {};
for (const part of section.split(/(?=\{'ID':\d+,)/).slice(1)) {
  const id = Number(/^\{'ID':(\d+),/.exec(part)[1]);
  const match = /'evolutions':(\[(?:\[[-\d,]*\],?)*\])/.exec(part);
  if (!match) continue;
  const list = JSON.parse(match[1])
    .filter(([method, , target]) => target > 0 && !SKIPPED_METHODS.has(method))
    .map(([method, param, target]) => [method, param, target]);
  if (list.length) evolutions[id] = list;
}

const out = join(dirname(fileURLToPath(import.meta.url)), 'evolutions.json');
await writeFile(out, JSON.stringify(evolutions));
console.log(`${Object.keys(evolutions).length} species with evolutions -> ${out}`);
