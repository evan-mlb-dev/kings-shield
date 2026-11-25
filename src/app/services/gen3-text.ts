// Gen 3 punctuation found in species names (Farfetch'd, Nidoran♀, Flabébé, Type: Null...)
export const TEXT_SYMBOLS: Record<number, string> = {
  0x1b: 'é',
  0xab: '!',
  0xac: '?',
  0xad: '.',
  0xae: '-',
  0xb0: '…',
  0xb1: '“',
  0xb2: '”',
  0xb3: '‘',
  0xb4: '’',
  0xb5: '♂',
  0xb6: '♀',
  0xb8: ',',
  0xba: '/',
  0xf0: ':',
};

export const SYMBOL_BYTES: Record<string, number> = {
  ...Object.fromEntries(Object.entries(TEXT_SYMBOLS).map(([b, c]) => [c, Number(b)])),
  "'": 0xb4,
};
