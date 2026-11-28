import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import { Pokemon } from './pokemon.models';
import { SaveEditor } from './save-editor';
import { SaveFileParser } from './save-file-parser';
import { SaveFileWriter } from './save-file-writer';
import { learnableMoves } from '../shared/learnset';

const UNBOUND_SAVE = resolve(process.cwd(), 'test-data/unbound.sav');

describe.skipIf(!existsSync(UNBOUND_SAVE))('Pokémon Unbound save', () => {
  const bytes = () => new Uint8Array(readFileSync(UNBOUND_SAVE));
  let db: PokemonDb;

  beforeEach(async () => {
    db = TestBed.inject(PokemonDb);
    await db.useGame('unbound');
  });

  afterEach(async () => {
    await db.useGame('radical-red');
  });

  it('is recognised and read with the Unbound data', () => {
    const save = new SaveFileParser().parseSaveFile(bytes().buffer)!;
    expect(save.game).toBe('unbound');
    expect(save.randomizer?.abilities).toBe(false);
    expect(save.team).toHaveLength(3);
    expect(save.pc.length).toBeGreaterThan(60);

    const [lele, greninja, gallade] = save.team.map((p) => Pokemon.fromParsed(p, db));
    expect(lele.speciesName).toBe('Tapu Lele');
    expect(lele.heldItem?.name).toBe('Choice Specs');
    expect(lele.ability?.name).toBe('Psychic Surge');
    expect(greninja.ability?.name).toBe('Battle Bond');
    expect(gallade.heldItem?.name).toBe('Galladite');
  });

  it('uses the Radical Red sprite of the same form, and the Unbound learnsets', () => {
    // Hisuian Typhlosion: 1238 in Unbound, 1299 in Radical Red
    expect(db.species.get(1238)?.types.map((t) => t.name)).toEqual(['Fire', 'Ghost']);
    expect(db.spriteId(1238)).toBe(1299);
    const bulbasaur = learnableMoves(1, 100, new Set(), db).map((l) => l.move.name);
    expect(bulbasaur).toContain('Vine Whip');
  });

  it('edits and writes a save the game accepts (checksums, signature)', () => {
    const original = bytes();
    const opened = SaveFileWriter.open(original);
    if (!opened.ok) throw new Error(opened.reason);
    const editor = new SaveEditor(opened.editor, db);
    const save = new SaveFileParser().parseSaveFile(original.slice().buffer)!;
    editor.setHeldItem(save.team[1], 142);

    const written = opened.editor.toBytes();
    expect(SaveFileWriter.open(written).ok).toBe(true);
    const reread = new SaveFileParser().parseSaveFile(written.slice().buffer)!;
    expect(reread.game).toBe('unbound');
    expect(reread.team[1].heldItem).toBe(142);
    expect(reread.team[0].heldItem).toBe(save.team[0].heldItem);
  });

  it('switches back to Radical Red data', async () => {
    await db.useGame('radical-red');
    expect(db.game()).toBe('radical-red');
    expect(db.species.get(1238)?.name).not.toBe('Typhlosion');
  });
});
