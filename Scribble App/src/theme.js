export const ACCENT_COLORS = [
  { base: '#6993FE', dark: '#3F5999', light: '#E1E9FF', baseRgb: '105,147,254' }, // Blue  – homepage
  { base: '#FE6969', dark: '#993F3F', light: '#FFE1E1', baseRgb: '254,105,105' }, // Red
  { base: '#FEA569', dark: '#99633F', light: '#FFEDE1', baseRgb: '254,165,105' }, // Orange
  { base: '#FED669', dark: '#99813F', light: '#FFF7E1', baseRgb: '254,214,105' }, // Yellow
  { base: '#73D976', dark: '#229026', light: '#CEF4CC', baseRgb: '115,217,118' }, // Green
  { base: '#B169FE', dark: '#6B3F99', light: '#EFE1FF', baseRgb: '177,105,254' }, // Purple
  { base: '#FE69F7', dark: '#993F95', light: '#FFE1FD', baseRgb: '254,105,247' }, // Pink
]

export const HOME_ACCENT = ACCENT_COLORS[0]

// categoryIndex is the 0-based position of the category in the sorted list.
// 0 → Red, 1 → Orange, …, 6+ → wraps back.
export function getCategoryAccent(categoryIndex) {
  return ACCENT_COLORS[(categoryIndex + 1) % ACCENT_COLORS.length]
}
