import { TestBed } from '@angular/core/testing';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import { learnableMoves, progressStage, tmLabel } from './learnset';

describe('learnableMoves', () => {
  const db = () => TestBed.inject(PokemonDb);
  const idOf = (name: string) => [...db().species].find(([, s]) => s.name === name)![0];
  const byName = (list: ReturnType<typeof learnableMoves>, name: string) =>
    list.find((l) => l.move.name === name);

  it('only gives the level-up moves reached at the current level', () => {
    const list = learnableMoves(idOf('Frigibax'), 30, new Set(), db());
    expect(byName(list, 'Ice Fang')).toMatchObject({ available: true, level: 29 });
    expect(byName(list, 'Dragon Claw')).toMatchObject({
      available: false,
      note: 'Lv 32 · TM02 not in the bag',
    });
    expect(byName(list, 'Icicle Crash')).toMatchObject({ available: false, note: 'Lv 40' });
  });

  it('allows a TM move only when the TM is in the bag', () => {
    const without = learnableMoves(idOf('Frigibax'), 30, new Set(), db());
    expect(byName(without, 'Ice Beam')).toMatchObject({ available: false, tm: 13 });
    const withTm = learnableMoves(idOf('Frigibax'), 30, new Set([13]), db());
    expect(byName(withTm, 'Ice Beam')).toMatchObject({ available: true, note: 'TM13' });
    // Unknown bag: no TM is available
    expect(byName(learnableMoves(idOf('Frigibax'), 30, null, db()), 'Ice Beam')!.available).toBe(
      false,
    );
  });

  it('never offers a move outside the species learnset; learnable first, each by power', () => {
    const list = learnableMoves(idOf('Frigibax'), 30, new Set([13]), db());
    expect(byName(list, 'Thunderbolt')).toBeUndefined();
    const firstLocked = list.findIndex((l) => !l.available);
    expect(list.slice(firstLocked).every((l) => !l.available)).toBe(true);
    for (const group of [list.slice(0, firstLocked), list.slice(firstLocked)]) {
      const powers = group.map((l) => l.move.power ?? 0);
      expect(powers).toEqual([...powers].sort((a, b) => b - a));
    }
  });

  it('labels TMs and HMs', () => {
    expect(tmLabel(5)).toBe('TM05');
    expect(tmLabel(121)).toBe('HM01');
  });

  it('offers the move tutors the player has reached (Iron Thorns: Dragon Dance at Victory Road)', () => {
    const before = learnableMoves(idOf('Iron Thorns'), 50, new Set(), db(), progressStage(44));
    expect(byName(before, 'Dragon Dance')).toMatchObject({
      available: false,
      note: 'Lv 76 · Tutor after Brendan',
      tutorPlace: 'Victory Road 2F',
    });
    const after = learnableMoves(idOf('Iron Thorns'), 50, new Set(), db(), progressStage(85));
    expect(byName(after, 'Dragon Dance')).toMatchObject({ available: true, note: 'Tutor' });
    // Unknown progress: no tutor
    expect(
      byName(learnableMoves(idOf('Iron Thorns'), 50, new Set(), db()), 'Dragon Dance')!.available,
    ).toBe(false);
    expect(byName(after, 'Blast Burn')).toBeUndefined();
  });

  it('finds the progress stage from the level cap: the next boss', () => {
    expect(progressStage(15)).toBe(0); // Brock
    expect(progressStage(27)).toBe(2); // Misty
    expect(progressStage(30)).toBe(3); // Surge
    expect(progressStage(44)).toBe(4); // Erika
    expect(progressStage(100)).toBe(17); // Post-game
  });
});
