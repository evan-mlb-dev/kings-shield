// Usage:  node src/app/data/build-unbound-data.mjs [outputFile]
//
// Pokémon Unbound data, in the shapes the app uses for Radical Red, from Skeli789's sources:
// Dynamic-Pokemon-Expansion (Unbound branch, WTFPL) for species, learnsets, evolutions, TMs,
// tutors and IDs; Complete-Fire-Red-Upgrade for move stats and move / ability names.
// Radical Red's data (same engine) gives full names, descriptions, sprites, icons and tiers.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const out = process.argv[2] ?? new URL('./unbound/game-data.json', import.meta.url);
const DPE = 'https://raw.githubusercontent.com/Skeli789/Dynamic-Pokemon-Expansion/Unbound/';
const CFRU = 'https://raw.githubusercontent.com/Skeli789/Complete-Fire-Red-Upgrade/master/';
const RR_DEX = 'https://raw.githubusercontent.com/JwowSquared/Radical-Red-Pokedex/master/data.js';
const TREE =
  'https://api.github.com/repos/Skeli789/Dynamic-Pokemon-Expansion/git/trees/Unbound?recursive=1';

async function text(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}
const local = async (file) => JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'));

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

// Flags of the CFRU configuration Unbound is built with (src/config.h)
const DEFINED = new Set([
  'UNBOUND',
  'GEN_6_POWER_NERFS',
  'GEN_7_POWER_NERFS',
  'BUFFED_LEECH_LIFE',
  'DARK_VOID_ACC_NERF',
  'DYNAMAX_FEATURE',
  // Dynamic-Pokemon-Expansion, Unbound branch
  'EXPAND_LEARNSETS',
]);

/** Keeps the lines of the #ifdef / #ifndef / #else branches that apply to Unbound */
function preprocess(source) {
  const active = [true];
  const out = [];
  for (const line of source.split(/\r?\n/)) {
    const directive = /^\s*#\s*(ifdef|ifndef|if|else|endif)\b\s*(\w*)/.exec(line);
    if (directive) {
      const [, kind, symbol] = directive;
      const parent = active[active.length - 1];
      if (kind === 'ifdef') active.push(parent && DEFINED.has(symbol));
      else if (kind === 'ifndef') active.push(parent && !DEFINED.has(symbol));
      else if (kind === 'if') active.push(false);
      else if (kind === 'else') {
        const was = active.pop();
        active.push(active[active.length - 1] && !was);
      } else active.pop();
      continue;
    }
    if (active[active.length - 1]) out.push(line);
  }
  return out.join('\n');
}

/** #define and enum constants PREFIX_NAME -> { byName, byId (one name per id) } */
function defines(source, prefix) {
  const byName = new Map();
  const byId = new Map();
  // Unused slots are named after their number ("ITEM_0B1"): a real name wins
  const placeholder = (n) => /^[0-9A-F]{3}$|^N_A$/.test(n);
  const add = (name, id) => {
    byName.set(name, id);
    if (!byId.has(id) || (placeholder(byId.get(id)) && !placeholder(name))) byId.set(id, name);
  };
  for (const [, name, value] of source.matchAll(
    new RegExp(`#define ${prefix}(\\w+)\\s+(0x[0-9A-Fa-f]+|\\d+)\\b`, 'g'),
  )) {
    add(name, Number(value));
  }
  for (const [, body] of source.matchAll(/enum\s*\w*\s*\{([^}]*)\}/g)) {
    let next = 0;
    for (const raw of body.replace(/\/\/[^\n]*/g, '').split(',')) {
      const match = new RegExp(`^\\s*${prefix}(\\w+)\\s*(?:=\\s*(0x[0-9A-Fa-f]+|\\d+))?\\s*$`).exec(
        raw,
      );
      if (!match) continue;
      if (match[2] !== undefined) next = Number(match[2]);
      add(match[1], next++);
    }
  }
  return { byName, byId };
}

