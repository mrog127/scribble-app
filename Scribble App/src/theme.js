export const ACCENT_COLORS = [
  { base: '#6993FE', dark: '#3F5999', light: '#E1E9FF', baseRgb: '105,147,254' }, // Blue   – homepage
  { base: '#6993FE', dark: '#3F5999', light: '#E1E9FF', baseRgb: '105,147,254' }, // Blue   – cat 1
  { base: '#FE6969', dark: '#993F3F', light: '#FFE1E1', baseRgb: '254,105,105' }, // Red    – cat 2
  { base: '#73D976', dark: '#229026', light: '#CEF4CC', baseRgb: '115,217,118' }, // Green  – cat 2
  { base: '#FEA569', dark: '#99633F', light: '#FFEDE1', baseRgb: '254,165,105' }, // Orange – cat 3
  { base: '#B169FE', dark: '#6B3F99', light: '#EFE1FF', baseRgb: '177,105,254' }, // Purple – cat 4
  { base: '#FED669', dark: '#99813F', light: '#FFF7E1', baseRgb: '254,214,105' }, // Yellow – cat 5
  { base: '#FE69F7', dark: '#993F95', light: '#FFE1FD', baseRgb: '254,105,247' }, // Pink   – cat 6
]

export const HOME_ACCENT = ACCENT_COLORS[0]

// categoryIndex is the 0-based position of the category in the sorted list.
// 0 → Red, 1 → Orange, …, 6+ → wraps back.
export function getCategoryAccent(categoryIndex) {
  return ACCENT_COLORS[(categoryIndex + 1) % ACCENT_COLORS.length]
}
