import type { PokemonLookup } from './pokemon.models';
import type { ParsedPokemon, ParsedSave, Stats } from './save-file-parser';
import { SaveFileWriter } from './save-file-writer';
import { BALLS } from '../shared/balls';
import { SYMBOL_BYTES } from './gen3-text';
import {
  experienceForLevel,
  type GrowthRate,
  levelFromExperience,
  MAX_LEVEL,
  reachesLevel,
} from '../shared/experience';

const PARTY_LIST_OFFSET = 0x38;
const PARTY_MON_SIZE = 100;
const BOX_MON_SIZE = 58;
const SLOTS_PER_BOX = 30;
const PC_FIRST_SECTION = 5;
const PC_SECTION_DATA_SIZE = 0xf80;
const PC_MAIN_HEADER = 4;
const PC_EXTRA_SECTION = 0;
const PC_EXTRA_OFFSET = 0xb0;
const PC_MAIN_SLOTS = 562;
const PC_EXTRA_SLOTS = 63;
const PARTY_COUNT_OFFSET = 0x34;

/** Player's trainer ID then secret ID (u16 each), in the trainer section */
const PLAYER_ID = 0x0a;
/** Original trainer ID (u16) then secret ID (u16), at 0x04 in both formats */
const OT_ID = 0x04;
/** Nickname: 10 bytes at 0x08 in both formats */
const NICKNAME = 0x08;
const NICKNAME_LENGTH = 10;

// Party layout (plain): data at 0x20 in the order Growth / Attacks / EVs / Misc
const PARTY = {
  species: 0x20,
  heldItem: 0x22,
  friendship: 0x29,
  /** CFRU: byte after friendship */
  ball: 0x2a,
  dataChecksum: 0x1c,
  experience: 0x24,
  ppBonuses: 0x28,
  moves: 0x2c,
  pp: 0x34,
  level: 0x54,
  currentHp: 0x56,
  maxHp: 0x58,
  /** atk, def, spe, spa, spd: u16 each, in this order */
  stats: 0x5a,
  /** IVs / egg / hidden ability flag (u32), in the Misc data */
  ivWord: 0x48,
} as const;

// PC layout (compressed)
const BOX = {
  species: 0x1c,
  heldItem: 0x1e,
  friendship: 0x25,
  ball: 0x26,
  experience: 0x20,
  ppBonuses: 0x24,
  /** 4 moves x 10 bits, packed over 5 bytes */
  moves: 0x27,
  /** IVs / egg / hidden ability flag (u32) */
  ivWord: 0x36,
} as const;

export const MAX_FRIENDSHIP = 255;

/** Highest move ID the PC format can hold (10 bits) */
const MAX_BOX_MOVE_ID = 0x3ff;
const BATTLE_STATS = ['atk', 'def', 'spe', 'spa', 'spd'] as const;

/** Stats of a Pokémon at a level (Gen 3+ formulas) */
export function computeStats(
  base: Readonly<Stats>,
  ivs: Readonly<Stats>,
  evs: Readonly<Stats>,
  level: number,
  nature: { increasedStat: string | null; decreasedStat: string | null } | null,
  fixedHp = false,
): Stats {
  const core = (stat: keyof Stats) =>
    Math.floor(((2 * base[stat] + ivs[stat] + Math.floor(evs[stat] / 4)) * level) / 100);
  const natured = (stat: keyof Stats) => {
    const value = core(stat) + 5;
    if (nature?.increasedStat === nature?.decreasedStat) return value;
    if (nature?.increasedStat === stat) return Math.floor((value * 110) / 100);
    if (nature?.decreasedStat === stat) return Math.floor((value * 90) / 100);
    return value;
  };
  return {
    hp: fixedHp ? 1 : core('hp') + level + 10,
    atk: natured('atk'),
    def: natured('def'),
    spe: natured('spe'),
    spa: natured('spa'),
    spd: natured('spd'),
  };
}

export class SaveEditError extends Error {}

/** 0 = ability 1, 1 = ability 2, 2 = hidden ability */
export type AbilityChoice = 0 | 1 | 2;

export class SaveEditor {
  constructor(
    readonly writer: SaveFileWriter,
    private readonly lookup: PokemonLookup,
  ) {}

