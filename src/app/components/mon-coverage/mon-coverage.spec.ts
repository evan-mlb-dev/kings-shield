import { TestBed } from '@angular/core/testing';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import { MonCoverage } from './mon-coverage';

describe('MonCoverage', () => {
  it('shows what Iron Thorns hits, resists and fears', () => {
    const db = TestBed.inject(PokemonDb);
    const move = (name: string) => [...db.moves.values()].find((m) => m.name === name)!;
    const fixture = TestBed.createComponent(MonCoverage);
    fixture.componentRef.setInput('types', [db.types.get('Rock')!, db.types.get('Electric')!]);
    fixture.componentRef.setInput('moves', [
      move('Thunder Punch'),
      move('Rock Slide'),
      move('Ice Fang'),
      move('Stealth Rock'), // status: no coverage
    ]);
    fixture.detectChanges();

    const rows = (
      fixture.componentInstance as unknown as {
        rows: () => {
          label: string;
          types: { name: string; stab?: boolean; immune?: boolean }[];
        }[];
      }
    ).rows();
    const names = (label: string) => rows.find((r) => r.label === label)!.types.map((t) => t.name);

    const hits = rows[0].types;
    expect(hits.filter((t) => t.stab).map((t) => t.name)).toEqual([
      'Fire',
      'Water',
      'Ice',
      'Flying',
      'Bug',
    ]);
    expect(hits.filter((t) => !t.stab).map((t) => t.name)).toEqual(['Grass', 'Ground', 'Dragon']);
    expect(hits.findIndex((t) => !t.stab)).toBe(5);

    expect(names('Weak ×4')).toEqual(['Ground']);
    expect(names('Weak')).toEqual(['Water', 'Grass', 'Fighting']);
    expect(names('Resists')).toContain('Flying');
    expect(names('Resists')).not.toContain('Steel'); // x2 then x0.5: neutral
  });
});
