import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import { Pokemon } from '../services/pokemon.models';
import { SaveFileParser } from '../services/save-file-parser';
import { randomizeAbility, randomizedAbilityIds } from './ability-randomizer';

const SAVE_PATH = resolve(process.cwd(), 'test-data/radical-red.sav');

describe('randomizeAbility', () => {
  it('follows the game formula', () => {
    // otId 0x94fec4eb, Bulbasaur (1), Overgrow (65):
    // 0xc4eb % 236 = 143, + 1 + 65 = 209, secret 0x94fe % 255 = 147, 209 ^ 147 = 66 -> Drought (70)
    expect(randomizeAbility(65, 1, { otId: 0x94fec4eb, restricted: false })).toBe(70);
  });

  it('keeps empty slots empty and leaves runs without the option alone', () => {
    const r = { otId: 0x12345678, restricted: false };
    expect(randomizeAbility(0, 1, r)).toBe(0);
    expect(randomizedAbilityIds([34, 65, 0], 1, undefined)).toEqual([34, 65, 0]);
    expect(randomizedAbilityIds([34, 65, 0], 1, r)[2]).toBe(0);
  });

  it('only picks abilities of the pool', () => {
    const seen = new Set<number>();
    for (let species = 1; species < 400; species++) {
      seen.add(randomizeAbility(65, species, { otId: 0xdeadbeef, restricted: true }));
    }
    expect(seen.has(0)).toBe(false);
    expect(seen.has(2)).toBe(false); // Drizzle is not in the Restricted pool
  });
});

describe.skipIf(!existsSync(SAVE_PATH))('Randomizer options in a real save', () => {
  const file = () => new Uint8Array(readFileSync(SAVE_PATH));

  it('reads the options of the run', () => {
    const save = new SaveFileParser().parseSaveFile(file().buffer)!;
    expect(save.randomizer).toEqual({
      species: true,
      learnsets: false,
      abilities: false,
      restricted: false,
    });
    expect(save.team.every((m) => !m.randomAbilities)).toBe(true);
  });

  it('remaps abilities when the run randomizes them', () => {
    const bytes = file();
    const parser = new SaveFileParser();
    const plain = parser.parseSaveFile(bytes.slice().buffer)!;
    // Turn the option on in the trainer section of the active block
    const trainer = (parser as unknown as { findActiveSections(v: DataView): Map<number, number> })
      .findActiveSections(new DataView(bytes.buffer))!
      .get(0)!;
    bytes[trainer + 0xf2c] |= 0x4;
    const random = parser.parseSaveFile(bytes.buffer)!;

    expect(random.randomizer?.abilities).toBe(true);
    const db = TestBed.inject(PokemonDb);
    const mon = random.team[0];
    expect(mon.randomAbilities?.otId).toBe((plain.secretId * 0x10000 + plain.trainerId) >>> 0);
    const species = db.species.get(mon.speciesId)!;
    const expected = randomizedAbilityIds(species.abilityIds, mon.speciesId, mon.randomAbilities);
    const slot = (mon.hiddenAbility && expected[0]) || expected[1 + mon.abilitySlot] || expected[1];
    expect(Pokemon.fromParsed(mon, db).ability?.id).toBe(slot);
  });
});
