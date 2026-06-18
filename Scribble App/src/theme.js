export const ACCENT_COLORS = [
  { base: '#78A4C2', dark: '#43535E', light: '#E4EEF4', baseRgb: '120,164,194' }, // Blue   – homepage
  { base: '#78A4C2', dark: '#43535E', light: '#E4EEF4', baseRgb: '120,164,194' }, // Blue   – cat 1
  { base: '#C37979', dark: '#614545', light: '#F4E4E4', baseRgb: '195,121,121' }, // Red    – cat 2
  { base: '#78C284', dark: '#435E47', light: '#E4F4E6', baseRgb: '120,194,132' }, // Green  – cat 2
  { base: '#C5A076', dark: '#615142', light: '#F6EEE5', baseRgb: '197,160,118' }, // Orange – cat 3
  { base: '#9F7AC2', dark: '#51435E', light: '#EDE5F4', baseRgb: '159,122,194' }, // Purple – cat 4
  { base: '#C5B576', dark: '#615A43', light: '#F6F2E2', baseRgb: '197,181,118' }, // Yellow – cat 5
  { base: '#C278A7', dark: '#5E4355', light: '#F4E4EE', baseRgb: '194,120,167' }, // Pink   – cat 6
]

export const HOME_ACCENT = ACCENT_COLORS[0]

// categoryIndex is the 0-based position of the category in the sorted list.
// 0 → Red, 1 → Orange, …, 6+ → wraps back.
export function getCategoryAccent(categoryIndex) {
  return ACCENT_COLORS[(categoryIndex + 1) % ACCENT_COLORS.length]
}
