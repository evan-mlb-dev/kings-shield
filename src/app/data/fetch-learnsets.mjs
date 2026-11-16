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

const tutorTable = /\},'tutorMoves':\{([^}]*)\}/.exec(text);
if (!tutorTable) throw new Error('Tutor table not found');
const tutorMoves = new Map(tutorTable[1].split(',').map((pair) => pair.split(':').map(Number)));

const tutorPlaces = new Map();
for (const match of text.matchAll(/'tutors':\{([^}]*)\}/g)) {
  const name = /'name':'((?:[^'\\]|\\.)*)'/.exec(text.slice(match.index))?.[1].replace(/\\'/g, "'");
  for (const [, stage, list] of match[1].matchAll(/(\d+):\[([\d,]*)\]/g)) {
    for (const index of list.split(',').filter(Boolean).map(Number)) {
      const known = tutorPlaces.get(index);
      if (!known || Number(stage) < known.stage)
        tutorPlaces.set(index, { stage: Number(stage), name });
    }
  }
}
const tutors = [...tutorPlaces]
  .filter(([index]) => tutorMoves.get(index) > 0)
  .sort(([a], [b]) => a - b)
  .map(([index, place]) => [index, tutorMoves.get(index), place.stage, place.name ?? '']);

const capsStart = text.indexOf("'caps':{");
const capsText = text.slice(capsStart, text.indexOf("},'sprites'", capsStart));
const caps = [...capsText.matchAll(/'([^']+)':\{'ID':(\d+),'cap':\[(\d+)/g)].map(
  ([, name, stage, cap]) => [Number(stage), name, Number(cap)],
);
if (!caps.length) throw new Error('Level caps not found');

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
  const tutor = numbers(part, 'tutorMoves').filter((index) => tutorPlaces.has(index));
  if (levelup.length || tm.length || tutor.length) species[id] = { levelup, tm, tutor };
}

const out = join(dirname(fileURLToPath(import.meta.url)), 'learnsets.json');
await writeFile(out, JSON.stringify({ tms, tutors, caps, species }));
console.log(
  `${tms.length} TMs, ${tutors.length} tutors, ${Object.keys(species).length} species -> ${out}`,
);