/** "#org @LABEL\ntext" string tables (the #else branch when there is a config switch) */
function strings(source) {
  const map = new Map();
  for (const block of source.split('#org @').slice(1)) {
    const [label, ...lines] = block.split('\n');
    const body = [];
    let skip = false;
    for (const line of lines) {
      if (line.startsWith('#ifdef')) skip = true;
      else if (line.startsWith('#else')) skip = false;
      else if (line.startsWith('#endif')) skip = false;
      else if (!line.startsWith('#') && !skip) body.push(line);
    }
    map.set(label.trim(), body.join(' ').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim());
  }
  return map;
}

const titleCase = (constant) =>
  constant
    .split('_')
    .map((w) =>
      w.length <= 2 && /^[A-Z]+$/.test(w) && w !== 'UP' ? w : w[0] + w.slice(1).toLowerCase(),
    )
    .join(' ');

const [
  speciesH,
  movesH,
  itemsH,
  abilitiesH,
  typesH,
  pokedexH,
  baseStats,
  learnsetsC,
  evolutionsC,
  tmTutorC,
  dexTableC,
  nameTable,
  battleMoves,
  moveNames,
  moveDescs,
  abilityNames,
  abilityDescs,
  rrDex,
  tree,
] = (
  await Promise.all([
    text(DPE + 'include/species.h'),
    text(DPE + 'include/moves.h'),
    text(DPE + 'include/items.h'),
    text(DPE + 'include/abilities.h'),
    text(DPE + 'include/base_stats.h'),
    text(DPE + 'include/pokedex.h'),
    text(DPE + 'src/Base_Stats.c'),
    text(DPE + 'src/Learnsets.c'),
    text(DPE + 'src/Evolution%20Table.c'),
    text(DPE + 'src/TM_Tutor_Tables.c'),
    text(DPE + 'src/Species_To_Pokdex_Table.c'),
    text(DPE + 'strings/Pokemon_Name_Table.string'),
    text(CFRU + 'src/Tables/battle_moves.c'),
    text(CFRU + 'strings/attack_name_table.string'),
    text(CFRU + 'strings/attack_descriptions.string'),
    text(CFRU + 'strings/ability_name_table.string'),
    text(CFRU + 'strings/ability_descriptions.string'),
    text(RR_DEX),
    fetch(TREE).then((r) => r.json()),
  ])
).map((source) => (typeof source === 'string' ? preprocess(source) : source));

const rr = {
  species: await local('./species.json'),
  moves: await local('./moves.json'),
  items: await local('./items.json'),
  abilities: await local('./abilities.json'),
  smogon: await local('./smogon.json'),
};

const SPECIES = defines(speciesH, 'SPECIES_');
const MOVES = defines(movesH, 'MOVE_');
const ITEMS = defines(itemsH, 'ITEM_');
const ABILITIES = defines(abilitiesH, 'ABILITY_');
const TYPES = defines(typesH, 'TYPE_');
const NATIONAL = defines(pokedexH, 'NATIONAL_DEX_');
const TYPE_NAMES = { ELECTRIC: 'Electric', PSYCHIC: 'Psychic' };
const typeName = (constant) => TYPE_NAMES[constant] ?? titleCase(constant);

// ---------- Moves ----------
const rrMoves = new Map(rr.moves.map((m) => [norm(m.name), m]));
const cfruMoves = new Map();
for (const [, name, body] of battleMoves.matchAll(/\[MOVE_(\w+)\]\s*=\s*\{([^}]*)\}/g)) {
  cfruMoves.set(norm(name), body);
}
const field = (body, key) => new RegExp(`\\.${key}\\s*=\\s*([^,\\n]+)`).exec(body)?.[1].trim();
const moveNameLabels = strings(moveNames);
const moveDescLabels = strings(moveDescs);
const labelFor = (map, prefix, constant) =>
  [...map].find(
    ([label]) => label.startsWith(prefix) && norm(label.slice(prefix.length)) === norm(constant),
  )?.[1];

