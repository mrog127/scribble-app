export const ACCENT_COLORS = [
  { base: '#7EA3BC', dark: '#607787', light: 'rgba(216,230,240,0.8)', baseRgb: '126,163,188' }, // Blue   – homepage
  { base: '#7EA3BC', dark: '#607787', light: 'rgba(216,230,240,0.8)', baseRgb: '126,163,188' }, // Blue   – cat 1
  { base: '#BD7F7F', dark: '#8A6262', light: 'rgba(240,216,216,0.8)', baseRgb: '189,127,127' }, // Red    – cat 2
  { base: '#7EBC88', dark: '#608766', light: 'rgba(216,240,220,0.8)', baseRgb: '126,188,136' }, // Green  – cat 2
  { base: '#BEA07D', dark: '#8A745E', light: 'rgba(242,231,218,0.8)', baseRgb: '190,160,125' }, // Orange – cat 3
  { base: '#9F80BC', dark: '#746087', light: 'rgba(229,218,240,0.8)', baseRgb: '159,128,188' }, // Purple – cat 4
  { base: '#BEB17D', dark: '#8A8160', light: 'rgba(242,236,213,0.8)', baseRgb: '190,177,125' }, // Yellow – cat 5
  { base: '#BC7EA5', dark: '#876079', light: 'rgba(240,216,231,0.8)', baseRgb: '188,126,165' }, // Pink   – cat 6
]

export const HOME_ACCENT = ACCENT_COLORS[0]

// categoryIndex is the 0-based position of the category in the sorted list.
// 0 → Red, 1 → Orange, …, 6+ → wraps back.
export function getCategoryAccent(categoryIndex) {
  return ACCENT_COLORS[(categoryIndex + 1) % ACCENT_COLORS.length]
}
