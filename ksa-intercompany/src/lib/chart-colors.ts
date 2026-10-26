/** Brand chart colors */
export const BRAND = {
  blue: '#60a5fa',
  green: '#10b981',
  lightGreen: '#34d399',
  red: '#e00410',
  redSoft: '#ef4444',
  yellow: '#fbbf24',
  gray: '#94a3b8',
  softBlue: '#93c5fd',
  softGreen: '#6ee7b7',
  softYellow: '#fde68a',
} as const;

/** Rank palettes (index 0 = largest share → last = smallest). */
const PALETTE_2 = [BRAND.blue, BRAND.green] as const;
const PALETTE_3 = [BRAND.blue, BRAND.green, BRAND.red] as const;
const PALETTE_4 = [BRAND.blue, BRAND.green, BRAND.red, BRAND.yellow] as const;
const PALETTE_5 = [BRAND.blue, BRAND.green, BRAND.red, BRAND.yellow, BRAND.gray] as const;
const PALETTE_MORE = [
  BRAND.blue,
  BRAND.green,
  BRAND.red,
  BRAND.yellow,
  BRAND.gray,
  BRAND.softBlue,
  BRAND.softGreen,
  '#64748b',
  BRAND.softYellow,
  '#cbd5e1',
] as const;

function paletteForCount(n: number): readonly string[] {
  if (n <= 2) return PALETTE_2;
  if (n === 3) return PALETTE_3;
  if (n === 4) return PALETTE_4;
  if (n === 5) return PALETTE_5;
  return PALETTE_MORE;
}

/**
 * Pie colors by share size (largest → smallest), palette sized to slice count:
 * - 2 → blue, green
 * - 3 → blue, green, red
 * - 4 → blue, green, red, yellow
 * - 5 → blue, green, red, yellow, gray
 *
 * Returns one color per item, same order as input weights.
 */
export function colorsByRankDesc(weights: number[]): string[] {
  const n = weights.length;
  if (n === 0) return [];

  const palette = paletteForCount(n);
  const order = weights
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w - a.w || a.i - b.i);

  const colors = new Array<string>(n);
  order.forEach((entry, rank) => {
    colors[entry.i] = palette[Math.min(rank, palette.length - 1)];
  });
  return colors;
}

/**
 * Sequential palette for funnel cards / non-ranked lists.
 */
export function chartColors(count: number): string[] {
  const base = [...paletteForCount(Math.max(count, 2))];
  while (base.length < count) {
    base.push(PALETTE_MORE[base.length % PALETTE_MORE.length]);
  }
  return base.slice(0, count);
}
