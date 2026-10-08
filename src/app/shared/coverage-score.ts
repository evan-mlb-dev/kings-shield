import type { Pokemon, PokemonType } from '../services/pokemon.models';

const STRICTNESS = 1.6;

const CRITICAL_WEAK_COUNT = 3;

const CRITICAL_PENALTY: Readonly<Record<number, number>> = { 3: 5, 4: 8, 5: 11, 6: 15 };

/** Per type: damage multiplier taken by each member */
export function defensiveScore(takenPerType: readonly (readonly number[])[]): number {
  const base = averageScore(takenPerType, (taken) => {
    if (taken.length === 0) return 0;
    const best = Math.min(...taken);
    const switchIn = best === 0 ? 1 : best <= 0.25 ? 0.9 : best < 1 ? 0.75 : best === 1 ? 0.25 : 0;
    const weakMembers = taken.filter((m) => m > 1).length;
    const weak = taken.reduce((sum, m) => sum + (m >= 4 ? 1.5 : m > 1 ? 1 : 0), 0);
    const notWeak = 1 - Math.min(1, weak / taken.length);
    const depth = Math.min(1, taken.filter((m) => m < 1).length / 3);
    const score = 0.5 * switchIn + 0.3 * notWeak + 0.2 * depth;
    const critical = weakMembers >= 3 || weakMembers * 2 >= taken.length;
    return critical && weakMembers > 0 ? score * 0.5 : score;
  });

  // Moderate extra cost for each critical weakness
  const penalty = takenPerType.reduce((sum, taken) => {
    const weakMembers = Math.min(6, taken.filter((m) => m > 1).length);
    return weakMembers >= CRITICAL_WEAK_COUNT ? sum + (CRITICAL_PENALTY[weakMembers] ?? 0) : sum;
  }, 0);
  return Math.max(0, base - penalty);
}

export function offensiveScore(dealtPerType: readonly (readonly (number | null)[])[]): number {
  return averageScore(dealtPerType, (dealt) => {
    const values = dealt.filter((m): m is number => m !== null);
    if (values.length === 0) return 0;
    const best = Math.max(...values);
    const reach = best > 1 ? 1 : best === 1 ? 0.2 : best > 0 ? 0.05 : 0;
    const depth = Math.min(1, values.filter((m) => m > 1).length / 3);
    return 0.6 * reach + 0.4 * depth;
  });
}

/** Score label, from worst to best */
export function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Great';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
}

function averageScore<T>(perType: readonly T[], typeScore: (t: T) => number): number {
  if (perType.length === 0) return 0;
  const total = perType.reduce((sum, t) => sum + typeScore(t), 0);
  return Math.round((total / perType.length) ** STRICTNESS * 100);
}

export function teamScores(
  members: readonly Pokemon[],
  types: readonly PokemonType[],
): { defense: number; offense: number } {
  if (members.length === 0) return { defense: 0, offense: 0 };
  const taken = types.map((attacker) =>
    members.map((mon) => mon.types.reduce((m, t) => m * attacker.effectivenessAgainst(t.name), 1)),
  );
  const dealt = types.map((defender) =>
    members.map((mon) => {
      const damaging = mon.moves.filter((move) => move.category !== 'status');
      return damaging.length === 0
        ? null
        : Math.max(...damaging.map((move) => move.type.effectivenessAgainst(defender.name)));
    }),
  );
  return { defense: defensiveScore(taken), offense: offensiveScore(dealt) };
}
