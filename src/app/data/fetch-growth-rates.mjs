// Usage:  node src/app/data/fetch-growth-rates.mjs [outputFile]

import { writeFile } from 'node:fs/promises';

const out = process.argv[2] ?? new URL('./growth-rates.json', import.meta.url);

// PokeAPI names -> names used by the app
const RATE_NAMES = {
  fast: 'fast',
  medium: 'medium-fast',
  'medium-slow': 'medium-slow',
  slow: 'slow',
  'slow-then-very-fast': 'erratic',
  'fast-then-very-slow': 'fluctuating',
};

const rates = {};
for (let id = 1; id <= 6; id++) {
  const res = await fetch(`https://pokeapi.co/api/v2/growth-rate/${id}/`);
  if (!res.ok) throw new Error(`growth-rate/${id}: HTTP ${res.status}`);
  const data = await res.json();
  const rate = RATE_NAMES[data.name];
  if (!rate) throw new Error(`Unknown growth rate "${data.name}"`);
  for (const species of data.pokemon_species) {
    const dex = Number(species.url.split('/').filter(Boolean).pop());
    rates[dex] = rate;
  }
}

const sorted = Object.fromEntries(Object.entries(rates).sort(([a], [b]) => a - b));
await writeFile(out, JSON.stringify(sorted) + '\n');
console.log(`${Object.keys(sorted).length} species written to ${out}`);
