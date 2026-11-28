// Picks the ball whose colours match a Pokémon's sprite best.
// Colours are compared in CIELAB, hue and saturation weighing more than lightness.

export type Rgb = readonly [number, number, number];
type Lab = readonly [number, number, number];

export interface PaletteColour {
  rgb: Rgb;
  lab: Lab;
  /** Share of the counted pixels */
  weight: number;
}

export function toLab([r, g, b]: Rgb): Lab {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Shading changes the lightness a lot: hue and saturation count more */
function distance(a: Lab, b: Lab): number {
  return Math.hypot((a[0] - b[0]) * 0.5, a[1] - b[1], a[2] - b[2]);
}

function chroma(lab: Lab): number {
  return Math.hypot(lab[1], lab[2]);
}

/** Main colours of some pixels (k-means), outlines and white highlights left out, by weight */
export function palette(pixels: readonly Rgb[], k = 3): PaletteColour[] {
  const points = pixels
    .map((rgb) => ({ rgb, lab: toLab(rgb) }))
    .filter(({ lab }) => lab[0] > 18 && !(lab[0] > 93 && chroma(lab) < 6));
  if (!points.length) return [];
  // Same seeds every time, spread along lightness
  const byLightness = [...points].sort((a, b) => a.lab[0] - b.lab[0]);
  let centres: Lab[] = Array.from(
    { length: k },
    (_, i) => byLightness[Math.floor(((i + 0.5) / k) * byLightness.length)].lab,
  );
  let groups: (typeof points)[] = [];
  for (let round = 0; round < 12; round++) {
    groups = centres.map(() => []);
    for (const point of points) {
      let best = 0;
      for (let i = 1; i < k; i++) {
        if (distance(point.lab, centres[i]) < distance(point.lab, centres[best])) best = i;
      }
      groups[best].push(point);
    }
    centres = groups.map((g, i) => (g.length ? mean(g.map((p) => p.lab)) : centres[i]));
  }
  return groups
    .map((g, i) => ({
      lab: centres[i],
      rgb: (g.length ? mean(g.map((p) => p.rgb)).map(Math.round) : [0, 0, 0]) as unknown as Rgb,
      weight: g.length / points.length,
    }))
    .filter((c) => c.weight > 0.04)
    .sort((a, b) => b.weight - a.weight);
}

function mean(values: readonly (readonly number[])[]): [number, number, number] {
  const sum = [0, 0, 0];
  for (const v of values) for (let j = 0; j < 3; j++) sum[j] += v[j];
  return [sum[0] / values.length, sum[1] / values.length, sum[2] / values.length];
}

/** A ball's identifying colours: its cap (top half of the icon), without the shared greys */
export function ballColours(capPixels: readonly Rgb[]): PaletteColour[] {
  const cap = palette(capPixels, 3);
  const colours = cap.filter((c) => chroma(c.lab) > 15);
  return colours.length ? colours : cap.slice(0, 1);
}

/** How far a Pokémon's palette is from a ball's colours: main colour 70 %, second one 30 % */
export function mismatch(mon: readonly PaletteColour[], ball: readonly PaletteColour[]): number {
  if (!mon.length || !ball.length) return Infinity;
  // Greys only count when they are most of the Pokémon (Snorlax, Steelix...)
  const colourful = mon.filter((c, i) => i === 0 || chroma(c.lab) > 12);
  const nearest = (c: PaletteColour) => Math.min(...ball.map((b) => distance(c.lab, b.lab)));
  const main = nearest(colourful[0]);
  const second = colourful[1] ? nearest(colourful[1]) : main;
  return main * 0.7 + second * 0.3;
}

/** Index of the best ball, or null when nothing can be compared */
export function bestBall(
  mon: readonly PaletteColour[],
  balls: readonly (readonly PaletteColour[])[],
): number | null {
  let best: number | null = null;
  let bestScore = Infinity;
  balls.forEach((ball, i) => {
    const score = mismatch(mon, ball);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Opaque pixels of an image (the top half only when asked), null when it does not load */
export async function imagePixels(src: string, topHalf = false): Promise<Rgb[] | null> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const rows = topHalf ? Math.floor(canvas.height / 2) : canvas.height;
    const data = ctx.getImageData(0, 0, canvas.width, rows).data;
    const pixels: Rgb[] = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 128) pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
    return pixels;
  } catch {
    return null;
  }
}
