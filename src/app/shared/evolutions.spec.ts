import { TestBed } from '@angular/core/testing';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import { evolutionsOf } from './evolutions';

describe('evolutionsOf', () => {
  const db = () => TestBed.inject(PokemonDb);
  const idOf = (name: string) => [...db().species].find(([, s]) => s.name === name)![0];

  it('gives the level of evolutions by level', () => {
    expect(evolutionsOf(idOf('Bulbasaur'), db()).slice(0, 1)).toEqual([
      { speciesId: idOf('Ivysaur'), name: 'Ivysaur', how: 'Level 16', level: 16, kind: 'level' },
    ]);
  });

  it('has no level for evolutions by item or friendship', () => {
    const eevee = evolutionsOf(idOf('Eevee'), db());
    expect(eevee.length).toBeGreaterThan(3);
    expect(eevee.every((e) => e.level === null)).toBe(true);
    expect(eevee.find((e) => e.name === 'Flareon')!).toMatchObject({ kind: 'other' });
    expect(eevee.find((e) => e.name === 'Espeon')!).toMatchObject({ kind: 'friendship' });
  });

  it('also offers the second evolution, stage 1 -> stage 3', () => {
    const list = evolutionsOf(idOf('Charmander'), db());
    expect(list.map((e) => e.name)).toEqual(['Charmeleon', 'Charizard']);
    expect(list[1]).toMatchObject({ via: 'Charmeleon', level: 36, kind: 'level' });
    expect(list[1].how).toBe('Level 16, then Level 36');
    // Already stage 2: only the next one
    expect(evolutionsOf(idOf('Charmeleon'), db()).map((e) => e.name)).toEqual(['Charizard']);
  });
});