  /** Party as saved, used to work out curves missing from the data */
  party: readonly ParsedPokemon[] = [];

  growthRate(mon: ParsedPokemon): GrowthRate | null {
    return resolveGrowthRate(
      mon,
      this.lookup.species.get(mon.speciesId)?.growthRate ?? null,
      this.party,
    );
  }

  setLevel(mon: ParsedPokemon, level: number): void {
    const target = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
    const species = this.lookup.species.get(mon.speciesId);
    const rate = this.growthRate(mon);
    if (!rate) throw curveError(species?.name ?? `Species #${mon.speciesId}`);
    const experience = experienceForLevel(rate, target);
    const bytes = this.locate(mon);

    if (mon.location === 'box') {
      bytes.setU32(BOX.experience, experience);
      return;
    }

    bytes.setU32(PARTY.experience, experience);
    bytes.setU8(PARTY.level, target);
    this.refreshPartyStats(bytes, mon, target, mon.personality);
  }

  setNatureAndShiny(
    mon: ParsedPokemon,
    change: { nature?: number; shiny?: boolean },
  ): ParsedPokemon {
    const nature = change.nature ?? mon.personality % 25;
    const shiny = change.shiny ?? mon.isShiny;
    if (!Number.isInteger(nature) || nature < 0 || nature > 24) {
      throw new SaveEditError(`Unknown nature #${nature}.`);
    }
    const bytes = this.locate(mon);
    if (nature === mon.personality % 25 && shiny === mon.isShiny) return mon;

    const isUnown = this.lookup.species.get(mon.speciesId)?.name.startsWith('Unown') ?? false;
    const personality = findPersonality(mon, nature, shiny, isUnown);
    bytes.setU32(0, personality);
    const edited: ParsedPokemon = { ...mon, personality, isShiny: shiny };
    if (mon.location === 'party') {
      this.refreshPartyStats(bytes, edited, bytes.getU8(PARTY.level), personality);
    }
    return edited;
  }

  /**
   * Original trainer ID (visible) and secret ID. Shininess depends on them: it is kept by
   * changing the personality when needed, as the Shiny toggle does. Returns the updated Pokémon.
   */
  setTrainerId(mon: ParsedPokemon, trainerId: number, secretId: number): ParsedPokemon {
    for (const id of [trainerId, secretId]) {
      if (!Number.isInteger(id) || id < 0 || id > 0xffff) {
        throw new SaveEditError('A trainer ID is a number from 0 to 65535.');
      }
    }
    const bytes = this.locate(mon);
    if (trainerId === mon.trainerId && secretId === mon.secretId) return mon;
    bytes.setU32(OT_ID, ((secretId << 16) | trainerId) >>> 0);
    const edited: ParsedPokemon = {
      ...mon,
      trainerId,
      secretId,
      isShiny: isShinyPersonality(mon.personality, trainerId, secretId),
    };
    return edited.isShiny === mon.isShiny
      ? edited
      : this.setNatureAndShiny(edited, { shiny: mon.isShiny });
  }

  /** The player's own trainer ID and secret ID; Radical Red's randomizer seeds itself with them */
  setPlayerTrainerId(trainerId: number, secretId: number): void {
    for (const id of [trainerId, secretId]) {
      if (!Number.isInteger(id) || id < 0 || id > 0xffff) {
        throw new SaveEditError('A trainer ID is a number from 0 to 65535.');
      }
    }
    this.writer.view.setUint32(
      this.writer.sectionOffset(0) + PLAYER_ID,
      ((secretId << 16) | trainerId) >>> 0,
      true,
    );
  }

  /** Nickname (10 characters max). Returns the updated Pokémon. */
  setNickname(mon: ParsedPokemon, name: string): ParsedPokemon {
    const encoded = encodeText(name, NICKNAME_LENGTH);
    if (!encoded || !name.trim()) {
      throw new SaveEditError(
        `"${name}" cannot be a nickname: 1 to 10 letters, digits, spaces or simple symbols.`,
      );
    }
    const bytes = this.locate(mon);
    if (name === mon.nickname) return mon;
    encoded.forEach((b, i) => bytes.setU8(NICKNAME + i, b));
    return { ...mon, nickname: name };
  }

