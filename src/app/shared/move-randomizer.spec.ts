import { TestBed } from '@angular/core/testing';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import { learnableMoves } from './learnset';
import { randomizeMove } from './move-randomizer';

const RUN = { otId: 0x94fec4eb, restricted: false };

describe('randomizeMove', () => {
  it('follows the game formula', () => {
    // 0x94fec4eb * Bulbasaur (1) * Tackle (33) mod 2^32 = 886530635, % 806 = 757 -> Shed Tail (775)
    expect(randomizeMove(33, 1, RUN)).toBe(775);
  });

  it('leaves empty moves, Struggle and runs without the option alone', () => {
    expect(randomizeMove(0, 1, RUN)).toBe(0);
    expect(randomizeMove(165, 1, RUN)).toBe(165);
    expect(randomizeMove(33, 1, null)).toBe(33);
  });
});

describe('learnableMoves with random learnsets', () => {
  it('remaps level-up moves only', () => {
    const db = TestBed.inject(PokemonDb);
    const plain = learnableMoves(1, 100, new Set(), db);
    const random = learnableMoves(1, 100, new Set(), db, null, RUN);

    const levelUp = (list: typeof plain) =>
      new Set(list.filter((l) => l.level !== null).map((l) => l.move.id));
    const all = new Set(random.map((l) => l.move.id));

    expect(levelUp(random).has(775)).toBe(true); // Tackle -> Shed Tail
    expect(levelUp(random)).not.toEqual(levelUp(plain));
    // TM and tutor moves are still all there
    for (const l of plain.filter((l) => l.tm !== null || l.tutorPlace)) {
      expect(all.has(l.move.id)).toBe(true);
    }
  });
});
