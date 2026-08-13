export const ACCENT_COLORS = [
  { base: '#78A4C2', dark: '#43535E', light: '#E4EEF4', baseRgb: '120,164,194' }, // Blue   – homepage
  { base: '#78A4C2', dark: '#43535E', light: '#E4EEF4', baseRgb: '120,164,194' }, // Blue   – cat 1
  { base: '#D76969', dark: '#614545', light: '#F4E4E4', baseRgb: '215,105,105' }, // Red    – cat 2
  { base: '#7CBE87', dark: '#435E47', light: '#E4F4E6', baseRgb: '124,190,135' }, // Green  – cat 2
  { base: '#E2AA6A', dark: '#615142', light: '#F6EEE5', baseRgb: '226,170,106' }, // Orange – cat 3
  { base: '#9F7AC2', dark: '#51435E', light: '#EDE5F4', baseRgb: '159,122,194' }, // Purple – cat 4
  { base: '#E1CB76', dark: '#615A43', light: '#F6F2E2', baseRgb: '225,203,118' }, // Yellow – cat 5
  { base: '#D177B0', dark: '#5E4355', light: '#F4E4EE', baseRgb: '209,119,176' }, // Pink   – cat 6
]

export const HOME_ACCENT = ACCENT_COLORS[0]

// The seven hand-picked easel colours, in ring order:
// blue → red → green → orange → purple → yellow → pink → (back to blue).
const PALETTE = ACCENT_COLORS.slice(1)
const N = PALETTE.length

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]
const rgbToHex = ([r, g, b]) =>
  '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0').toUpperCase()).join('')
const mixHex = (a, b, f) => {
  const A = hexToRgb(a), B = hexToRgb(b)
  return rgbToHex([0, 1, 2].map(i => A[i] + (B[i] - A[i]) * f))
}

// Where to sit between two neighbouring colours, for successive passes around
// the ring. Repeated bisection: 1/2, then 1/4 and 3/4, then 1/8, 3/8, 5/8, 7/8…
// Every pass halves the previous gaps, so no two easels ever land on the same
// colour no matter how many are added.
function bisectionFraction(pass) {
  const level = Math.floor(Math.log2(pass + 1))   // 0, 1, 1, 2, 2, 2, 2, …
  const i = pass + 1 - 2 ** level                 // position within the level
  return (2 * i + 1) / 2 ** (level + 1)
}

// categoryIndex is the 0-based position of the category in the sorted list.
// 0–6 are the defined colours. Beyond that, each easel takes a colour blended
// between two neighbours: the 8th sits between blue and red, the 9th between
// red and green, and so on round the ring; the 15th then sits between blue and
// the 8th, the 16th between red and the 9th, and so on — each pass subdividing
// the gaps created by the last.
export function getCategoryAccent(categoryIndex) {
  const i = Math.max(0, categoryIndex | 0)
  if (i < N) return PALETTE[i]

  const m = i - N
  const sector = m % N            // which neighbouring pair to sit between
  const pass = Math.floor(m / N)  // how many times round the ring so far
  const f = bisectionFraction(pass)

  const from = PALETTE[sector]
  const to = PALETTE[(sector + 1) % N]
  // Blend base, dark and light together so the generated set keeps the same
  // relationship between the three that the hand-picked ones have.
  const base = mixHex(from.base, to.base, f)
  return {
    base,
    dark: mixHex(from.dark, to.dark, f),
    light: mixHex(from.light, to.light, f),
    baseRgb: hexToRgb(base).map(Math.round).join(','),
  }
}