const moves = [];
for (const [id, constant] of MOVES.byId) {
  if (id === 0 || constant === 'NAME_LENGTH') continue;
  const body = cfruMoves.get(norm(constant));
  if (!body) continue;
  const cfruName = labelFor(moveNameLabels, 'NAME_', constant);
  const known = rrMoves.get(norm(cfruName ?? constant)) ?? rrMoves.get(norm(constant));
  const split = field(body, 'split');
  const target = field(body, 'target');
  const power = Number(field(body, 'power') ?? 0);
  const accuracy = Number(field(body, 'accuracy') ?? 0);
  const priority = Number(field(body, 'priority') ?? 0);
  const move = {
    id,
    name: known?.name ?? cfruName ?? titleCase(constant),
    type: typeName((field(body, 'type') ?? 'TYPE_NORMAL').replace('TYPE_', '')),
    category:
      split === 'SPLIT_PHYSICAL' ? 'physical' : split === 'SPLIT_SPECIAL' ? 'special' : 'status',
    power: power > 1 ? power : null,
    accuracy: accuracy > 0 ? accuracy : null,
    pp: Number(field(body, 'pp') ?? 0),
    description: known?.description ?? labelFor(moveDescLabels, 'DESC_', constant) ?? '',
  };
  if (target === 'MOVE_TARGET_FOES_AND_ALLY') move.spread = 'all';
  else if (target === 'MOVE_TARGET_BOTH') move.spread = 'foes';
  if (priority) move.priority = priority;
  moves.push(move);
}

// ---------- Abilities ----------
const rrAbilities = new Map();
for (const a of rr.abilities)
  for (const part of a.name.split(' / ')) rrAbilities.set(norm(part), a);
const abilityNameLabels = strings(abilityNames);
const abilityDescLabels = strings(abilityDescs);
const abilities = [];
for (const [id, constant] of ABILITIES.byId) {
  if (id === 0) continue;
  const name = labelFor(abilityNameLabels, 'NAME_', constant) ?? titleCase(constant);
  const known = rrAbilities.get(norm(name)) ?? rrAbilities.get(norm(constant));
  abilities.push({
    id,
    name: known && !known.name.includes(' / ') ? known.name : name,
    description: known?.description ?? labelFor(abilityDescLabels, 'DESC_', constant) ?? '',
  });
}

// ---------- Items ----------
const rrItems = new Map(rr.items.map((i) => [norm(i.name), i]));
const items = [];
const itemIcons = {};
for (const [id, constant] of ITEMS.byId) {
  if (id === 0 || /^[0-9A-F]{3}$/.test(constant) || constant === 'N_A') continue;
  // "TM01_FOCUS_PUNCH" -> "TM01": the name the app looks for in the bag
  const machine = /^(TM|HM)(\d+)_/.exec(constant);
  const known = machine ? undefined : rrItems.get(norm(constant));
  const name = machine ? `${machine[1]}${machine[2]}` : (known?.name ?? titleCase(constant));
  items.push({ id, name, description: known?.description ?? '' });
  if (known && known.id !== id) itemIcons[id] = known.id;
}

// ---------- Species ----------
const dexOf = new Map();
for (const [, sp, dex] of dexTableC.matchAll(/\[SPECIES_(\w+) - 1\]\s*=\s*NATIONAL_DEX_(\w+)/g)) {
  dexOf.set(sp, NATIONAL.byName.get(dex) ?? 0);
}
const shortNames = new Map();
for (const [label, value] of strings(nameTable))
  if (label.startsWith('NAME_')) shortNames.set(label.slice(5), value);

