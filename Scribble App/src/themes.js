// App themes. The theme id lands on <html data-theme="…">; every theme's looks
// live in CSS under that attribute (see the Themes section at the end of
// layout.css). Stored per device in localStorage.
//
// paintbrush — the original cream design.
// dark-dots  — the dark theme from Figma (Gallery frame 384:6648).

export const THEMES = [
  { id: 'dark-dots', name: 'Dark Dots' },
  { id: 'paintbrush', name: 'Paintbrush' },
]

export const DEFAULT_THEME = 'dark-dots'

const KEY = 'scribble-theme'

export function getTheme() {
  try {
    const saved = localStorage.getItem(KEY)
    if (THEMES.some(t => t.id === saved)) return saved
  } catch { /* private mode */ }
  return DEFAULT_THEME
}

export function themeName(id) {
  return THEMES.find(t => t.id === id)?.name || ''
}

export function applyTheme(id) {
  document.documentElement.dataset.theme = id
  // Keeps the iOS status-bar strip the same colour as the app
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', id === 'dark-dots' ? '#212121' : '#F2F0EB')
}

const listeners = new Set()

export function setTheme(id) {
  try { localStorage.setItem(KEY, id) } catch { /* private mode */ }
  applyTheme(id)
  listeners.forEach(fn => fn(id))
}

// Components that need to render differently per theme (rather than just look
// different, which CSS handles) subscribe through this.
export function subscribeTheme(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Called before the first render so the app never paints the wrong theme.
export function installTheme() {
  applyTheme(getTheme())
}
