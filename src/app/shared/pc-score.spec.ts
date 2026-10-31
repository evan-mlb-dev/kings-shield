import type { Pokemon } from '../services/pokemon.models';
import { monStrength, pcScore } from './pc-score';

const mon = (baseStatTotal: number, tier: string | null = null, isEgg = false) =>
  ({ baseStatTotal, tier, isEgg }) as unknown as Pokemon;

describe('PC score', () => {
  it('rates one Pokémon from its base stats and tier', () => {
    expect(monStrength(mon(300))).toBe(0);
    expect(monStrength(mon(600))).toBe(1);
    expect(monStrength(mon(450))).toBeCloseTo(0.5);
    // 60% base stats, 40% tier
    expect(monStrength(mon(450, 'OU'))).toBeCloseTo(0.7);
    expect(monStrength(mon(600, 'LC'))).toBeCloseTo(0.6);
  });

  it('averages the 6 best Pokémon, missing ones counting 0', () => {
    expect(pcScore([])).toBe(0);
    expect(pcScore([mon(600)])).toBe(17); // 1 / 6
    expect(pcScore(Array.from({ length: 6 }, () => mon(600, 'OU')))).toBe(100);
    const strong = Array.from({ length: 6 }, () => mon(600, 'OU'));
    expect(pcScore([...strong, mon(200), mon(250, 'LC')])).toBe(100);
    // Eggs do not count
    expect(pcScore([mon(600, 'OU', true)])).toBe(0);
  });
});
