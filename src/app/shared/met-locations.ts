const KANTO: readonly string[] = [
  'Pallet Town', // 0x58
  'Viridian City',
  'Pewter City',
  'Cerulean City',
  'Lavender Town',
  'Vermilion City',
  'Celadon City',
  'Fuchsia City',
  'Cinnabar Island',
  'Indigo Plateau',
  'Saffron City',
  'Route 4',
  'Route 10',
  ...Array.from({ length: 25 }, (_, i) => `Route ${i + 1}`), // 0x65 - 0x7D
  'Viridian Forest',
  'Mt. Moon',
  'S.S. Anne',
  'Underground Path',
  'Underground Path',
  "Diglett's Cave",
  'Victory Road',
  'Rocket Hideout',
  'Silph Co.',
  'Pokémon Mansion',
  'Safari Zone',
  'Pokémon League',
  'Rock Tunnel',
  'Seafoam Islands',
  'Pokémon Tower',
  'Cerulean Cave',
  'Power Plant', // 0x8E
];
const KANTO_FIRST = 0x58;

export function metLocationName(id: number): string {
  if (id === 0xfe) return 'In-game trade';
  if (id === 0xff) return 'Gift';
  return KANTO[id - KANTO_FIRST] ?? `Location #${id}`;
}