const rrSpecies = Object.entries(rr.species).map(([id, s]) => ({ id: Number(id), ...s }));
const rrKeys = new Map();
for (const [, id, , key] of rrDex.matchAll(
  /(\d+):\{'ID':\d+,'name':'([^']*)'.*?'key':'([^']*)'/g,
)) {
  rrKeys.set(Number(id), key.toLowerCase());
}
const FORM_HINTS = [
  [/_A$|_ALOLA/, 'alola'],
  [/_G$|_GALAR/, 'galar'],
  [/_H$|_HISUI/, 'hisui'],
  [/_P$|_PALDEA/, 'paldea'],
  [/_MEGA_X$/, 'mega-x'],
  [/_MEGA_Y$/, 'mega-y'],
  [/_MEGA$/, 'mega'],
  [/_GIGA$/, 'gmax'],
  [/_PRIMAL$/, 'primal'],
];
const GROWTH = ['MEDIUM_FAST', 'ERRATIC', 'FLUCTUATING', 'MEDIUM_SLOW', 'FAST', 'SLOW'];
const GROWTH_NAMES = ['medium-fast', 'erratic', 'fluctuating', 'medium-slow', 'fast', 'slow'];

const species = {};
const sprites = {};
const smogon = {};
for (const [, constant, body] of baseStats.matchAll(/\[SPECIES_(\w+)\]\s*=\s*\{([^}]*)\}/g)) {
  const id = SPECIES.byName.get(constant);
  if (!id) continue;
  const n = (key) => Number(field(body, key) ?? 0);
  const ability = (key) =>
    ABILITIES.byName.get((field(body, key) ?? 'ABILITY_NONE').replace('ABILITY_', '')) ?? 0;
  const types = [field(body, 'type1'), field(body, 'type2')]
    .filter(Boolean)
    .map((t) => typeName(t.replace('TYPE_', '')));
  const dex = dexOf.get(constant) ?? 0;

  // Same species in Radical Red: same ID and name, else same Pokédex number (form by hint)
  const short = shortNames.get(constant) ?? titleCase(constant);
  const sameId = rr.species[id];
  let match = sameId && sameId.dex === dex && norm(sameId.name).startsWith(norm(short)) ? id : null;
  if (match === null) {
    const candidates = rrSpecies.filter((s) => s.dex === dex);
    const hint = FORM_HINTS.find(([re]) => re.test(constant))?.[1];
    match =
      (hint && candidates.find((s) => rrKeys.get(s.id)?.includes(hint))?.id) ??
      candidates.find((s) => !/-/.test(rrKeys.get(s.id) ?? ''))?.id ??
      candidates[0]?.id ??
      null;
  }
  const name = match !== null ? rr.species[match].name : short;
  const growth = GROWTH.indexOf((field(body, 'growthRate') ?? '').replace('GROWTH_', ''));

  species[id] = {
    dex,
    name,
    types: [...new Set(types)],
    baseStats: {
      hp: n('baseHP'),
      atk: n('baseAttack'),
      def: n('baseDefense'),
      spa: n('baseSpAttack'),
      spd: n('baseSpDefense'),
      spe: n('baseSpeed'),
    },
    abilityIds: [ability('hiddenAbility'), ability('ability1'), ability('ability2')],
    growthRate: growth >= 0 ? GROWTH_NAMES[growth] : null,
  };
  if (match !== null && match !== id) sprites[id] = match;
  if (match !== null && rr.smogon[match]) smogon[id] = rr.smogon[match];
}

// ---------- Learnsets ----------
const learnsetArrays = new Map();
for (const [, name, body] of learnsetsC.matchAll(
  /static const struct LevelUpMove (\w+)\[\]\s*=\s*\{([^}]*)\}/g,
)) {
  learnsetArrays.set(
    name,
    [...body.matchAll(/LEVEL_UP_MOVE\(\s*(\d+),\s*MOVE_(\w+)\)/g)]
      .map(([, level, move]) => [MOVES.byName.get(move), Number(level)])
      .filter(([move]) => move !== undefined),
  );
}
const learnsets = { tms: [], tutors: [], caps: [], species: {} };
const entry = (id) => (learnsets.species[id] ??= { levelup: [], tm: [], tutor: [] });
for (const [, sp, array] of learnsetsC.matchAll(/\[SPECIES_(\w+)\]\s*=\s*(\w+),/g)) {
  const id = SPECIES.byName.get(sp);
  if (id !== undefined && learnsetArrays.has(array)) entry(id).levelup = learnsetArrays.get(array);
}