  /** Friendship (0-255). Returns the updated Pokémon. */
  setFriendship(mon: ParsedPokemon, friendship: number): ParsedPokemon {
    if (!Number.isInteger(friendship) || friendship < 0 || friendship > MAX_FRIENDSHIP) {
      throw new SaveEditError(`Friendship must be between 0 and ${MAX_FRIENDSHIP}.`);
    }
    const bytes = this.locate(mon);
    if (friendship === mon.friendship) return mon;
    bytes.setU8(mon.location === 'party' ? PARTY.friendship : BOX.friendship, friendship);
    return { ...mon, friendship };
  }

  /** Ball it was caught in (shared/balls.ts numbering). Returns the updated Pokémon. */
  setBall(mon: ParsedPokemon, ball: number): ParsedPokemon {
    if (!Number.isInteger(ball) || ball < 0 || ball >= BALLS.length) {
      throw new SaveEditError(`Unknown ball #${ball}.`);
    }
    const bytes = this.locate(mon);
    if (ball === mon.ball) return mon;
    bytes.setU8(mon.location === 'party' ? PARTY.ball : BOX.ball, ball);
    return { ...mon, ball };
  }

  /** Held item (0: none). Returns the updated Pokémon. */
  setHeldItem(mon: ParsedPokemon, itemId: number): ParsedPokemon {
    if (itemId !== 0 && !this.lookup.items.has(itemId)) {
      throw new SaveEditError(`Unknown item #${itemId}.`);
    }
    const bytes = this.locate(mon);
    if (itemId === mon.heldItem) return mon;
    bytes.setU16(mon.location === 'party' ? PARTY.heldItem : BOX.heldItem, itemId);
    return { ...mon, heldItem: itemId };
  }

  setAbility(mon: ParsedPokemon, ability: AbilityChoice): ParsedPokemon {
    const abilityIds = this.lookup.species.get(mon.speciesId)?.abilityIds ?? [];
    if (![0, 1, 2].includes(ability) || !abilityIds[ability === 2 ? 0 : 1 + ability]) {
      throw new SaveEditError('This species does not have this ability.');
    }
    const bytes = this.locate(mon);
    const hidden = ability === 2;
    const slot = hidden ? mon.abilitySlot : ability;
    if (hidden === !!mon.hiddenAbility && slot === mon.abilitySlot) return mon;

    let edited: ParsedPokemon = { ...mon, hiddenAbility: hidden };
    if (slot !== mon.abilitySlot) {
      const personality = findPersonality(mon, mon.personality % 25, mon.isShiny, false, slot);
      bytes.setU32(0, personality);
      edited = { ...edited, personality, abilitySlot: slot };
    }
    const at = mon.location === 'party' ? PARTY.ivWord : BOX.ivWord;
    const ivWord = bytes.getU32(at);
    bytes.setU32(at, hidden ? (ivWord | 0x80000000) >>> 0 : (ivWord & 0x7fffffff) >>> 0);
    return edited;
  }

  setSpecies(mon: ParsedPokemon, speciesId: number): ParsedPokemon {
    const from = this.lookup.species.get(mon.speciesId);
    const to = this.lookup.species.get(speciesId);
    if (!to) throw new SaveEditError(`Unknown species #${speciesId}.`);
    const bytes = this.locate(mon);
    if (speciesId === mon.speciesId) return mon;
    const fromRate = this.growthRate(mon);
    if (from?.growthRate && !fromRate) throw curveError(from.name);

    const isParty = mon.location === 'party';
    bytes.setU16(isParty ? PARTY.species : BOX.species, speciesId);
    const edited: ParsedPokemon = { ...mon, speciesId };

    // Same level under the new experience curve
    const level = isParty
      ? bytes.getU8(PARTY.level)
      : fromRate
        ? levelFromExperience(fromRate, mon.experience)
        : null;
    if (level !== null && to.growthRate && fromRate !== to.growthRate) {
      edited.experience = experienceForLevel(to.growthRate, level);
      bytes.setU32(isParty ? PARTY.experience : BOX.experience, edited.experience);
    }

    if (from && mon.nickname.trim().toLowerCase() === from.name.toLowerCase()) {
      const upper = mon.nickname === mon.nickname.toUpperCase();
      const encoded = encodeText(upper ? to.name.toUpperCase() : to.name, NICKNAME_LENGTH);
      if (encoded) {
        encoded.forEach((b, i) => bytes.setU8(NICKNAME + i, b));
        edited.nickname = upper ? to.name.toUpperCase() : to.name;
      }
    }

    if (isParty) this.refreshPartyStats(bytes, edited, bytes.getU8(PARTY.level), mon.personality);
    return edited;
  }

