import { ballColours, bestBall, palette, type Rgb } from './ball-colors';

const fill = (rgb: Rgb, count: number): Rgb[] => Array.from({ length: count }, () => rgb);

describe('ball colours', () => {
  it('finds the main colours, leaving outlines and highlights out', () => {
    const sprite = [
      ...fill([230, 60, 40], 60), // red body
      ...fill([250, 210, 50], 30), // yellow belly
      ...fill([10, 10, 10], 40), // black outline
      ...fill([255, 255, 255], 20), // white highlight
    ];
    const colours = palette(sprite);
    expect(colours[0].rgb[0]).toBeGreaterThan(200);
    expect(colours[0].weight).toBeGreaterThan(0.6);
    expect(colours.every((c) => c.lab[0] > 18)).toBe(true);
  });

  it('keeps the colour of a ball cap, not its grey band', () => {
    const cap = ballColours([...fill([60, 140, 240], 50), ...fill([90, 90, 95], 50)]);
    expect(cap).toHaveLength(1);
    expect(cap[0].rgb[2]).toBeGreaterThan(200);
  });

  it('picks the ball of the closest colour', () => {
    const red = ballColours(fill([240, 50, 40], 50));
    const blue = ballColours(fill([50, 110, 240], 50));
    const green = ballColours(fill([70, 170, 60], 50));
    const balls = [red, blue, green];
    expect(bestBall(palette(fill([40, 90, 200], 80)), balls)).toBe(1);
    expect(bestBall(palette(fill([90, 190, 80], 80)), balls)).toBe(2);
    expect(bestBall([], balls)).toBeNull();
  });
});
