// Usage:  node src/app/data/fetch-smogon-data.mjs [outputFile]

import { writeFile } from 'node:fs/promises';

const out = process.argv[2] ?? new URL('./smogon.json', import.meta.url);
const DEX_URL = 'https://raw.githubusercontent.com/JwowSquared/Radical-Red-Pokedex/master/data.js';
const FORMATS_URL = 'https://play.pokemonshowdown.com/data/formats-data.js';
const ANALYSES_URL = (gen) => `https://data.pkmn.cc/analyses/gen${gen}.json`;

// Smogon dex link: highest standard tier with an analysis, newest generation first,
// National Dex only when nothing else exists
const DEX_GENS = [
  [9, 'sv'],
  [8, 'ss'],
  [7, 'sm'],
];
const TIER_ORDER = ['ubers', 'ou', 'ubersuu', 'uu', 'ru', 'nu', 'pu', 'zu', 'nfe', 'lc'];
const NATDEX_ORDER = ['nationaldexubers', 'nationaldex', 'nationaldexuu', 'nationaldexru'];
const SMOGON_FORMAT = {
  ubers: 'uber',
  ubersuu: 'ubers-uu',
  nationaldexubers: 'national-dex-ubers',
  nationaldex: 'national-dex',
  nationaldexuu: 'national-dex-uu',
  nationaldexru: 'national-dex-ru',
};

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

const analyses = new Map();
for (const [gen] of DEX_GENS) {
  const data = JSON.parse(await text(ANALYSES_URL(gen)));
  analyses.set(gen, new Map(Object.entries(data).map(([name, formats]) => [toId(name), formats])));
}

function dexPath(candidates) {
  const pick = (formats, order) => order.find((f) => formats?.[f]);
  for (const [gen, alias] of DEX_GENS) {
    for (const [id, slug] of candidates) {
      const format = pick(analyses.get(gen).get(id), TIER_ORDER);
      if (format) return `${alias}/pokemon/${slug}/${SMOGON_FORMAT[format] ?? format}/`;
    }
  }
  for (const [id, slug] of candidates) {
    const format = pick(analyses.get(9).get(id), NATDEX_ORDER);
    if (format) return `sv/pokemon/${slug}/${SMOGON_FORMAT[format]}/`;
  }
  return null;
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
  const candidates = [
    [toId(key), toSlug(key)],
    [toId(name), toSlug(name)],
  ];
  if (formTier) {
    const path = dexPath(candidates) ?? `sv/pokemon/${toSlug(key)}/`;
    result[id] = { tier: formTier, path };
    byForm++;
  } else if (baseTier) {
    const path = dexPath(candidates.slice(1)) ?? `sv/pokemon/${toSlug(name)}/`;
    result[id] = { tier: baseTier, path };
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
