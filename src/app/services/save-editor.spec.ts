import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import { Pokemon } from './pokemon.models';
import { evolutionsOf } from '../shared/evolutions';
import { experienceForLevel } from '../shared/experience';
import {
  computeStats,
  findPersonality,
  followsCurve,
  isShinyPersonality,
  SaveEditor,
  sameGenderByte,
} from './save-editor';
import { ParsedPokemon, ParsedSave, SaveFileParser } from './save-file-parser';
import { SaveFileWriter } from './save-file-writer';

const SAVE_PATH = resolve(process.cwd(), 'test-data/radical-red.sav');
const hasSave = existsSync(SAVE_PATH);

describe.skipIf(!hasSave)('SaveEditor (real save)', () => {
  let db: PokemonDb;
  let original: Uint8Array;
  let save: ParsedSave;
  let editor: SaveEditor;

  const parse = (bytes: Uint8Array) => new SaveFileParser().parseSaveFile(bytes.slice().buffer)!;
  const reparse = () => {
    const written = editor.writer.toBytes();
    expect(SaveFileWriter.open(written).ok).toBe(true);
    return parse(written);
  };
  const same = (a: ParsedPokemon) => (b: ParsedPokemon) => b.personality === a.personality;

  beforeEach(() => {
    db = TestBed.inject(PokemonDb);
    original = new Uint8Array(readFileSync(SAVE_PATH));
    save = parse(original);
    const result = SaveFileWriter.open(original);
    if (!result.ok) throw new Error(result.reason);
    editor = new SaveEditor(result.editor, db);
  });

  it('computes the same stats as the game for every party Pokémon', () => {
    for (const mon of save.team) {
      const species = db.species.get(mon.speciesId)!;
      const stats = computeStats(
        species.baseStats,
        mon.ivs,
        mon.evs,
        mon.level!,
        db.natures[mon.personality % 25],
        species.name === 'Shedinja',
      );
      expect({ species: species.name, ...stats }).toEqual({
        species: species.name,
        hp: mon.stats!.maxHp,
        atk: mon.stats!.atk,
        def: mon.stats!.def,
        spe: mon.stats!.spe,
        spa: mon.stats!.spa,
        spd: mon.stats!.spd,
      });
    }
  });

  it('levels up a party Pokémon: experience, level, stats and HP', () => {
    const mon = save.team[0];
    const target = Math.min(100, mon.level! + 10);
    editor.setLevel(mon, target);
    const edited = reparse().team.find(same(mon))!;

    const species = db.species.get(mon.speciesId)!;
    expect(edited.level).toBe(target);
    expect(edited.experience).toBe(experienceForLevel(species.growthRate!, target));
    expect(edited.stats!.maxHp).toBeGreaterThanOrEqual(mon.stats!.maxHp);
    expect(edited.currentHp).toBeLessThanOrEqual(edited.stats!.maxHp);
    expect(edited.stats!.atk).toBe(
      computeStats(species.baseStats, mon.ivs, mon.evs, target, db.natures[mon.personality % 25])
        .atk,
    );
    // Nothing else moved
    expect({ ...edited, level: 0, experience: 0, stats: 0, currentHp: 0 }).toEqual({
      ...mon,
      level: 0,
      experience: 0,
      stats: 0,
      currentHp: 0,
    });
  });

  it('levels a PC Pokémon through its experience', () => {
    const mon = save.pc[0];
    editor.setLevel(mon, 50);
    const edited = reparse().pc.find(same(mon))!;
    expect(edited.experience).toBe(
      experienceForLevel(db.species.get(mon.speciesId)!.growthRate!, 50),
    );
    expect({ ...edited, experience: 0 }).toEqual({ ...mon, experience: 0 });
  });

  it('changes the moves of a party Pokémon and refills the new move PP', () => {
    const mon = save.team[1];
    const tackle = 33;
    const moves = [tackle, ...mon.moves.filter((m) => m !== tackle).slice(1)];
    editor.setMoves(mon, moves);
    const edited = reparse().team.find(same(mon))!;
    expect(edited.moves).toEqual(moves);
    expect(edited.pp[0]).toBe(db.moves.get(tackle)!.basePp);
    // Unchanged moves keep their PP
    expect(edited.pp.slice(1)).toEqual(mon.pp.slice(1, moves.length));
  });

  it('changes the packed moves of a PC Pokémon', () => {
    const mon = save.pc[0];
    const moves = [1003, 33, 1];
    editor.setMoves(mon, moves);
    const edited = reparse().pc.find(same(mon))!;
    expect(edited.moves).toEqual(moves);
    expect({ ...edited, moves: [], ppBonuses: 0 }).toEqual({ ...mon, moves: [], ppBonuses: 0 });
  });

  it('edits a PC Pokémon whose bytes straddle two sections', () => {
    // Box 3 slot 9 (index 68) starts 0xF6C bytes into the PC: it crosses into section 6
    const source = save.pc[0];
    const straddling: ParsedPokemon = { ...source, region: 'main', box: 3, slot: 9 };
    const writer = editor.writer;
    // Copy the source's 58 bytes to that slot, byte by byte, the way the PC is laid out
    const at = (position: number) =>
      writer.sectionOffset(5 + Math.floor(position / 0xf80)) + (position % 0xf80);
    const from = 4 + ((source.box! - 1) * 30 + source.slot - 1) * 58;
    const to = 4 + 68 * 58;
    expect(Math.floor(to / 0xf80)).not.toBe(Math.floor((to + 57) / 0xf80));
    for (let i = 0; i < 58; i++) writer.bytes[at(to + i)] = writer.bytes[at(from + i)];

    editor.setMoves(straddling, [33]);
    const copies = reparse().pc.filter(same(source));
    const copy = copies.find((p) => p.box === 3 && p.slot === 9)!;
    expect(copy).toBeTruthy();
    expect(copy.nickname).toBe(source.nickname);
    expect(copy.moves).toEqual([33]);
  });

  it('refuses to edit a Pokémon that is not where expected', () => {
    const mon = { ...save.team[0], personality: save.team[0].personality ^ 1 };
    expect(() => editor.setLevel(mon, 50)).toThrow();
  });

  it('refuses invalid move sets', () => {
    const mon = save.team[0];
    expect(() => editor.setMoves(mon, [])).toThrow();
    expect(() => editor.setMoves(mon, [33, 33])).toThrow();
    expect(() => editor.setMoves(mon, [99999])).toThrow();
  });

  it('changes nature and shininess of a party Pokémon, keeping its gender, with new stats', () => {
    const mon = save.team[2];
    const nature = ((mon.personality % 25) + 7) % 25;
    const edited = editor.setNatureAndShiny(mon, { nature, shiny: !mon.isShiny });
    const reparsed = reparse().team.find(
      (p) => p.nickname === mon.nickname && p.slot === mon.slot,
    )!;

    expect(reparsed.personality).toBe(edited.personality);
    expect(reparsed.personality % 25).toBe(nature);
    expect(reparsed.isShiny).toBe(!mon.isShiny);
    expect(reparsed.personality & 0xff).toBe(mon.personality & 0xff);
    const species = db.species.get(mon.speciesId)!;
    const stats = computeStats(species.baseStats, mon.ivs, mon.evs, mon.level!, db.natures[nature]);
    expect(reparsed.stats!.atk).toBe(stats.atk);
    expect(reparsed.stats!.spa).toBe(stats.spa);
    expect(reparsed.stats!.maxHp).toBe(mon.stats!.maxHp);
    expect(reparsed.moves).toEqual(mon.moves);

    expect(() => editor.setLevel(mon, 50)).toThrow();
    editor.setLevel(edited, 50);
    expect(reparse().team.find(same(edited))!.level).toBe(50);
  });

  it('makes a PC Pokémon shiny', () => {
    const mon = save.pc[0];
    const edited = editor.setNatureAndShiny(mon, { shiny: true });
    const reparsed = reparse().pc.find(same(edited))!;
    expect(reparsed.isShiny).toBe(true);
    expect(reparsed.personality % 25).toBe(mon.personality % 25);
    expect({ ...reparsed, personality: 0, isShiny: false }).toEqual({
      ...mon,
      personality: 0,
      isShiny: false,
    });
  });

  it('evolves a party Pokémon: species, same level, new stats', () => {
    const mon = save.team.find((p) => evolutionsOf(p.speciesId, db).length > 0);
    if (!mon) return;
    const target = evolutionsOf(mon.speciesId, db)[0].speciesId;
    const edited = editor.setSpecies(mon, target);
    const reparsed = reparse().team.find(same(mon))!;
    expect(reparsed.speciesId).toBe(target);
    expect(reparsed.level).toBe(mon.level);
    expect(reparsed.nickname).toBe(edited.nickname);
    const species = db.species.get(target)!;
    const stats = computeStats(
      species.baseStats,
      mon.ivs,
      mon.evs,
      mon.level!,
      db.natures[mon.personality % 25],
    );
    expect(reparsed.stats!.maxHp).toBe(stats.hp);
    expect(reparsed.stats!.atk).toBe(stats.atk);
  });

  it('evolves a PC Pokémon without nickname: the species name follows', () => {
    const mon = save.pc.find((p) => evolutionsOf(p.speciesId, db).length > 0)!;
    const target = evolutionsOf(mon.speciesId, db)[0].speciesId;
    const from = db.species.get(mon.speciesId)!.name;
    const named = { ...mon, nickname: from };
    const encode = [...from].map((c) =>
      c >= 'a' ? 0xd5 + c.charCodeAt(0) - 97 : 0xbb + c.charCodeAt(0) - 65,
    );
    const writer = editor.writer;
    const at = (i: number) => writer.sectionOffset(5 + Math.floor(i / 0xf80)) + (i % 0xf80);
    const base = 4 + ((mon.box! - 1) * 30 + mon.slot - 1) * 58 + 8;
    for (let i = 0; i < 10; i++) writer.bytes[at(base + i)] = encode[i] ?? 0xff;

    editor.setSpecies(named, target);
    const reparsed = reparse().pc.find(same(mon))!;
    expect(reparsed.speciesId).toBe(target);
    const to = db.species.get(target)!.name;
    if (to.length <= 10 && /^[A-Za-z]+$/.test(to)) expect(reparsed.nickname).toBe(to);
  });

  it('switches between ability 1, ability 2 and the hidden ability (party and PC)', () => {
    const species = (p: ParsedPokemon) => db.species.get(p.speciesId)!.abilityIds;
    for (const mon of [
      save.team.find((p) => species(p)[2] && species(p)[0])!,
      save.pc.find((p) => !p.isEgg && species(p)[2] && species(p)[0])!,
    ]) {
      const other = (1 - mon.abilitySlot) as 0 | 1;
      const switched = editor.setAbility(mon, other);
      let reparsed = [...reparse().team, ...reparse().pc].find(same(switched))!;
      expect(reparsed.abilitySlot).toBe(other);
      expect(reparsed.hiddenAbility).toBe(false);
      // Same nature, shininess, IVs; gender byte on the same side of every ratio
      expect(reparsed.personality % 25).toBe(mon.personality % 25);
      expect(reparsed.isShiny).toBe(mon.isShiny);
      expect(reparsed.ivs).toEqual(mon.ivs);
      for (const t of [31, 63, 127, 191]) {
        expect((reparsed.personality & 0xff) < t).toBe((mon.personality & 0xff) < t);
      }

      const hidden = editor.setAbility(switched, 2);
      reparsed = [...reparse().team, ...reparse().pc].find(same(hidden))!;
      expect(reparsed.hiddenAbility).toBe(true);
      expect(reparsed.ivs).toEqual(mon.ivs);
      expect(reparsed.isEgg).toBe(false);

      editor.setAbility(hidden, mon.abilitySlot as 0 | 1);
      reparsed = [...reparse().team, ...reparse().pc].find(
        (p) => p.nickname === mon.nickname && p.speciesId === mon.speciesId,
      )!;
      expect(reparsed.hiddenAbility).toBe(false);
      expect(reparsed.abilitySlot).toBe(mon.abilitySlot);
    }
  });

  it('gives and takes held items, in the party and in the PC', () => {
    const leftovers = [...db.items.values()].find((i) => i.name === 'Leftovers')!.id;
    for (const mon of [save.team[0], save.pc.find((p) => !p.isEgg)!]) {
      const given = editor.setHeldItem(mon, leftovers);
      let reparsed = [...reparse().team, ...reparse().pc].find(same(mon))!;
      expect(reparsed.heldItem).toBe(leftovers);
      expect({ ...reparsed, heldItem: mon.heldItem }).toEqual(mon);

      editor.setHeldItem(given, 0);
      reparsed = [...reparse().team, ...reparse().pc].find(same(mon))!;
      expect(reparsed.heldItem).toBe(0);
    }
    expect(() => editor.setHeldItem(save.team[0], 99999)).toThrow();
  });

  it('makes another team the party: PC Pokémon join it, party ones go to the PC', () => {
    const fromPc = save.pc
      .filter((p) => !p.isEgg && db.species.get(p.speciesId)?.growthRate)
      .slice(0, 2);
    const team = [fromPc[0], save.team[1], fromPc[1], save.team[0]];
    editor.setParty(team, save);
    const after = reparse();

    // Party in that order, nothing lost nor duplicated
    expect(after.team.map((p) => p.personality)).toEqual(team.map((p) => p.personality));
    expect(after.team.map((p) => p.slot)).toEqual([1, 2, 3, 4]);
    const all = (s: ParsedSave) => [...s.team, ...s.pc].map((p) => p.personality).sort();
    expect(all(after)).toEqual(all(save));
    for (const left of save.team.slice(2)) {
      expect(after.pc.some((p) => p.personality === left.personality)).toBe(true);
    }

    const same = (a: ParsedPokemon, b: ParsedPokemon) => {
      for (const field of [
        'nickname',
        'speciesId',
        'experience',
        'moves',
        'ivs',
        'evs',
        'heldItem',
        'friendship',
        'abilitySlot',
        'hiddenAbility',
        'metLocation',
        'isShiny',
      ] as const) {
        expect(b[field]).toEqual(a[field]);
      }
    };
    for (const p of [...after.team, ...after.pc]) {
      const before = [...save.team, ...save.pc].find((x) => x.personality === p.personality)!;
      same(before, p);
    }

    for (const mon of fromPc) {
      const joined = after.team.find((p) => p.personality === mon.personality)!;
      const species = db.species.get(mon.speciesId)!;
      expect(joined.level).toBe(Pokemon.fromParsed(mon, db).level);
      const stats = computeStats(
        species.baseStats,
        mon.ivs,
        mon.evs,
        joined.level!,
        db.natures[mon.personality % 25],
        false,
      );
      expect(joined.stats!.maxHp).toBe(stats.hp);
      expect(joined.currentHp).toBe(stats.hp);
      expect(joined.pp.every((pp) => pp > 0)).toBe(true);
    }
  });

  it('refuses an empty team', () => {
    expect(() => editor.setParty([], save)).toThrow();
  });

  it('refuses an ability the species does not have', () => {
    const mon = save.team.find((p) => !db.species.get(p.speciesId)!.abilityIds[2])!;
    expect(() => editor.setAbility(mon, 1)).toThrow();
  });
});

