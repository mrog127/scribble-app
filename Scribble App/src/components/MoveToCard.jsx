import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { getCategoryAccent } from '../theme.js'
import CardTabs from './CardTabs.jsx'
import AddCanvasRow from './AddCanvasRow.jsx'

// "Move to..." card — pick a destination project. Nothing applies until Save.
// Opens centered over a dim scrim. Reuses the .save-to-* styles. Defaults to the
// tab and project the item is currently in.
// mode 'projects' (default) picks a destination canvas; mode 'pages' picks a
// destination category page — used when moving a canvas itself.
export default function MoveToCard({ categories, currentCategoryId, currentProjectId, topPx, onCancel, onSave, mode = 'projects', title = 'Move to...' }) {
  const pagesMode = mode === 'pages'
  const [sel, setSel] = useState({ categoryId: currentCategoryId, projectId: currentProjectId })
  const [tab, setTab] = useState(currentCategoryId)
  const changed = pagesMode ? sel.categoryId !== currentCategoryId : sel.projectId !== currentProjectId
  const selCatIdx = categories.findIndex(c => c.id === sel.categoryId)
  const selAccent = selCatIdx !== -1 ? getCategoryAccent(selCatIdx) : null
  const tabCatIdx = categories.findIndex(c => c.id === tab)
  const tabAccent = tabCatIdx !== -1 ? getCategoryAccent(tabCatIdx) : null
  // Only active projects are valid destinations; the item's own project is shown
  // even if archived (so it can be left there), but never any other archived one.
  const tabProjects = (categories.find(c => c.id === tab)?.projects || [])
    .filter(p => !p.archived || p.id === currentProjectId)
  const scrollRef = useRef(null)
  const cardRef = useRef(null)
  const [open, setOpen] = useState(false)

  // Dark Dots, phone layout, opened from a list item / note / link page: the
  // card runs from 16px below the page title down to 16px above the footer's
  // folder (canvas) button, and the page behind dims to 50% except that button.
  useLayoutEffect(() => {
    if (!['dark-dots', 'light-dots'].includes(document.documentElement.dataset.theme)) return
    if (window.innerWidth >= 1000) return
    const app = document.getElementById('app')
    const card = cardRef.current
    const pages = [...document.querySelectorAll('.note-detail-page.open')]
    const page = pages[pages.length - 1]
    const folder = page?.querySelector('.detail-footer-project-btn')
    if (!app || !card || !page || !folder) return
    const appRect = app.getBoundingClientRect()
    const fRect = folder.getBoundingClientRect()
    // The title may have scrolled up under the header — then the header's edge
    const title = page.querySelector('.todo-detail-title, .note-detail-title')
    const header = page.querySelector('.note-detail-header')
    const tRect = title?.getBoundingClientRect()
    const hRect = header?.getBoundingClientRect()
    const titleBottom = Math.max(tRect && tRect.height ? tRect.bottom : 0, hRect ? hRect.bottom : 0)
    card.style.top = (titleBottom - appRect.top + 16) + 'px'
    card.style.bottom = (appRect.bottom - fRect.top + 16) + 'px'
    app.classList.add('move-from-detail')
    return () => app.classList.remove('move-from-detail')
  }, [])

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
  }, [tab])

  return createPortal(
    <div className={`move-to-overlay${open ? ' open' : ''}`} onPointerDown={() => finish(onCancel)}>
    <div
      ref={cardRef}
      className={`move-to-card${open ? ' open' : ''}`}
      onPointerDown={e => e.stopPropagation()}
      style={selAccent ? { '--accent-dark': selAccent.dark } : undefined}
    >
      <div className="save-to-header">
        <p className="save-to-title">{title}</p>
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
        {pagesMode ? (
          categories.map((cat, i) => {
            const acc = getCategoryAccent(i)
            const on = sel.categoryId === cat.id
            return (
              <div key={cat.id}>
                {i > 0 && <div className="save-to-divider"/>}
                <button
                  className={`save-to-option${on ? ' selected' : ''}`}
                  /* Each row carries its own accent so the selected highlight
                     matches that page, rather than one colour for the list. */
                  style={{ '--cb-base': acc.base, '--cb-dark': acc.dark, '--cb-light': acc.light, '--cb-base-rgb': acc.baseRgb }}
                  onMouseDown={e => { e.preventDefault(); setSel({ categoryId: cat.id, projectId: currentProjectId }) }}
                >
                  <div className={`save-to-radio${on ? ' filled' : ''}`}/>
                  <span>{cat.name}</span>
                </button>
              </div>
            )
          })
        ) : (
          <>
            {tabProjects.map((proj, i) => (
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
            <AddCanvasRow
              categoryId={tab}
              onCreated={({ categoryId, projectId }) => setSel({ categoryId, projectId })}
            />
          </>
        )}
      </div>
      {!pagesMode && <CardTabs categories={categories} selected={tab} onSelect={setTab} />}
    </div>
    </div>,
    document.getElementById('app')
  )
}
