// Usage:  node src/app/data/fetch-smogon-data.mjs [outputFile]

import { writeFile } from 'node:fs/promises';

const out = process.argv[2] ?? new URL('./smogon.json', import.meta.url);
const DEX_URL = 'https://raw.githubusercontent.com/JwowSquared/Radical-Red-Pokedex/master/data.js';
const FORMATS_URL = 'https://play.pokemonshowdown.com/data/formats-data.js';

async function text(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const unescape = (s) =>
  s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

const toId = (name) =>
  unescape(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const toSlug = (name) =>
  unescape(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’.:]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Gen 9 tiers below RU, the lowest National Dex tier */
const BELOW_RU = ['NUBL', 'NU', 'PUBL', 'PU', 'ZUBL', 'ZU'];

function cleanTier(tier) {
  if (!tier) return null;
  const t = tier.replace(/[()]/g, '');
  return ['Illegal', 'Unreleased', 'CAP', 'CAP NFE', 'CAP LC'].includes(t) ? null : t;
}

const formats = await text(FORMATS_URL);
const tiers = new Map();
for (const [, id, body] of formats.matchAll(/([a-z0-9]+):\{([^{}]*)\}/g)) {
  const natDex = /natDexTier:"([^"]*)"/.exec(body)?.[1];
  const tier = /(?:^|,)tier:"([^"]*)"/.exec(body)?.[1];
  let value = cleanTier(natDex) ?? cleanTier(tier);
  if (value === 'RU' && BELOW_RU.includes(cleanTier(tier) ?? '')) value = cleanTier(tier);
  if (value) tiers.set(id, value);
}

const dex = await text(DEX_URL);
const start = dex.indexOf("'species':{");
const end = dex.indexOf("'moves':{", start);
const speciesBlock = dex.slice(start, end > 0 ? end : undefined);

const result = {};
let byForm = 0;
let byBase = 0;
const missing = [];
for (const [, id, name, key] of speciesBlock.matchAll(
  /(\d+):\{'ID':\d+,'name':'([^']*)'.*?'key':'([^']*)'/g,
)) {
  const formTier = tiers.get(toId(key));
  const baseTier = tiers.get(toId(name));
  if (formTier) {
    result[id] = { tier: formTier, slug: toSlug(key) };
    byForm++;
  } else if (baseTier) {
    result[id] = { tier: baseTier, slug: toSlug(name) };
    byBase++;
  } else {
    missing.push(unescape(key));
  }
}

await writeFile(out, JSON.stringify(result) + '\n');
console.log(
  `${Object.keys(result).length} species written (${byForm} by form, ${byBase} by base species), ` +
    `${missing.length} without tier: ${missing.slice(0, 30).join(', ')}${missing.length > 30 ? '…' : ''}`,
);
