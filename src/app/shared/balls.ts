// Ball a Pokémon was caught in. CFRU (Radical Red, Unbound) keeps it in its own byte, numbered as
// below (enum BallTypes, include/new/catching.h); the vanilla origins bits stay at 0.
export const BALLS: readonly string[] = [
  'Master Ball',
  'Ultra Ball',
  'Great Ball',
  'Poké Ball',
  'Safari Ball',
  'Net Ball',
  'Dive Ball',
  'Nest Ball',
  'Repeat Ball',
  'Timer Ball',
  'Luxury Ball',
  'Premier Ball',
  'Dusk Ball',
  'Heal Ball',
  'Quick Ball',
  'Cherish Ball',
  'Park Ball',
  'Fast Ball',
  'Level Ball',
  'Lure Ball',
  'Heavy Ball',
  'Love Ball',
  'Friend Ball',
  'Moon Ball',
  'Sport Ball',
  'Beast Ball',
  'Dream Ball',
];

export function ballName(ball: number): string {
  return BALLS[ball] ?? `Ball #${ball}`;
}
