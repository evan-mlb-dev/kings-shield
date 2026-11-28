import { Injectable } from '@angular/core';
import type { ParsedPokemon, Stats } from '../models/pokemon/pokemon';
import { TEXT_SYMBOLS } from './gen3-text';
import type { AbilityRandomizer } from '../shared/ability-randomizer';

export type { ParsedPokemon, Stats };

/** Supported games, told apart by the save signature */
export type GameId = 'radical-red' | 'unbound';

export const GAME_NAMES: Readonly<Record<GameId, string>> = {
  'radical-red': 'Radical Red',
  unbound: 'Pokémon Unbound',
};

/** Section signature written by each game (Unbound's CFRU build uses its own) */
export const GAME_SIGNATURES: ReadonlyMap<number, GameId> = new Map([
  [0x08012025, 'radical-red'],
  [0x01121999, 'unbound'],
]);

export interface ParsedSave {
  /** Missing in saves stored before Unbound support: Radical Red */
  game?: GameId;
  team: ParsedPokemon[];
  pc: ParsedPokemon[];
  trainerName: string;
  trainerId: number;
  secretId: number;
  boxNames: string[];
  tmCase?: number[];
  bagItems?: number[];
  bagBerries?: number[];
  /** In-game randomizer options of the run */
  randomizer?: RandomizerOptions;
}

export interface RandomizerOptions {
  species: boolean;
  learnsets: boolean;
  abilities: boolean;
  restricted: boolean;
}

// RR save = FireRed layout, except:
// - party mons are not encrypted / shuffled (checksum 0)
// - PC mons are 58 bytes, moves packed on 10 bits
// - PC split between sections 5-13 and a chunk of section 0
@Injectable({
  providedIn: 'root',
})
export class SaveFileParser {
  private readonly SECTION_SIZE = 0x1000;
  private readonly SECTIONS_PER_BLOCK = 14;
  /** One save block = 14 sections of 4 KB = 0xE000 */
  private readonly BLOCK_SIZE = this.SECTIONS_PER_BLOCK * this.SECTION_SIZE;
  private readonly FOOTER_OFFSET = 0xff4;
  /** Usable data bytes per section */
  private readonly SECTION_DATA_SIZE = 0xf80;

  // Party (section 1)
  private readonly PARTY_COUNT_OFFSET = 0x34;
  private readonly PARTY_LIST_OFFSET = 0x38;
  private readonly PARTY_MON_SIZE = 100;

  // PC (Radical Red compressed format)
  private readonly BOX_MON_SIZE = 58;
  private readonly SLOTS_PER_BOX = 30;
  private readonly PC_MAIN_FIRST_SECTION = 5;
  private readonly PC_MAIN_LAST_SECTION = 13;
  /** Main PC Pokémon start 4 bytes after the beginning of section 5 */
  private readonly PC_MAIN_HEADER = 4;
  private readonly PC_MAIN_SLOTS = 562;
  private readonly PC_EXTRA_SECTION = 0;
  private readonly PC_EXTRA_OFFSET = 0xb0;
  private readonly PC_EXTRA_SLOTS = 63;

  // bag has its own sector: key items +0x1F0, balls +0x31C, TMs +0x3E4, berries +0x5E4
  private readonly BAG_SECTOR = 0x1e000;
  private readonly TM_CASE_OFFSET = 0x3e4;
  private readonly TM_CASE_SLOTS = 128;
  private readonly ITEMS_POCKET_SECTION = 13;
  private readonly ITEMS_POCKET_OFFSET = 0xad8;
  private readonly SECTION_DATA_END = 0xff0;
  private readonly BERRIES_OFFSET = 0x5e4;
  private readonly BERRIES_SLOTS = 64;

  // randomizer options: section 0 byte (species 0x1, learnsets 0x2, abilities 0x4),
  // Restricted mode: section 4 byte, bit 0x40
  private readonly RANDOMIZER_OFFSET = 0xf2c;
  private readonly RESTRICTED_SECTION = 4;
  private readonly RESTRICTED_OFFSET = 0xdc3;

  private readonly BOX_NAMES_OFFSET_IN_PC = 0x7f61;
  private readonly BOX_NAME_SIZE = 9;
  private readonly BOX_COUNT = 25;

