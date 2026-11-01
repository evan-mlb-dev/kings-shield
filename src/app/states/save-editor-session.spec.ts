import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import { Pokemon } from '../services/pokemon.models';
import { SaveFileParser } from '../services/save-file-parser';
import { evolutionsOf } from '../shared/evolutions';
import { experienceForLevel } from '../shared/experience';
import { GameStateService, pokemonKey } from './game-state';
import { SaveBytesState } from './save-bytes';
import { SaveEditorSession } from './save-editor-session';
import { SoulLinkService } from './soul-link';

const SAVE_PATH = resolve(process.cwd(), 'test-data/radical-red.sav');
const hasSave = existsSync(SAVE_PATH);

describe.skipIf(!hasSave)('SaveEditorSession (real save)', () => {
  let session: SaveEditorSession;
  let gameState: GameStateService;
  let soulLink: SoulLinkService;
  let saveBytes: SaveBytesState;

  beforeEach(() => {
    localStorage.clear();
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => undefined;
    TestBed.configureTestingModule({});
    gameState = TestBed.inject(GameStateService);
    soulLink = TestBed.inject(SoulLinkService);
    saveBytes = TestBed.inject(SaveBytesState);
    session = TestBed.inject(SaveEditorSession);

    const bytes = new Uint8Array(readFileSync(SAVE_PATH));
    gameState.setSaveName('radical-red.sav');
    gameState.setPkmnData(new SaveFileParser().parseSaveFile(bytes.slice().buffer)!);
    saveBytes.set(bytes);
    TestBed.tick();
  });

  it('edits the working copy only, until downloaded', () => {
    const mon = session.save()!.team[0];
    session.apply(mon, { level: 60 });
    expect(session.save()!.team[0].level).toBe(60);
    expect(gameState.team()[0].level).toBe(mon.level);
    expect(session.changes()).toEqual([
      {
        key: pokemonKey(mon),
        name: mon.nickname,
        species: TestBed.inject(PokemonDb).species.get(mon.speciesId)!.name,
        level: 60,
      },
    ]);

    session.restart();
    expect(session.save()!.team[0].level).toBe(mon.level);
    expect(session.hasChanges()).toBe(false);
  });

  it('downloads, then the site uses the edited save: team, locks and links follow new keys', () => {
    const save = session.save()!;
    const mon = save.team[1];
    const pcMon = save.pc[0];
    gameState.toggleLock(mon);
    soulLink.partnerSave.set({
      trainerName: 'P',
      mons: [{ ...pcMon, personality: 1, trainerId: 9 }],
    });
    soulLink.link(mon, { ...pcMon, personality: 1, trainerId: 9 });

    const nature = ((mon.personality % 25) + 3) % 25;
    session.apply(mon, { nature, shiny: true, level: 55 });
    const name = session.download();
    TestBed.tick();

    expect(name).toBe('radical-red-edited.sav');
    expect(gameState.saveName()).toBe('radical-red-edited.sav');
    const edited = gameState
      .team()
      .find((p) => p.nickname === mon.nickname && p.slot === mon.slot)!;
    expect(edited.personality % 25).toBe(nature);
    expect(edited.isShiny).toBe(true);
    expect(edited.level).toBe(55);
    expect(gameState.team().map((p) => p.slot)).toEqual(save.team.map((p) => p.slot));
    expect(gameState.isLocked(edited)).toBe(true);
    expect(soulLink.pairs().some((p) => pokemonKey(p.mine) === pokemonKey(edited))).toBe(true);
    // The session restarted on the edited save
    expect(session.hasChanges()).toBe(false);
    expect(session.save()!.team.find((p) => p.slot === mon.slot)!.level).toBe(55);
  });

  it('leaves the working copy untouched when an edit fails', () => {
    const mon = session.save()!.team[0];
    expect(() => session.apply(mon, { level: 70, moves: [99999] })).toThrow();
    expect(session.save()!.team[0].level).toBe(mon.level);
    expect(session.hasChanges()).toBe(false);
  });

  it('applies the level cap: everyone at the cap, nobody with more experience', () => {
    const db = TestBed.inject(PokemonDb);
    const before = session.save()!;
    const all = [...before.team, ...before.pc.filter((p) => !p.isEgg)];
    const levelOf = (p: (typeof all)[number]) => p.level ?? Pokemon.fromParsed(p, db).level!;
    const cap = 30;
    const under = all.filter((p) => levelOf(p) < cap).length;
    const { raised, lowered } = session.applyLevelCap(cap);
    expect(raised).toBe(under);
    expect(raised + lowered).toBe(session.changes().length);

    const after = session.save()!;
    for (const p of [...after.team, ...after.pc.filter((x) => !x.isEgg)]) {
      expect(levelOf(p)).toBe(cap);
      expect(p.experience).toBe(experienceForLevel(db.species.get(p.speciesId)!.growthRate!, cap));
    }
    // Applying it again changes nothing
    expect(session.applyLevelCap(cap)).toEqual({ raised: 0, lowered: 0, skipped: 0 });
  });

  it('leaves the fainted Pokémon out of the editor and of the level cap', () => {
    const save = session.save()!;
    const dead = save.pc[0];
    gameState.faint(dead);
    const { pc } = session.editable();
    expect(pc.some((p) => p.personality === dead.personality)).toBe(false);
    session.applyLevelCap(100);
    expect(session.changes().some((c) => c.key === pokemonKey(dead))).toBe(false);
  });

  it('undoes every change of one Pokémon, evolution and nature included', () => {
    const db = TestBed.inject(PokemonDb);
    const save = session.save()!;
    const mon = save.team.find((p) => evolutionsOf(p.speciesId, db).length > 0)!;
    const other = save.team.find((p) => p !== mon)!;
    const target = evolutionsOf(mon.speciesId, db)[0].speciesId;
    session.apply(mon, {
      species: target,
      nature: ((mon.personality % 25) + 1) % 25,
      level: mon.level! + 1,
    });
    session.apply(other, { level: other.level! + 1 });
    const edited = session.save()!.team.find((p) => p.slot === mon.slot)!;
    expect(edited.speciesId).toBe(target);

    const key = session.revert(edited);
    expect(key).toBe(pokemonKey(mon));
    expect(session.save()!.team.find((p) => p.slot === mon.slot)).toEqual(mon);
    // The other Pokémon keeps its change
    expect(session.changes().map((c) => c.key)).toEqual([pokemonKey(other)]);
    expect(session.save()!.team.find((p) => p.slot === other.slot)!.level).toBe(other.level! + 1);
  });

  it('reads the TM case of the save', () => {
    // TMs owned in the test save, as told by its player
    expect([...session.ownedTms()!].sort((a, b) => a - b)).toEqual([
      3, 5, 9, 15, 21, 34, 39, 40, 47, 51, 77, 78, 88, 89, 111,
    ]);
  });
});
