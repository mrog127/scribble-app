import { useRef, useLayoutEffect } from 'react'
import { getCategoryAccent } from '../theme.js'

// Category tab bar for the Save to / Move to cards. Styled and behaves like the
// homepage footer tabs (scrollable text tabs with a sliding indicator), but with
// no Home/Menu icons and no text box. Selecting a tab filters the list above it
// to that category's projects.
export default function CardTabs({ categories, selected, onSelect }) {
  const scrollRef = useRef(null)
  const indRef = useRef(null)
  const selIdx = categories.findIndex(c => c.id === selected)
  const accent = selIdx >= 0 ? getCategoryAccent(selIdx) : null

  useLayoutEffect(() => {
    const scroll = scrollRef.current, ind = indRef.current
    if (!scroll || !ind) return
    const btn = scroll.querySelector('.card-tab.selected')
    if (!btn) { ind.style.opacity = '0'; return }
    ind.style.opacity = '1'
    ind.style.left = btn.offsetLeft + 'px'
    ind.style.width = btn.offsetWidth + 'px'
    // Keep the selected tab within view
    const sRect = scroll.getBoundingClientRect()
    const bRect = btn.getBoundingClientRect()
    if (bRect.left < sRect.left) scroll.scrollLeft -= (sRect.left - bRect.left) + 16
    else if (bRect.right > sRect.right) scroll.scrollLeft += (bRect.right - sRect.right) + 16
  }, [selected, categories])

  return (
    <div className="card-tabs" style={accent ? { '--accent-dark': accent.dark, '--accent-base-rgb': accent.baseRgb } : undefined}>
      <div className="card-tabs-scroll" ref={scrollRef}>
        <div className="card-tab-indicator" ref={indRef} />
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`card-tab${selected === cat.id ? ' selected' : ''}`}
            onMouseDown={e => { e.preventDefault(); onSelect(cat.id) }}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </div>
  )
}