  private readonly SUBSTRUCTURE_ORDERS: number[][] = [
    [0, 1, 2, 3],
    [0, 1, 3, 2],
    [0, 2, 1, 3],
    [0, 2, 3, 1],
    [0, 3, 1, 2],
    [0, 3, 2, 1],
    [1, 0, 2, 3],
    [1, 0, 3, 2],
    [1, 2, 0, 3],
    [1, 2, 3, 0],
    [1, 3, 0, 2],
    [1, 3, 2, 0],
    [2, 0, 1, 3],
    [2, 0, 3, 1],
    [2, 1, 0, 3],
    [2, 1, 3, 0],
    [2, 3, 0, 1],
    [2, 3, 1, 0],
    [3, 0, 1, 2],
    [3, 0, 2, 1],
    [3, 1, 0, 2],
    [3, 1, 2, 0],
    [3, 2, 0, 1],
    [3, 2, 1, 0],
  ];

  parseSaveFile(arrayBuffer: ArrayBuffer): ParsedSave | null {
    const fileSize = arrayBuffer.byteLength;

    // 128 KB, or 128 KB + 16 bytes (RTC clock appended by mGBA)
    if (fileSize !== 131072 && fileSize !== 131088) {
      console.error(`Invalid file size (${fileSize} bytes). Not a valid 128 KB GBA .sav file.`);
      return null;
    }

    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const sections = this.findActiveSections(view);

    if (!sections) {
      console.error('No valid save block found.');
      return null;
    }

    const trainerOff = sections.get(0)!;
    const trainerOtId = view.getUint32(trainerOff + 0x0a, true);
    const game = GAME_SIGNATURES.get(view.getUint32(trainerOff + this.FOOTER_OFFSET + 4, true))!;

    const team = this.extractTeam(view, bytes, sections.get(1)!);
    const pcBuffer = this.buildPcBuffer(bytes, sections);
    const pc = [
      ...this.extractBoxes(pcBuffer, this.PC_MAIN_HEADER, this.PC_MAIN_SLOTS, 'main'),
      ...this.extractBoxes(
        bytes,
        sections.get(this.PC_EXTRA_SECTION)! + this.PC_EXTRA_OFFSET,
        this.PC_EXTRA_SLOTS,
        'extra',
      ),
    ];

    const boxNames: string[] = [];
    for (let i = 0; i < this.BOX_COUNT; i++) {
      const o = this.BOX_NAMES_OFFSET_IN_PC + i * this.BOX_NAME_SIZE;
      boxNames.push(this.decodeText(pcBuffer.subarray(o, o + this.BOX_NAME_SIZE)));
    }

    // The randomizer options are a Radical Red feature: those bytes mean something else elsewhere
    const flags = game === 'radical-red' ? bytes[trainerOff + this.RANDOMIZER_OFFSET] : 0;
    const randomizer: RandomizerOptions = {
      species: (flags & 0x1) !== 0,
      learnsets: (flags & 0x2) !== 0,
      abilities: (flags & 0x4) !== 0,
      restricted:
        game === 'radical-red' &&
        (bytes[sections.get(this.RESTRICTED_SECTION)! + this.RESTRICTED_OFFSET] & 0x40) !== 0,
    };
    const runRandomizer: AbilityRandomizer = {
      otId: trainerOtId,
      restricted: randomizer.restricted,
    };
    for (const mon of [...team, ...pc]) {
      if (randomizer.abilities) mon.randomAbilities = runRandomizer;
      if (randomizer.learnsets) mon.randomMoves = runRandomizer;
    }

    console.log(`${GAME_NAMES[game]}: party ${team.length} Pokémon, PC ${pc.length} Pokémon.`);
    return {
      game,
      team,
      pc,
      trainerName: this.decodeText(bytes.subarray(trainerOff, trainerOff + 7)),
      trainerId: trainerOtId & 0xffff,
      secretId: trainerOtId >>> 16,
      boxNames,
      tmCase: this.readTmCase(view),
      bagItems: this.readItemsPocket(view, sections.get(this.ITEMS_POCKET_SECTION)),
      bagBerries: this.readPocket(view, this.BAG_SECTOR + this.BERRIES_OFFSET, this.BERRIES_SLOTS),
      randomizer,
    };
  }