  private refreshPartyStats(
    bytes: MonBytes,
    mon: ParsedPokemon,
    level: number,
    personality: number,
  ): void {
    const species = this.lookup.species.get(mon.speciesId);
    if (!species) throw new SaveEditError(`Unknown species #${mon.speciesId}.`);
    const nature = this.lookup.natures[personality % 25] ?? null;
    const stats = computeStats(
      species.baseStats,
      mon.ivs,
      mon.evs,
      level,
      nature,
      species.name === 'Shedinja',
    );
    const oldMax = bytes.getU16(PARTY.maxHp);
    const oldCurrent = bytes.getU16(PARTY.currentHp);
    const current =
      oldCurrent === 0 ? 0 : Math.max(1, Math.min(stats.hp, oldCurrent + stats.hp - oldMax));
    bytes.setU16(PARTY.maxHp, stats.hp);
    bytes.setU16(PARTY.currentHp, current);
    BATTLE_STATS.forEach((stat, i) => bytes.setU16(PARTY.stats + i * 2, stats[stat]));
  }

  setMoves(mon: ParsedPokemon, moves: readonly number[]): void {
    const ids = moves.filter((id) => id > 0);
    if (ids.length === 0) throw new SaveEditError('A Pokémon needs at least one move.');
    if (ids.length > 4) throw new SaveEditError('A Pokémon knows at most 4 moves.');
    if (new Set(ids).size !== ids.length) throw new SaveEditError('The same move appears twice.');
    for (const id of ids) {
      if (!this.lookup.moves.has(id)) throw new SaveEditError(`Unknown move #${id}.`);
      if (mon.location === 'box' && id > MAX_BOX_MOVE_ID) {
        throw new SaveEditError(`Move #${id} cannot be stored in the PC.`);
      }
    }
    const next = [0, 1, 2, 3].map((i) => ids[i] ?? 0);
    const bytes = this.locate(mon);

    if (mon.location === 'box') {
      const old = readBoxMoves(bytes);
      let bonuses = bytes.getU8(BOX.ppBonuses);
      let packed = 0n;
      next.forEach((id, i) => {
        if (id !== old[i]) bonuses &= ~(0b11 << (i * 2));
        packed |= BigInt(id) << BigInt(10 * i);
      });
      for (let i = 0; i < 5; i++)
        bytes.setU8(BOX.moves + i, Number((packed >> BigInt(8 * i)) & 0xffn));
      bytes.setU8(BOX.ppBonuses, bonuses);
      return;
    }

    let bonuses = bytes.getU8(PARTY.ppBonuses);
    next.forEach((id, i) => {
      const old = bytes.getU16(PARTY.moves + i * 2);
      if (id === old) return;
      bonuses &= ~(0b11 << (i * 2));
      bytes.setU16(PARTY.moves + i * 2, id);
      bytes.setU8(PARTY.pp + i, id ? this.lookup.moves.get(id)!.basePp : 0);
    });
    bytes.setU8(PARTY.ppBonuses, bonuses);
  }

  /** The bytes of a Pokémon in the save, checked against its personality value */
  restore(mon: ParsedPokemon, original: Uint8Array): void {
    this.locate(mon);
    for (const offset of this.byteOffsets(mon)) this.writer.bytes[offset] = original[offset];
  }

  private locate(mon: ParsedPokemon): MonBytes {
    const offsets = this.byteOffsets(mon);
    const bytes = new MonBytes(this.writer.view, offsets);
    if (bytes.getU32(0) !== mon.personality >>> 0) {
      throw new SaveEditError('This Pokémon is not where expected in the save: was it moved?');
    }
    if (mon.location === 'party' && bytes.getU16(PARTY.dataChecksum) !== 0) {
      throw new SaveEditError('This party format is not supported for editing.');
    }
    return bytes;
  }

