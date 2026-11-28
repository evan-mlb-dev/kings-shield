import { metLocationName, metLocationNickname } from './met-locations';

describe('met locations', () => {
  it('keeps the full names for the Soul Link page', () => {
    expect(metLocationName(0x58)).toBe('Pallet Town');
    expect(metLocationName(0xff)).toBe('Gift');
  });

  it('gives nickname-sized names: 10 characters the game can write', () => {
    for (let id = 0; id < 256; id++) {
      const name = metLocationNickname(id);
      if (name === null) continue;
      expect(name.length, name).toBeLessThanOrEqual(10);
      expect(name, name).toMatch(/^[A-Za-z0-9 .'-]+$/);
    }
    expect(metLocationNickname(103)).toBe('R.3');
    expect(metLocationNickname(122)).toBe('R.22');
    expect(metLocationNickname(126)).toBe('Vir.Forest');
  });

  it('leaves the starter, trades and events alone', () => {
    expect(metLocationNickname(157)).toBeNull();
    expect(metLocationNickname(0xfe)).toBeNull();
    expect(metLocationNickname(0xff)).toBeNull();
  });
});
