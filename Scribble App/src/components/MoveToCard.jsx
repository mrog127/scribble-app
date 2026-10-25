import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { EaselNameIcon, easelIconKey } from '../easelIcons.jsx'
import { createPortal } from 'react-dom'
import { getCategoryAccent } from '../theme.js'
import DestinationPicker, { EaselGlyph } from './DestinationPicker.jsx'
import { useAppContext } from '../context/AppContext.jsx'
import { kickBackdrops } from '../backdropKick.js'

// "Move to..." card. Opens centered over a dim scrim. Reuses the .save-to-* styles.
// mode 'projects' (default) picks a destination canvas: tapping one (or the
// Inbox, from the Easel button's menu) moves the item there straight away. It
// opens on the Easel the item is in.
// mode 'pages' picks a destination Easel — used when moving a canvas itself;
// tapping an Easel moves it there straight away.
export default function MoveToCard({ categories, currentCategoryId, currentProjectId, topPx, onCancel, onSave, mode = 'projects', title = 'Move to...' }) {
  const pagesMode = mode === 'pages'
  const { inboxIds } = useAppContext()
  const [sel, setSel] = useState({ categoryId: currentCategoryId, projectId: currentProjectId })
  // The Easel whose canvases are listed: the item's own, or (for an Inbox item)
  // the first Easel
  const [tab, setTab] = useState(() => (
    categories.some(c => c.id === currentCategoryId) ? currentCategoryId : (categories[0]?.id ?? null)
  ))
  const changed = pagesMode ? sel.categoryId !== currentCategoryId : sel.projectId !== currentProjectId
  const selCatIdx = categories.findIndex(c => c.id === sel.categoryId)
  const selAccent = selCatIdx !== -1 ? getCategoryAccent(selCatIdx) : null
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

  // With a phone's keyboard up (the search field takes the caret on open), the
  // card's foot rises to 16px above the keyboard
  useEffect(() => {
    const vv = window.visualViewport
    const app = document.getElementById('app')
    const card = cardRef.current
    if (!vv || !app || !card) return
    const base = card.style.bottom
    const baseline = parseFloat(base || getComputedStyle(card).bottom) || 0
    const fit = () => {
      const appRect = app.getBoundingClientRect()
      const cover = appRect.bottom - (vv.offsetTop + vv.height)
      if (cover > 80) {
        card.style.bottom = Math.max(baseline, cover + 16) + 'px'
      } else card.style.bottom = base
    }
    fit()
    vv.addEventListener('resize', fit)
    vv.addEventListener('scroll', fit)
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit) }
  }, [])
  const finish = (fn) => { setOpen(false); setTimeout(fn, 180) }

  // Fade the rest of the screen to 10% while open
  useEffect(() => {
    const app = document.getElementById('app')
    app?.classList.add('dim-bg')
    return () => { app?.classList.remove('dim-bg'); kickBackdrops() }
  }, [])

  // On open, scroll so the currently selected location is centered in the view
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const selectedEl = scroller.querySelector('.save-to-option.is-current')
    if (!selectedEl) return
    const sRect = scroller.getBoundingClientRect()
    const eRect = selectedEl.getBoundingClientRect()
    const delta = (eRect.top - sRect.top) - (scroller.clientHeight - eRect.height) / 2
    scroller.scrollTop += delta
    scroller.classList.toggle('scrolled', scroller.scrollTop > 4)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Projects mode: a tap is the decision
  const pick = (dest) => {
    if (dest.projectId === currentProjectId) { finish(onCancel); return }
    finish(() => onSave(dest))
  }

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
          onMouseDown={e => { e.preventDefault(); finish(onCancel) }}
        >
          Cancel
        </button>
      </div>
      {pagesMode ? (
      <div
        className="save-to-scroll"
        ref={scrollRef}
        onScroll={e => e.currentTarget.classList.toggle('scrolled', e.currentTarget.scrollTop > 4)}
      >
        {
          categories.map((cat, i) => {
            const acc = getCategoryAccent(i)
            const on = sel.categoryId === cat.id
            return (
              <div key={cat.id}>
                {i > 0 && <div className="save-to-divider"/>}
                <button
                  className={`save-to-option${on ? ' is-current' : ''}`}
                  /* Each row carries its own accent so the selected highlight
                     matches that page, rather than one colour for the list. */
                  style={{ '--cb-base': acc.base, '--cb-dark': acc.dark, '--cb-light': acc.light, '--cb-base-rgb': acc.baseRgb }}
                  onMouseDown={e => {
                    e.preventDefault()
                    // One tap moves it (tapping its own Easel just closes)
                    if (cat.id === currentCategoryId) { finish(onCancel); return }
                    const dest = { categoryId: cat.id, projectId: currentProjectId }
                    setSel(dest)
                    finish(() => onSave(dest))
                  }}
                >
                  {easelIconKey(cat.name)
                    ? <EaselNameIcon name={cat.name} color={acc.dark} className="dest-page-easel"/>
                    : <EaselGlyph accent={acc} className="dest-page-easel"/>}
                  <span>{cat.name}</span>
                </button>
              </div>
            )
          })
        }
      </div>
      ) : (
        <DestinationPicker
          categories={categories}
          selected={{ categoryId: currentCategoryId, projectId: currentProjectId }}
          browse={tab}
          onBrowse={setTab}
          onPick={pick}
          onPickInbox={() => inboxIds && pick(inboxIds)}
          keepId={currentProjectId}
          scrollRef={scrollRef}
          startLevel={categories.some(c => c.id === currentCategoryId) ? 'canvases' : 'easels'}
          autoFocus
          onEscape={() => finish(onCancel)}
        />
      )}
    </div>
    </div>,
    document.getElementById('app')
  )
}