  setParty(team: readonly ParsedPokemon[], save: ParsedSave): void {
    if (team.length < 1 || team.length > 6) {
      throw new SaveEditError('The team needs 1 to 6 Pokémon.');
    }
    const key = (p: ParsedPokemon) => `${p.personality}:${p.trainerId}:${p.secretId}`;
    const joining = new Set(team.map(key));
    const partyBytes = team.map((mon) =>
      mon.location === 'party' ? this.read(this.locate(mon), PARTY_MON_SIZE) : this.toParty(mon),
    );
    const leaving = save.team.filter((p) => !joining.has(key(p)));
    const leavingBytes = leaving.map((mon) => this.toBox(mon));

    // Slots freed by the newcomers, then the empty ones
    const free: number[][] = [];
    for (const mon of team.filter((p) => p.location === 'box')) {
      const offsets = this.byteOffsets(mon);
      offsets.forEach((o) => this.writer.view.setUint8(o, 0));
      free.push(offsets);
    }
    for (const slot of this.emptyBoxSlots()) {
      if (free.length >= leavingBytes.length) break;
      free.push(slot);
    }
    if (free.length < leavingBytes.length) {
      throw new SaveEditError('The PC is full: no room for the Pokémon leaving the team.');
    }
    leavingBytes.forEach((data, i) =>
      free[i].forEach((o, j) => this.writer.view.setUint8(o, data[j])),
    );

    const partyStart = this.writer.sectionOffset(1) + PARTY_LIST_OFFSET;
    for (let slot = 0; slot < 6; slot++) {
      const data = partyBytes[slot] ?? new Uint8Array(PARTY_MON_SIZE);
      data.forEach((b, j) => this.writer.view.setUint8(partyStart + slot * PARTY_MON_SIZE + j, b));
    }
    this.writer.view.setUint32(
      this.writer.sectionOffset(1) + PARTY_COUNT_OFFSET,
      team.length,
      true,
    );
  }

  private read(bytes: MonBytes, size: number): Uint8Array {
    return Uint8Array.from(range(size), (i) => bytes.getU8(i));
  }

  /** Byte offsets of every empty PC slot, main boxes first */
  private emptyBoxSlots(): number[][] {
    const slots: number[][] = [];
    const empty = (offsets: number[]) =>
      offsets.slice(0, 8).every((o) => this.writer.view.getUint8(o) === 0);
    for (let k = 0; k < PC_MAIN_SLOTS; k++) {
      const offsets = this.byteOffsets({
        location: 'box',
        region: 'main',
        box: Math.floor(k / SLOTS_PER_BOX) + 1,
        slot: (k % SLOTS_PER_BOX) + 1,
      } as ParsedPokemon);
      if (empty(offsets)) slots.push(offsets);
    }
    for (let k = 0; k < PC_EXTRA_SLOTS; k++) {
      const offsets = this.byteOffsets({
        location: 'box',
        region: 'extra',
        slot: k + 1,
      } as ParsedPokemon);
      if (empty(offsets)) slots.push(offsets);
    }
    return slots;
  }

  private toParty(mon: ParsedPokemon): Uint8Array {
    const box = this.read(this.locate(mon), BOX_MON_SIZE);
    const species = this.lookup.species.get(mon.speciesId);
    if (!species?.growthRate) {
      throw new SaveEditError(
        `${species?.name ?? 'This Pokémon'}: its level is unknown (experience curve), it cannot join the team from here.`,
      );
    }
    const party = new Uint8Array(PARTY_MON_SIZE);
    const view = new DataView(party.buffer);
    party.set(box.subarray(0, 0x1c), 0);
    // Growth: species, item, XP, PP Ups, friendship, ball
    party.set(box.subarray(0x1c, 0x27), 0x20);
    mon.moves.forEach((id, i) => {
      view.setUint16(0x2c + i * 2, id, true);
      const ups = (mon.ppBonuses >> (2 * i)) & 3;
      const base = this.lookup.moves.get(id)?.basePp ?? 0;
      party[0x34 + i] = Math.floor((base * (5 + ups)) / 5);
    });
    // EVs (contest stats stay 0), then Misc
    party.set(box.subarray(0x2c, 0x32), 0x38);
    party.set(box.subarray(0x32, 0x3a), 0x44);
    // Status 0, no mail
    party[0x55] = 0xff;
    const level = levelFromExperience(species.growthRate, mon.experience);
    party[PARTY.level] = level;
    const bytes = new MonBytes(view, range(PARTY_MON_SIZE));
    bytes.setU16(PARTY.currentHp, 1);
    bytes.setU16(PARTY.maxHp, 1);
    this.refreshPartyStats(bytes, { ...mon, location: 'party' }, level, mon.personality);
    return party;
  }

