import type { PokemonLookup } from './pokemon.models';
import type { ParsedPokemon, Stats } from './save-file-parser';
import { SaveFileWriter } from './save-file-writer';
import { experienceForLevel, levelFromExperience, MAX_LEVEL } from '../shared/experience';

const PARTY_LIST_OFFSET = 0x38;
const PARTY_MON_SIZE = 100;
const BOX_MON_SIZE = 58;
const SLOTS_PER_BOX = 30;
const PC_FIRST_SECTION = 5;
const PC_SECTION_DATA_SIZE = 0xf80;
const PC_MAIN_HEADER = 4;
const PC_EXTRA_SECTION = 0;
const PC_EXTRA_OFFSET = 0xb0;

/** Nickname: 10 bytes at 0x08 in both formats */
const NICKNAME = 0x08;
const NICKNAME_LENGTH = 10;

// Party layout (plain): data at 0x20 in the order Growth / Attacks / EVs / Misc
const PARTY = {
  species: 0x20,
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
} as const;

// PC layout (compressed)
const BOX = {
  species: 0x1c,
  experience: 0x20,
  ppBonuses: 0x24,
  /** 4 moves x 10 bits, packed over 5 bytes */
  moves: 0x27,
} as const;

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

export class SaveEditor {
  constructor(
    readonly writer: SaveFileWriter,
    private readonly lookup: PokemonLookup,
  ) {}

  setLevel(mon: ParsedPokemon, level: number): void {
    const target = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
    const species = this.lookup.species.get(mon.speciesId);
    if (!species?.growthRate) {
      throw new SaveEditError(`Unknown growth rate for species #${mon.speciesId}.`);
    }
    const experience = experienceForLevel(species.growthRate, target);
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

  setSpecies(mon: ParsedPokemon, speciesId: number): ParsedPokemon {
    const from = this.lookup.species.get(mon.speciesId);
    const to = this.lookup.species.get(speciesId);
    if (!to) throw new SaveEditError(`Unknown species #${speciesId}.`);
    const bytes = this.locate(mon);
    if (speciesId === mon.speciesId) return mon;

    const isParty = mon.location === 'party';
    bytes.setU16(isParty ? PARTY.species : BOX.species, speciesId);
    const edited: ParsedPokemon = { ...mon, speciesId };

    // Same level under the new experience curve
    const level = isParty
      ? bytes.getU8(PARTY.level)
      : from?.growthRate
        ? levelFromExperience(from.growthRate, mon.experience)
        : null;
    if (level !== null && to.growthRate && from?.growthRate !== to.growthRate) {
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
): number {
  const old = mon.personality >>> 0;
  const ids = mon.trainerId ^ mon.secretId;
  const keep = (candidate: number) =>
    keepUnownLetter ? ((candidate & ~0x03030303) | (old & 0x03030303)) >>> 0 : candidate >>> 0;
  const fits = (p: number) =>
    (p & 0xff) === (old & 0xff) &&
    p % 25 === nature &&
    isShinyPersonality(p, mon.trainerId, mon.secretId) === shiny;

  const start = Math.floor(Math.random() * 0x10000);
  for (let n = 0; n < 0x10000; n++) {
    const seed = (start + n) & 0xffff;
    const low = ((seed & 0xff00) | (old & 0xff)) & 0xffff;
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

function encodeText(text: string, length: number): number[] | null {
  if (text.length > length) return null;
  const out: number[] = [];
  for (const c of text) {
    const code = c.charCodeAt(0);
    if (c >= 'A' && c <= 'Z') out.push(0xbb + code - 65);
    else if (c >= 'a' && c <= 'z') out.push(0xd5 + code - 97);
    else if (c >= '0' && c <= '9') out.push(0xa1 + code - 48);
    else if (c === ' ') out.push(0x00);
    else if (c === '!') out.push(0xab);
    else if (c === '?') out.push(0xac);
    else if (c === '.') out.push(0xad);
    else if (c === '-') out.push(0xae);
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
