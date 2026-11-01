import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import type { Pokemon } from '../services/pokemon.models';
import { PcFilter, PcFilterEntry } from './pc-filter';

const entry = (key: string, baseStatTotal: number): PcFilterEntry => ({
  key,
  mon: {
    baseStatTotal,
    nickname: key,
    speciesName: key,
    types: [],
    moves: [],
  } as unknown as Pokemon,
});

describe('PcFilter order', () => {
  const entries = [entry('a', 300), entry('b', 600), entry('c', 450)];
  const make = () => {
    const order = signal<readonly string[] | null>(null);
    return {
      order,
      filter: new PcFilter(TestBed.inject(PokemonDb), () => entries, signal(null), order),
    };
  };
  const keys = (f: PcFilter) => f.visible().map((e) => e.key);

  it('sorts by base stat total by default', () => {
    expect(keys(make().filter)).toEqual(['b', 'c', 'a']);
  });

  it('keeps an order set by hand, until reset', () => {
    const { filter, order } = make();
    filter.reorder('a', 'b'); // a dropped on b's place
    expect(keys(filter)).toEqual(['a', 'b', 'c']);
    expect(order()).toEqual(['a', 'b', 'c']);
    filter.reorder('a', 'c'); // moved down
    expect(keys(filter)).toEqual(['b', 'c', 'a']);
    filter.reorder('c', 'b');
    expect(keys(filter)).toEqual(['c', 'b', 'a']);

    filter.resetOrder();
    expect(keys(filter)).toEqual(['b', 'c', 'a']);
  });

  it('ignores the manual order while another sort is picked', () => {
    const { filter } = make();
    filter.reorder('a', 'b');
    filter.setSort('hp');
    expect(filter.canReorder()).toBe(false);
    expect(filter.usesManualOrder()).toBe(false);
    filter.setSort(null);
    expect(keys(filter)).toEqual(['a', 'b', 'c']);
  });
});