  private toBox(mon: ParsedPokemon): Uint8Array {
    const party = this.read(this.locate(mon), PARTY_MON_SIZE);
    const box = new Uint8Array(BOX_MON_SIZE);
    box.set(party.subarray(0, 0x1c), 0);
    box.set(party.subarray(0x20, 0x2b), 0x1c);
    let packed = 0n;
    [0, 1, 2, 3].forEach((i) => {
      const id = party[0x2c + i * 2] | (party[0x2d + i * 2] << 8);
      if (id > MAX_BOX_MOVE_ID) throw new SaveEditError(`Move #${id} cannot be stored in the PC.`);
      packed |= BigInt(id) << BigInt(10 * i);
    });
    for (let i = 0; i < 5; i++) box[0x27 + i] = Number((packed >> BigInt(8 * i)) & 0xffn);
    box.set(party.subarray(0x38, 0x3e), 0x2c);
    box.set(party.subarray(0x44, 0x4c), 0x32);
    return box;
  }

  /** File offset of every byte of the Pokémon */
  private byteOffsets(mon: ParsedPokemon): number[] {
    if (mon.location === 'party') {
      const start =
        this.writer.sectionOffset(1) + PARTY_LIST_OFFSET + (mon.slot - 1) * PARTY_MON_SIZE;
      return range(PARTY_MON_SIZE).map((i) => start + i);
    }
    if (mon.region === 'extra') {
      const start =
        this.writer.sectionOffset(PC_EXTRA_SECTION) +
        PC_EXTRA_OFFSET +
        (mon.slot - 1) * BOX_MON_SIZE;
      return range(BOX_MON_SIZE).map((i) => start + i);
    }
    const index = ((mon.box ?? 1) - 1) * SLOTS_PER_BOX + (mon.slot - 1);
    const start = PC_MAIN_HEADER + index * BOX_MON_SIZE;
    return range(BOX_MON_SIZE).map((i) => {
      const position = start + i;
      const section = PC_FIRST_SECTION + Math.floor(position / PC_SECTION_DATA_SIZE);
      return this.writer.sectionOffset(section) + (position % PC_SECTION_DATA_SIZE);
    });
  }
}

/** Little-endian access to a Pokémon's bytes, wherever they are in the file */
class MonBytes {
  constructor(
    private readonly view: DataView,
    private readonly offsets: readonly number[],
  ) {}

  getU8(at: number): number {
    return this.view.getUint8(this.offsets[at]);
  }

  setU8(at: number, value: number): void {
    this.view.setUint8(this.offsets[at], value & 0xff);
  }

  getU16(at: number): number {
    return this.getU8(at) | (this.getU8(at + 1) << 8);
  }

  setU16(at: number, value: number): void {
    this.setU8(at, value);
    this.setU8(at + 1, value >>> 8);
  }

  getU32(at: number): number {
    return (this.getU16(at) | (this.getU16(at + 2) << 16)) >>> 0;
  }

  setU32(at: number, value: number): void {
    this.setU16(at, value & 0xffff);
    this.setU16(at + 2, value >>> 16);
  }
}

export function isShinyPersonality(
  personality: number,
  trainerId: number,
  secretId: number,
): boolean {
  return (trainerId ^ secretId ^ (personality >>> 16) ^ (personality & 0xffff)) < 8;
}