  /** Item IDs of the TM case (empty slots skipped) */
  private readTmCase(view: DataView): number[] {
    const ids: number[] = [];
    const start = this.BAG_SECTOR + this.TM_CASE_OFFSET;
    for (let i = 0; i < this.TM_CASE_SLOTS; i++) {
      const id = view.getUint16(start + i * 4, true);
      if (id) ids.push(id);
    }
    return ids;
  }

  /** Item IDs of the Items pocket */
  private readItemsPocket(view: DataView, sectionOffset: number | undefined): number[] {
    if (sectionOffset === undefined) return [];
    const start = sectionOffset + this.ITEMS_POCKET_OFFSET;
    return this.readPocket(view, start, (this.SECTION_DATA_END - this.ITEMS_POCKET_OFFSET) / 4);
  }

  private readPocket(view: DataView, start: number, slots: number): number[] {
    const ids: number[] = [];
    for (let i = 0; i < slots && start + i * 4 + 4 <= view.byteLength; i++) {
      const id = view.getUint16(start + i * 4, true);
      if (!id) break;
      if (view.getUint16(start + i * 4 + 2, true) > 0) ids.push(id);
    }
    return ids;
  }

  private findActiveSections(view: DataView): Map<number, number> | null {
    let best: { index: number; sections: Map<number, number> } | null = null;

    for (let block = 0; block < 2; block++) {
      const blockStart = block * this.BLOCK_SIZE;
      const sections = new Map<number, number>();
      let saveIndex = 0;

      for (let i = 0; i < this.SECTIONS_PER_BLOCK; i++) {
        const sectorOffset = blockStart + i * this.SECTION_SIZE;
        const footer = sectorOffset + this.FOOTER_OFFSET;

        const sectionId = view.getUint16(footer, true);
        const signature = view.getUint32(footer + 4, true);
        const index = view.getUint32(footer + 8, true);

        if (!GAME_SIGNATURES.has(signature) || sectionId >= this.SECTIONS_PER_BLOCK) continue;

        sections.set(sectionId, sectorOffset);
        saveIndex = index;
      }

      if (sections.size !== this.SECTIONS_PER_BLOCK) continue;
      if (!best || saveIndex > best.index) {
        best = { index: saveIndex, sections };
      }
    }

    return best ? best.sections : null;
  }

  private buildPcBuffer(bytes: Uint8Array, sections: Map<number, number>): Uint8Array {
    const count = this.PC_MAIN_LAST_SECTION - this.PC_MAIN_FIRST_SECTION + 1;
    const buffer = new Uint8Array(count * this.SECTION_DATA_SIZE);
    for (let i = 0; i < count; i++) {
      const offset = sections.get(this.PC_MAIN_FIRST_SECTION + i)!;
      buffer.set(
        bytes.subarray(offset, offset + this.SECTION_DATA_SIZE),
        i * this.SECTION_DATA_SIZE,
      );
    }
    return buffer;
  }

  private extractTeam(view: DataView, bytes: Uint8Array, sectionOffset: number): ParsedPokemon[] {
    const team: ParsedPokemon[] = [];
    const count = Math.min(view.getUint32(sectionOffset + this.PARTY_COUNT_OFFSET, true), 6);

    for (let i = 0; i < count; i++) {
      const offset = sectionOffset + this.PARTY_LIST_OFFSET + i * this.PARTY_MON_SIZE;
      const mon = this.parsePartyPokemon(view, bytes, offset);
      if (mon) {
        mon.slot = i + 1;
        team.push(mon);
      }
    }
    return team;
  }

