import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ALL_ICONS, EaselNameIcon, easelIconKey } from '../easelIcons.jsx'
import { kickBackdrops } from '../backdropKick.js'

// "Change icon" card, from an Easel's menu in Settings. Laid out as the Save
// to / Move to card: a header with Cancel, a grey box holding (here) a grid of
// every icon, and the search pill beneath. Tapping an icon picks it.
export default function IconPickerCard({ category, color, onPick, onCancel }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const current = easelIconKey(category?.name, category?.icon)

  useEffect(() => { requestAnimationFrame(() => setOpen(true)) }, [])
  // Fade the rest of the screen while open, as Move to does
  useEffect(() => {
    const app = document.getElementById('app')
    app?.classList.add('dim-bg')
    return () => { app?.classList.remove('dim-bg'); kickBackdrops() }
  }, [])
  const finish = (fn) => { setOpen(false); setTimeout(fn, 180) }

  // Each search word must start a word the icon is known by (its name, its
  // tags, the Easel names that pick it); icons whose own name matches lead
  const icons = useMemo(() => {
    const q = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!q.length) return ALL_ICONS
    const hits = ALL_ICONS.filter(i => {
      const words = i.terms.split(/\s+/)
      return q.every(w => words.some(t => t.startsWith(w)))
    })
    const byName = (i) => q.every(w => i.name.split('-').some(t => t.startsWith(w))) ? 0 : 1
    return hits.sort((a, b) => byName(a) - byName(b))
  }, [query])

  const pick = (name) => finish(() => (name === current ? onCancel() : onPick(name)))

  return createPortal(
    <div className={`move-to-overlay${open ? ' open' : ''}`} onPointerDown={() => finish(onCancel)}>
      <div className={`move-to-card icon-picker-card${open ? ' open' : ''}`} onPointerDown={e => e.stopPropagation()}>
        <div className="save-to-header">
          <p className="save-to-title">Change icon</p>
          <button className="save-to-cancel" onMouseDown={e => { e.preventDefault(); finish(onCancel) }}>Cancel</button>
        </div>

        <div className="dest-list-box">
          <div
            className="save-to-scroll dest-canvas-list icon-picker-grid"
            onScroll={e => e.currentTarget.classList.toggle('scrolled', e.currentTarget.scrollTop > 4)}
          >
            {icons.map(i => (
              <button
                key={i.name}
                type="button"
                className={`icon-picker-cell${i.name === current ? ' is-current' : ''}`}
                aria-label={i.name.replace(/-/g, ' ')}
                title={i.name.replace(/-/g, ' ')}
                onClick={() => pick(i.name)}
              >
                <EaselNameIcon icon={i.name} color={color} size={24}/>
              </button>
            ))}
            {!icons.length && <div className="dest-empty icon-picker-empty">No icons</div>}
          </div>
        </div>

        <div className="dest-search-bar">
          <div className="dest-search-field">
            <svg className="dest-search-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="8.75" cy="8.75" r="5.25" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <line x1="12.6" y1="12.6" x2="16.75" y2="16.75" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <input
              className="dest-search-input"
              placeholder="Search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); if (icons[0]) pick(icons[0].name) }
                else if (e.key === 'Escape') { e.preventDefault(); finish(onCancel) }
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck="false"
              enterKeyHint="go"
            />
          </div>
        </div>
      </div>
    </div>,
    document.getElementById('app')
  )
}