export function findPersonality(
  mon: Pick<ParsedPokemon, 'personality' | 'trainerId' | 'secretId'>,
  nature: number,
  shiny: boolean,
  keepUnownLetter = false,
  abilitySlot?: number,
): number {
  const old = mon.personality >>> 0;
  const ids = mon.trainerId ^ mon.secretId;
  // Gender byte: kept, unless the ability slot (its parity) changes
  const lowByte =
    abilitySlot === undefined || (old & 1) === abilitySlot
      ? old & 0xff
      : sameGenderByte(old & 0xff, abilitySlot);
  if (keepUnownLetter && lowByte !== (old & 0xff)) {
    throw new SaveEditError('Unown cannot change its ability.');
  }
  const keep = (candidate: number) =>
    keepUnownLetter ? ((candidate & ~0x03030303) | (old & 0x03030303)) >>> 0 : candidate >>> 0;
  const fits = (p: number) =>
    (p & 0xff) === lowByte &&
    p % 25 === nature &&
    isShinyPersonality(p, mon.trainerId, mon.secretId) === shiny;

  const start = Math.floor(Math.random() * 0x10000);
  for (let n = 0; n < 0x10000; n++) {
    const seed = (start + n) & 0xffff;
    const low = ((seed & 0xff00) | lowByte) & 0xffff;
    if (shiny) {
      for (let r = 0; r < 8; r++) {
        const high = (ids ^ low ^ r) & 0xffff;
        const p = keep(((high << 16) | low) >>> 0);
        if (fits(p)) return p;
      }
    } else {
      const high = (seed * 0x9e37 + start) & 0xffff;
      const p = keep(((high << 16) | low) >>> 0);
      if (fits(p)) return p;
    }
  }
  throw new SaveEditError('No personality found for this nature and shininess.');
}

export function followsCurve(mon: ParsedPokemon, rate: GrowthRate): boolean {
  if (mon.location !== 'party' || !mon.level) return true;
  if (mon.level >= MAX_LEVEL) return reachesLevel(rate, mon.experience, MAX_LEVEL);
  return (
    reachesLevel(rate, mon.experience, mon.level) &&
    !reachesLevel(rate, mon.experience, mon.level + 1)
  );
}

const GROWTH_RATES: GrowthRate[] = [
  'fast',
  'medium-fast',
  'medium-slow',
  'slow',
  'erratic',
  'fluctuating',
];

// The data curve when the Pokémon follows it, otherwise the only curve that fits the
// level and experience of a party Pokémon of that species (party mons store both).
export function resolveGrowthRate(
  mon: ParsedPokemon,
  known: GrowthRate | null,
  party: readonly ParsedPokemon[],
): GrowthRate | null {
  if (known && followsCurve(mon, known)) return known;
  const sources = [mon, ...party.filter((p) => p.speciesId === mon.speciesId)];
  for (const source of sources) {
    if (source.location !== 'party' || !source.level) continue;
    const fits = GROWTH_RATES.filter((r) => followsCurve(source, r) && followsCurve(mon, r));
    if (fits.length === 1) return fits[0];
  }
  return null;
}

function curveError(species: string): SaveEditError {
  return new SaveEditError(
    `${species}: Radical Red uses another experience curve for this species. Level it in game.`,
  );
}

/** Gender thresholds of the species gender ratios (female when the byte is below) */
const GENDER_THRESHOLDS = [31, 63, 127, 191];

export function sameGenderByte(byte: number, parity: number): number {
  for (let distance = 1; distance < 256; distance += 2) {
    for (const candidate of [byte + distance, byte - distance]) {
      if (candidate < 0 || candidate > 255 || (candidate & 1) !== parity) continue;
      if (GENDER_THRESHOLDS.every((t) => byte < t === candidate < t)) return candidate;
    }
  }
  return byte;
}

function encodeText(text: string, length: number): number[] | null {
  if (text.length > length) return null;
  const out: number[] = [];
  for (const c of text) {
    const code = c.charCodeAt(0);
    if (c >= 'A' && c <= 'Z') out.push(0xbb + code - 65);
    else if (c >= 'a' && c <= 'z') out.push(0xd5 + code - 97);
    else if (c >= '0' && c <= '9') out.push(0xa1 + code - 48);
    else if (c === ' ') out.push(0x00);
    else if (c in SYMBOL_BYTES) out.push(SYMBOL_BYTES[c]);
    else return null;
  }
  while (out.length < length) out.push(0xff);
  return out;
}

function readBoxMoves(bytes: MonBytes): number[] {
  let packed = 0n;
  for (let i = 0; i < 5; i++) packed |= BigInt(bytes.getU8(BOX.moves + i)) << BigInt(8 * i);
  return [0, 1, 2, 3].map((i) => Number((packed >> BigInt(10 * i)) & 0x3ffn));
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}