const moveList = (name) => {
  const block = new RegExp(`${name}\\[[^\\]]*\\]\\s*=\\s*\\{([^}]*)\\}`).exec(tmTutorC)?.[1] ?? '';
  return [...block.matchAll(/MOVE_(\w+)/g)].map(([, m]) => MOVES.byName.get(m));
};
moveList('gTMHMMoves').forEach((move, i) => learnsets.tms.push([i + 1, move]));
moveList('gMoveTutorMoves').forEach((move, i) => learnsets.tutors.push([i, move, 0, '']));

const paths = tree.tree.map((t) => t.path);
async function compatibility(folder, add) {
  const files = paths.filter((p) => p.startsWith(`src/${folder}/`) && p.endsWith('.txt'));
  await Promise.all(
    files.map(async (file) => {
      const number = Number(/\/(\d+) - /.exec(file)?.[1]);
      const lines = (await text(DPE + file.split('/').map(encodeURIComponent).join('/'))).split(
        /\r?\n/,
      );
      for (const line of lines.slice(1)) {
        const id = SPECIES.byName.get(line.trim());
        if (id !== undefined) add(id, number);
      }
    }),
  );
}
await compatibility('tm_compatibility', (id, tm) => entry(id).tm.push(tm));
await compatibility('tutor_compatibility', (id, tutor) => entry(id).tutor.push(tutor - 1));
for (const e of Object.values(learnsets.species)) {
  e.tm.sort((a, b) => a - b);
  e.tutor.sort((a, b) => a - b);
}

// ---------- Evolutions ----------
const methods = new Map();
const enumBody = /enum EvolutionMethods\s*\{([^}]*)\}/.exec(
  await text(DPE + 'include/evolution.h'),
)?.[1];
let methodIndex = 0;
for (const [, name, value] of (enumBody ?? '').matchAll(/(EVO_\w+)(?:\s*=\s*(\d+))?/g)) {
  methodIndex = value !== undefined ? Number(value) : methodIndex;
  methods.set(name, methodIndex++);
}
const param = (raw) => {
  const v = raw.trim();
  if (/^\d+$|^0x/i.test(v)) return Number(v);
  if (v === 'TRUE') return 1;
  if (v === 'FALSE') return 0;
  for (const [prefix, table] of [
    ['ITEM_', ITEMS],
    ['MOVE_', MOVES],
    ['SPECIES_', SPECIES],
    ['TYPE_', TYPES],
  ]) {
    if (v.startsWith(prefix)) return table.byName.get(v.slice(prefix.length)) ?? 0;
  }
  return 0;
};
const evolutions = {};
for (const [, sp, body] of evolutionsC.matchAll(
  /\[SPECIES_(\w+)\]\s*=\s*\{(\{.*?\})\}\s*,?\s*(?=\[SPECIES_|\};)/gs,
)) {
  const from = SPECIES.byName.get(sp);
  if (from === undefined) continue;
  const list = [];
  for (const [, method, p, target] of body.matchAll(
    /\{\s*(EVO_\w+)\s*,\s*([^,]+),\s*SPECIES_(\w+)/g,
  )) {
    const code = methods.get(method);
    const to = SPECIES.byName.get(target);
    if (code === undefined || to === undefined) continue;
    list.push([code, param(p), to]);
  }
  if (list.length) evolutions[from] = list;
}

const data = {
  species,
  moves,
  abilities,
  items,
  learnsets,
  evolutions,
  smogon,
  sprites,
  itemIcons,
};
await mkdir(new URL('.', out instanceof URL ? out : new URL(`file://${out}`)), { recursive: true });
await writeFile(out, JSON.stringify(data) + '\n');
console.log(
  `${Object.keys(species).length} species (${Object.keys(sprites).length} with another sprite), ` +
    `${moves.length} moves, ${abilities.length} abilities, ${items.length} items, ` +
    `${Object.keys(learnsets.species).length} learnsets, ${Object.keys(evolutions).length} evolution lines.`,
);
