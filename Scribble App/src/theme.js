export const ACCENT_COLORS = [
  { base: '#78A4C2', dark: '#43535E', light: '#E4EEF4', baseRgb: '120,164,194' }, // Blue   – homepage
  { base: '#78A4C2', dark: '#43535E', light: '#E4EEF4', baseRgb: '120,164,194' }, // Blue   – cat 1
  { base: '#D76969', dark: '#614545', light: '#F4E4E4', baseRgb: '215,105,105' }, // Red    – cat 2
  { base: '#78C284', dark: '#435E47', light: '#E4F4E6', baseRgb: '120,194,132' }, // Green  – cat 2
  { base: '#E2AA6A', dark: '#615142', light: '#F6EEE5', baseRgb: '226,170,106' }, // Orange – cat 3
  { base: '#9F7AC2', dark: '#51435E', light: '#EDE5F4', baseRgb: '159,122,194' }, // Purple – cat 4
  { base: '#E1CB76', dark: '#615A43', light: '#F6F2E2', baseRgb: '225,203,118' }, // Yellow – cat 5
  { base: '#D177B0', dark: '#5E4355', light: '#F4E4EE', baseRgb: '209,119,176' }, // Pink   – cat 6
]

export const HOME_ACCENT = ACCENT_COLORS[0]

// categoryIndex is the 0-based position of the category in the sorted list.
// 0 → Red, 1 → Orange, …, 6+ → wraps back.
export function getCategoryAccent(categoryIndex) {
  return ACCENT_COLORS[(categoryIndex + 1) % ACCENT_COLORS.length]
}