  private parsePartyPokemon(
    view: DataView,
    bytes: Uint8Array,
    offset: number,
  ): ParsedPokemon | null {
    const personality = view.getUint32(offset, true);
    const otId = view.getUint32(offset + 0x04, true);
    if (personality === 0 && otId === 0) return null;

    const data = this.readPartyData(view, offset, personality, otId);
    const G = data.base(0);
    const A = data.base(1);
    const E = data.base(2);
    const M = data.base(3);
    const d = data.view;

    const speciesId = d.getUint16(G, true);
    if (speciesId === 0) return null;

    const ivWord = d.getUint32(M + 4, true);
    const movesRaw = [0, 1, 2, 3].map((i) => d.getUint16(A + i * 2, true));
    const ppRaw = [0, 1, 2, 3].map((i) => d.getUint8(A + 8 + i));
    const valid = movesRaw.map((m, i) => (m > 0 ? i : -1)).filter((i) => i >= 0);

    return {
      location: 'party',
      slot: 0,
      personality,
      trainerId: otId & 0xffff,
      secretId: otId >>> 16,
      nickname: this.decodeText(bytes.subarray(offset + 0x08, offset + 0x12)),
      otName: this.decodeText(bytes.subarray(offset + 0x14, offset + 0x1b)),
      language: bytes[offset + 0x12],
      speciesId,
      heldItem: d.getUint16(G + 2, true),
      experience: d.getUint32(G + 4, true),
      ppBonuses: d.getUint8(G + 8),
      friendship: d.getUint8(G + 9),
      // CFRU: byte after friendship (the vanilla origins bits stay at 0)
      ball: d.getUint8(G + 10),
      moves: valid.map((i) => movesRaw[i]),
      pp: valid.map((i) => ppRaw[i]),
      evs: {
        hp: d.getUint8(E),
        atk: d.getUint8(E + 1),
        def: d.getUint8(E + 2),
        spe: d.getUint8(E + 3),
        spa: d.getUint8(E + 4),
        spd: d.getUint8(E + 5),
      },
      ivs: this.decodeIvs(ivWord),
      isEgg: ((ivWord >>> 30) & 1) === 1,
      abilitySlot: personality & 1,
      hiddenAbility: ((ivWord >>> 31) & 1) === 1,
      isShiny: this.isShiny(otId, personality),
      metLocation: d.getUint8(M + 1),
      level: view.getUint8(offset + 0x54),
      currentHp: view.getUint16(offset + 0x56, true),
      stats: {
        maxHp: view.getUint16(offset + 0x58, true),
        atk: view.getUint16(offset + 0x5a, true),
        def: view.getUint16(offset + 0x5c, true),
        spe: view.getUint16(offset + 0x5e, true),
        spa: view.getUint16(offset + 0x60, true),
        spd: view.getUint16(offset + 0x62, true),
      },
    };
  }

  private readPartyData(
    view: DataView,
    offset: number,
    personality: number,
    otId: number,
  ): { view: DataView; base: (type: number) => number } {
    const stored = view.getUint16(offset + 0x1c, true);
    const sum = (dv: DataView) => {
      let s = 0;
      for (let i = 0; i < 24; i++) s = (s + dv.getUint16(i * 2, true)) & 0xffff;
      return s;
    };

    if (stored !== 0) {
      const key = (personality ^ otId) >>> 0;
      const dec = new DataView(new ArrayBuffer(48));
      for (let i = 0; i < 12; i++) {
        dec.setUint32(i * 4, (view.getUint32(offset + 0x20 + i * 4, true) ^ key) >>> 0, true);
      }
      if (sum(dec) === stored) {
        const order = this.SUBSTRUCTURE_ORDERS[personality % 24];
        return { view: dec, base: (type) => order.indexOf(type) * 12 };
      }
    }

    const plain = new DataView(
      view.buffer.slice(view.byteOffset + offset + 0x20, view.byteOffset + offset + 0x50),
    );
    return { view: plain, base: (type) => type * 12 };
  }

  private extractBoxes(
    buffer: Uint8Array,
    start: number,
    slots: number,
    region: 'main' | 'extra',
  ): ParsedPokemon[] {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const out: ParsedPokemon[] = [];

    for (let k = 0; k < slots; k++) {
      const offset = start + k * this.BOX_MON_SIZE;
      if (offset + this.BOX_MON_SIZE > buffer.length) break;

      const mon = this.parseBoxPokemon(view, buffer, offset);
      if (!mon) continue;

      mon.region = region;
      if (region === 'main') {
        mon.box = Math.floor(k / this.SLOTS_PER_BOX) + 1;
        mon.slot = (k % this.SLOTS_PER_BOX) + 1;
      } else {
        mon.slot = k + 1;
      }
      out.push(mon);
    }
    return out;
  }

