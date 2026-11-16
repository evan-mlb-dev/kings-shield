import { TestBed } from '@angular/core/testing';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import { evolutionsOf } from './evolutions';

describe('evolutionsOf', () => {
  const db = () => TestBed.inject(PokemonDb);
  const idOf = (name: string) => [...db().species].find(([, s]) => s.name === name)![0];

  it('gives the level of evolutions by level', () => {
    expect(evolutionsOf(idOf('Bulbasaur'), db()).slice(0, 1)).toEqual([
      {
        speciesId: idOf('Ivysaur'),
        name: 'Ivysaur',
        how: 'Level 16',
        level: 16,
        kind: 'level',
        items: [],
        moves: [],
      },
    ]);
  });

  it('has no level for evolutions by item or friendship', () => {
    const eevee = evolutionsOf(idOf('Eevee'), db());
    expect(eevee.length).toBeGreaterThan(3);
    expect(eevee.every((e) => e.level === null)).toBe(true);
    const fireStone = [...db().items.values()].find((i) => i.name === 'Fire Stone')!.id;
    expect(eevee.find((e) => e.name === 'Flareon')!).toMatchObject({
      kind: 'item',
      items: [fireStone],
      how: 'Use Fire Stone',
    });
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

  it('counts day / night evolutions as level ones', () => {
    const cubone = evolutionsOf(idOf('Cubone'), db());
    expect(cubone.some((e) => e.kind === 'level' && e.how.endsWith('(night)'))).toBe(true);
    const rockruff = evolutionsOf(idOf('Rockruff'), db());
    expect(rockruff.every((e) => e.kind === 'level' && e.level === 25)).toBe(true);
  });

  it('needs the items of both steps for a two-step evolution', () => {
    const vileplume = evolutionsOf(idOf('Oddish'), db()).find((e) => e.name === 'Vileplume')!;
    expect(vileplume).toMatchObject({ kind: 'item', via: 'Gloom' });
    expect(vileplume.items.map((id) => db().items.get(id)!.name)).toEqual(['Leaf Stone']);
  });

  it('evolves by knowing a move (Girafarig: Twin Beam)', () => {
    const farigiraf = evolutionsOf(idOf('Girafarig'), db()).find((e) => e.name === 'Farigiraf')!;
    expect(farigiraf.kind).toBe('move');
    expect(farigiraf.how).toBe('Knows Twin Beam');
    expect(farigiraf.moves.map((id) => db().moves.get(id)!.name)).toEqual(['Twin Beam']);
  });
});
