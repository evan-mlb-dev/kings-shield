export const TYPE_COLORS: Readonly<Record<string, string>> = {
  Normal: '#a8a77a',
  Fighting: '#ee8130',
  Flying: '#a98ff3',
  Poison: '#a33ea1',
  Ground: '#e2bf65',
  Rock: '#a3804f',
  Bug: '#a6b91a',
  Ghost: '#735797',
  Steel: '#b7b7ce',
  '???': '#68a090',
  Fire: '#c22e28',
  Water: '#6390f0',
  Grass: '#7ac74c',
  Electric: '#f7d02c',
  Psychic: '#f95587',
  Ice: '#96d9d6',
  Dragon: '#6f35fc',
  Dark: '#705746',
  Fairy: '#d685ad',
};

export function typeColor(name: string | undefined): string {
  return (name && TYPE_COLORS[name]) || '#777';
}
