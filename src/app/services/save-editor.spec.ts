import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import { evolutionsOf } from '../shared/evolutions';
import { experienceForLevel } from '../shared/experience';
import { computeStats, findPersonality, isShinyPersonality, SaveEditor } from './save-editor';
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
