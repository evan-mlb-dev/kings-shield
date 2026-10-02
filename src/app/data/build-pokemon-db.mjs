// Usage:  node build-pokemon-db.mjs <rawDir> [outputDir]

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';

const rawDir = process.argv[2];
const outDir = process.argv[3] ?? './pokemon-db';
if (!rawDir) {
  console.error('Usage: node build-pokemon-db.mjs <rawDir> [outputDir]');
  process.exit(1);
}

const TYPE_NAMES = {
  0: 'Normal', 1: 'Fighting', 2: 'Flying', 3: 'Poison', 4: 'Ground', 5: 'Rock',
  6: 'Bug', 7: 'Ghost', 8: 'Steel', 9: '???', 10: 'Fire', 11: 'Water', 12: 'Grass',
  13: 'Electric', 14: 'Psychic', 15: 'Ice', 16: 'Dragon', 17: 'Dark', 23: 'Fairy',
};

const CHART = {
  Normal: [[], ['Rock', 'Steel'], ['Ghost']],
  Fire: [['Grass', 'Ice', 'Bug', 'Steel'], ['Fire', 'Water', 'Rock', 'Dragon'], []],
  Water: [['Fire', 'Ground', 'Rock'], ['Water', 'Grass', 'Dragon'], []],
  Electric: [['Water', 'Flying'], ['Electric', 'Grass', 'Dragon'], ['Ground']],
  Grass: [['Water', 'Ground', 'Rock'], ['Fire', 'Grass', 'Poison', 'Flying', 'Bug', 'Dragon', 'Steel'], []],
  Ice: [['Grass', 'Ground', 'Flying', 'Dragon'], ['Fire', 'Water', 'Ice', 'Steel'], []],
  Fighting: [['Normal', 'Ice', 'Rock', 'Dark', 'Steel'], ['Poison', 'Flying', 'Psychic', 'Bug', 'Fairy'], ['Ghost']],
  Poison: [['Grass', 'Fairy'], ['Poison', 'Ground', 'Rock', 'Ghost'], ['Steel']],
  Ground: [['Fire', 'Electric', 'Poison', 'Rock', 'Steel'], ['Grass', 'Bug'], ['Flying']],
  Flying: [['Grass', 'Fighting', 'Bug'], ['Electric', 'Rock', 'Steel'], []],
  Psychic: [['Fighting', 'Poison'], ['Psychic', 'Steel'], ['Dark']],
  Bug: [['Grass', 'Psychic', 'Dark'], ['Fire', 'Fighting', 'Poison', 'Flying', 'Ghost', 'Steel', 'Fairy'], []],
  Rock: [['Fire', 'Ice', 'Flying', 'Bug'], ['Fighting', 'Ground', 'Steel'], []],
  Ghost: [['Psychic', 'Ghost'], ['Dark'], ['Normal']],
  Dragon: [['Dragon'], ['Steel'], ['Fairy']],
  Dark: [['Psychic', 'Ghost'], ['Fighting', 'Dark', 'Fairy'], []],
  Steel: [['Ice', 'Rock', 'Fairy'], ['Fire', 'Water', 'Electric', 'Steel'], []],
  Fairy: [['Fighting', 'Dragon', 'Dark'], ['Fire', 'Poison', 'Steel'], []],
};

const NATURE_NAMES = [
  'Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty',
  'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax',
  'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive',
  'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash',
  'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky',
];
const NATURE_STATS = ['atk', 'def', 'spe', 'spa', 'spd'];

// Move split values used by the game engine
const SPLITS = ['physical', 'special', 'status'];

const typeName = (index) => TYPE_NAMES[index] ?? 'Normal';

async function readJson(name, required) {
  const path = join(rawDir, name);
  try {
    await access(path);
  } catch {
    if (required) throw new Error(`Missing required file: ${path}`);
    console.warn(`Skipped ${name}: not found in ${rawDir}`);
    return null;
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

const clean = (text) => String(text ?? '').trim();

const types = Object.entries(TYPE_NAMES).map(([id, name]) => {
  const [strong, weak, none] = CHART[name] ?? [[], [], []];
  return { id: Number(id), name, strongAgainst: strong, weakAgainst: weak, noEffectAgainst: none };
});

const natures = NATURE_NAMES.map((name, id) => {
  const up = Math.floor(id / 5);
  const down = id % 5;
  return {
    id,
    name,
    increasedStat: up === down ? null : NATURE_STATS[up],
    decreasedStat: up === down ? null : NATURE_STATS[down],
  };
});

const speciesRaw = await readJson('species.json', true);
const species = {};
for (const [id, s] of Object.entries(speciesRaw)) {
  const [hp, atk, def, spe, spa, spd] = s.stats;
  species[id] = {
    dex: s.dexID,
    name: clean(s.name),
    types: [...new Set(s.type.map(typeName))],
    baseStats: { hp, atk, def, spa, spd, spe },
    abilityIds: s.abilities.map((a) => a[0]),
  };
}

const movesRaw = await readJson('moves.json', false);
const moves = movesRaw
  ? Object.entries(movesRaw).map(([id, m]) => ({
      id: Number(m.ID ?? id),
      name: clean(m.name),
      type: typeName(m.type),
      category: SPLITS[m.split] ?? 'status',
      power: m.power > 0 ? m.power : null,
      accuracy: m.accuracy > 0 ? m.accuracy : null,
      pp: m.pp ?? 0,
      description: clean(m.description),
    }))
  : [];

const abilitiesRaw = await readJson('abilities.json', false);
const abilities = abilitiesRaw
  ? Object.entries(abilitiesRaw).map(([id, a]) => ({
      id: Number(a.ID ?? id),
      name: a.names.map(clean).join(' / '),
      description: clean(a.description),
    }))
  : [];

const itemsRaw = await readJson('items.json', false);
const items = itemsRaw
  ? Object.entries(itemsRaw).map(([id, i]) => ({
      id: Number(i.ID ?? id),
      name: clean(i.name),
      description: clean(i.description),
    }))
  : [];

await mkdir(outDir, { recursive: true });
const outputs = { types, natures, species, moves, abilities, items };
for (const [name, data] of Object.entries(outputs)) {
  await writeFile(join(outDir, `${name}.json`), JSON.stringify(data));
}

console.log(
  `Wrote to ${outDir}: ${types.length} types, ${natures.length} natures, ` +
    `${Object.keys(species).length} species, ${moves.length} moves, ` +
    `${abilities.length} abilities, ${items.length} items.`,
);