  private parseBoxPokemon(view: DataView, bytes: Uint8Array, offset: number): ParsedPokemon | null {
    const personality = view.getUint32(offset, true);
    const otId = view.getUint32(offset + 0x04, true);
    if (personality === 0 || otId === 0) return null;

    const language = bytes[offset + 0x12];
    const speciesId = view.getUint16(offset + 0x1c, true);

    // Sanity checks: skip areas that are not actual Pokémon
    if (language < 1 || language > 7) return null;
    if (speciesId === 0 || speciesId > 1800) return null;
    if (!this.isValidText(bytes.subarray(offset + 0x08, offset + 0x12))) return null;
    if (!this.isValidText(bytes.subarray(offset + 0x14, offset + 0x1b))) return null;

    // 4 moves of 10 bits over 5 bytes (40 bits): BigInt avoids 32-bit operator limits
    let packed = 0n;
    for (let i = 0; i < 5; i++) packed |= BigInt(bytes[offset + 0x27 + i]) << BigInt(8 * i);
    const moves = [0, 1, 2, 3]
      .map((i) => Number((packed >> BigInt(10 * i)) & 0x3ffn))
      .filter((m) => m > 0);

    const ivWord = view.getUint32(offset + 0x36, true);

    return {
      location: 'box',
      slot: 0,
      personality,
      trainerId: otId & 0xffff,
      secretId: otId >>> 16,
      nickname: this.decodeText(bytes.subarray(offset + 0x08, offset + 0x12)),
      otName: this.decodeText(bytes.subarray(offset + 0x14, offset + 0x1b)),
      language,
      speciesId,
      heldItem: view.getUint16(offset + 0x1e, true),
      experience: view.getUint32(offset + 0x20, true),
      ppBonuses: bytes[offset + 0x24],
      friendship: bytes[offset + 0x25],
      ball: bytes[offset + 0x26],
      moves,
      pp: [],
      evs: {
        hp: bytes[offset + 0x2c],
        atk: bytes[offset + 0x2d],
        def: bytes[offset + 0x2e],
        spe: bytes[offset + 0x2f],
        spa: bytes[offset + 0x30],
        spd: bytes[offset + 0x31],
      },
      ivs: this.decodeIvs(ivWord),
      isEgg: ((ivWord >>> 30) & 1) === 1,
      abilitySlot: personality & 1,
      hiddenAbility: ((ivWord >>> 31) & 1) === 1,
      isShiny: this.isShiny(otId, personality),
      metLocation: bytes[offset + 0x33],
    };
  }

  private decodeIvs(word: number): Stats {
    return {
      hp: word & 0x1f,
      atk: (word >>> 5) & 0x1f,
      def: (word >>> 10) & 0x1f,
      spe: (word >>> 15) & 0x1f,
      spa: (word >>> 20) & 0x1f,
      spd: (word >>> 25) & 0x1f,
    };
  }

  private isShiny(otId: number, personality: number): boolean {
    const tid = otId & 0xffff;
    const sid = otId >>> 16;
    return (tid ^ sid ^ (personality >>> 16) ^ (personality & 0xffff)) < 8;
  }

  // Bytes after the 0xFF terminator are ignored: a name the player never typed keeps
  // leftover garbage there (the game copies the species name without padding).
  private isValidText(bytes: Uint8Array): boolean {
    let length = 0;
    for (const b of bytes) {
      if (b === 0xff) break;
      if (b !== 0 && (b < 0xa1 || b > 0xee) && !(b in TEXT_SYMBOLS)) return false;
      length++;
    }
    return length > 0;
  }

  private decodeText(bytes: Uint8Array): string {
    let out = '';
    for (const b of bytes) {
      if (b === 0xff) break;
      if (b === 0x00) out += ' ';
      else if (b in TEXT_SYMBOLS) out += TEXT_SYMBOLS[b];
      else if (b >= 0xa1 && b <= 0xaa)
        out += String.fromCharCode(0x30 + (b - 0xa1)); // 0-9
      else if (b >= 0xbb && b <= 0xd4)
        out += String.fromCharCode(0x41 + (b - 0xbb)); // A-Z
      else if (b >= 0xd5 && b <= 0xee)
        out += String.fromCharCode(0x61 + (b - 0xd5)); // a-z
      else out += '?';
    }
    return out;
  }
}
