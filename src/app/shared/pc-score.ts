import type { Pokemon } from '../services/pokemon.models';
import { tierRank } from './pc-filter';

export const PC_SCORE_DEPTH = 6;

const BST_MIN = 300;
const BST_MAX = 600;
const TOP_TIER_RANK = tierRank('OU');

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** One Pokémon's strength, 0 to 1 */
export function monStrength(mon: Pokemon): number {
  const stats = clamp01((mon.baseStatTotal - BST_MIN) / (BST_MAX - BST_MIN));
  const rank = tierRank(mon.tier);
  if (rank === 0) return stats;
  const tier = clamp01((rank - 1) / (TOP_TIER_RANK - 1));
  return 0.6 * stats + 0.4 * tier;
}

/** PC score of these Pokémon, 0 to 100 */
export function pcScore(mons: readonly Pokemon[]): number {
  const best = mons
    .filter((m) => !m.isEgg)
    .map(monStrength)
    .sort((a, b) => b - a)
    .slice(0, PC_SCORE_DEPTH);
  const total = best.reduce((sum, s) => sum + s, 0);
  return Math.round((total / PC_SCORE_DEPTH) * 100);
}
