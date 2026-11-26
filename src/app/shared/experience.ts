export type GrowthRate =
  'fast' | 'medium-fast' | 'medium-slow' | 'slow' | 'erratic' | 'fluctuating';

export const MAX_LEVEL = 100;

export function experienceForLevel(rate: GrowthRate, level: number): number {
  const n = level;
  if (n <= 1) return 0;
  const cube = n ** 3;

  switch (rate) {
    case 'fast':
      return Math.floor((4 * cube) / 5);
    case 'medium-fast':
      return cube;
    case 'medium-slow':
      return Math.floor((6 / 5) * cube - 15 * n ** 2 + 100 * n - 140);
    case 'slow':
      return Math.floor((5 * cube) / 4);
    case 'erratic':
      if (n < 50) return Math.floor((cube * (100 - n)) / 50);
      if (n < 68) return Math.floor((cube * (150 - n)) / 100);
      if (n < 98) return Math.floor((cube * Math.floor((1911 - 10 * n) / 3)) / 500);
      return Math.floor((cube * (160 - n)) / 100);
    case 'fluctuating':
      if (n < 15) return Math.floor((cube * (Math.floor((n + 1) / 3) + 24)) / 50);
      if (n < 36) return Math.floor((cube * (n + 14)) / 50);
      return Math.floor((cube * (Math.floor(n / 2) + 32)) / 50);
  }
}

// Radical Red's tables sit up to 1 XP below the formulas (rounding in the game's own
// computation: a level 5 Bulbasaur has 134 XP, the formula says 135)
const TABLE_SLACK = 1;

export function reachesLevel(rate: GrowthRate, experience: number, level: number): boolean {
  return level <= 1 || experience >= experienceForLevel(rate, level) - TABLE_SLACK;
}

export function levelFromExperience(rate: GrowthRate, experience: number): number {
  let level = 1;
  while (level < MAX_LEVEL && reachesLevel(rate, experience, level + 1)) level++;
  return level;
}