describe('findPersonality', () => {
  const mon = { personality: 0x12345678, trainerId: 54321, secretId: 12345 };

  it('finds every nature, shiny or not, keeping the gender byte', () => {
    for (let nature = 0; nature < 25; nature++) {
      for (const shiny of [true, false]) {
        const p = findPersonality(mon, nature, shiny);
        expect(p % 25).toBe(nature);
        expect(isShinyPersonality(p, mon.trainerId, mon.secretId)).toBe(shiny);
        expect(p & 0xff).toBe(0x78);
      }
    }
  });

  it("keeps Unown's letter bits", () => {
    const p = findPersonality(mon, 3, true, true);
    expect(p & 0x03030303).toBe(mon.personality & 0x03030303);
    expect(p % 25).toBe(3);
    expect(isShinyPersonality(p, mon.trainerId, mon.secretId)).toBe(true);
  });
});

describe('sameGenderByte', () => {
  it('gives the wanted parity without crossing a gender threshold', () => {
    for (let byte = 0; byte < 256; byte++) {
      for (const parity of [0, 1]) {
        const c = sameGenderByte(byte, parity);
        expect(c & 1).toBe(parity);
        for (const t of [31, 63, 127, 191]) expect(c < t).toBe(byte < t);
      }
    }
  });
});

describe('Radical Red experience curves', () => {
  it('uses the curves seen in real saves, and none when unknown', () => {
    const db = TestBed.inject(PokemonDb);
    const rate = (name: string) =>
      [...db.species.values()].find((s) => s.name === name)?.growthRate;
    expect(rate('Iron Thorns')).toBe('medium-fast');
    expect(rate('Pawmot')).toBe('slow');
    expect(rate('Varoom')).toBeNull();
    expect(rate('Charmander')).toBe('medium-slow');
  });

  it('tells when a party Pokémon does not follow a curve', () => {
    const mon = { location: 'party', level: 36, experience: 49130 } as ParsedPokemon;
    expect(followsCurve(mon, 'medium-fast')).toBe(true);
    expect(followsCurve(mon, 'slow')).toBe(false);
    expect(followsCurve({ ...mon, location: 'box', level: undefined }, 'slow')).toBe(true);
  });
});
