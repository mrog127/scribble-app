import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { getCategoryAccent } from '../theme.js'
import CardTabs from './CardTabs.jsx'

// "Move to..." card — pick a destination project. Nothing applies until Save.
// Opens centered over a dim scrim. Reuses the .save-to-* styles. Defaults to the
// tab and project the item is currently in.
export default function MoveToCard({ categories, currentCategoryId, currentProjectId, topPx, onCancel, onSave }) {
  const [sel, setSel] = useState({ categoryId: currentCategoryId, projectId: currentProjectId })
  const [tab, setTab] = useState(currentCategoryId)
  const changed = sel.projectId !== currentProjectId
  const selCatIdx = categories.findIndex(c => c.id === sel.categoryId)
  const selAccent = selCatIdx !== -1 ? getCategoryAccent(selCatIdx) : null
  const tabCatIdx = categories.findIndex(c => c.id === tab)
  const tabAccent = tabCatIdx !== -1 ? getCategoryAccent(tabCatIdx) : null
  // Only active projects are valid destinations; the item's own project is shown
  // even if archived (so it can be left there), but never any other archived one.
  const tabProjects = (categories.find(c => c.id === tab)?.projects || [])
    .filter(p => !p.archived || p.id === currentProjectId)
  const scrollRef = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => { requestAnimationFrame(() => setOpen(true)) }, [])
  const finish = (fn) => { setOpen(false); setTimeout(fn, 180) }

  // Fade the rest of the screen to 10% while open
  useEffect(() => {
    const app = document.getElementById('app')
    app?.classList.add('dim-bg')
    return () => app?.classList.remove('dim-bg')
  }, [])

  // On open, scroll so the currently selected location is centered in the view
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const selectedEl = scroller.querySelector('.save-to-option.selected')
    if (!selectedEl) return
    const sRect = scroller.getBoundingClientRect()
    const eRect = selectedEl.getBoundingClientRect()
    const delta = (eRect.top - sRect.top) - (scroller.clientHeight - eRect.height) / 2
    scroller.scrollTop += delta
    scroller.classList.toggle('scrolled', scroller.scrollTop > 4)
  }, [])

  return createPortal(
    <div className={`move-to-overlay${open ? ' open' : ''}`} onPointerDown={() => finish(onCancel)}>
    <div
      className={`move-to-card${open ? ' open' : ''}`}
      onPointerDown={e => e.stopPropagation()}
      style={selAccent ? { '--accent-dark': selAccent.dark } : undefined}
    >
      <div className="save-to-header">
        <p className="save-to-title">Move to...</p>
        <button
          className="save-to-cancel"
          onMouseDown={e => { e.preventDefault(); changed ? finish(() => onSave(sel)) : finish(onCancel) }}
        >
          {changed ? 'Save' : 'Cancel'}
        </button>
      </div>
      <div
        className="save-to-scroll"
        ref={scrollRef}
        onScroll={e => e.currentTarget.classList.toggle('scrolled', e.currentTarget.scrollTop > 4)}
        style={tabAccent ? { '--cb-base': tabAccent.base, '--cb-dark': tabAccent.dark, '--cb-light': tabAccent.light, '--cb-base-rgb': tabAccent.baseRgb } : undefined}
      >
        {tabProjects.length === 0 ? (
          <p className="save-to-empty">No projects yet</p>
        ) : tabProjects.map((proj, i) => (
          <div key={proj.id}>
            {i > 0 && <div className="save-to-divider"/>}
            <button
              className={`save-to-option${sel.projectId === proj.id ? ' selected' : ''}`}
              onMouseDown={e => { e.preventDefault(); setSel({ categoryId: tab, projectId: proj.id }) }}
            >
              <div className={`save-to-radio${sel.projectId === proj.id ? ' filled' : ''}`}/>
              <span>{proj.name}</span>
            </button>
          </div>
        ))}
      </div>
      <CardTabs categories={categories} selected={tab} onSelect={setTab} />
    </div>
    </div>,
    document.getElementById('app')
  )
}
