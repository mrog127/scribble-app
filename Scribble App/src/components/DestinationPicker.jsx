import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { getCategoryAccent, getInboxAccent } from '../theme.js'
import AddCanvasRow from './AddCanvasRow.jsx'

// Inbox tray — the Inbox's glyph wherever an Easel would show its easel
export function InboxIcon({ size = 18, color = 'currentColor', strokeWidth = 1, className }) {
  // The colour sits on the svg itself (children inherit it), so menus that
  // restyle their icons' strokes with `stroke: inherit` still get it
  const p = { strokeWidth, vectorEffect: 'non-scaling-stroke', strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, stroke: color }}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" {...p}/>
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" {...p}/>
    </svg>
  )
}

// An Easel, drawn as in the Easels menu: its dark colour on a 16% wash of it
export function EaselGlyph({ accent, size = 18, className }) {
  const line = { stroke: accent?.dark || 'var(--accent-dark)' }
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
      <rect x="3.5" y="2.5" width="13" height="9.5" style={{ ...line, fill: accent?.base || 'var(--accent-base)', fillOpacity: 0.16 }} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <line x1="10" y1="12" x2="10" y2="17.5" style={line} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      <line x1="6" y1="12" x2="3.5" y2="17.5" style={line} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      <line x1="14" y1="12" x2="16.5" y2="17.5" style={line} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  )
}

const accentVars = (a, prefix) => a ? {
  [`--${prefix}-base`]: a.base, [`--${prefix}-dark`]: a.dark, [`--${prefix}-light`]: a.light, [`--${prefix}-base-rgb`]: a.baseRgb,
} : undefined

/*
  The body of the Save to / Move to menus: the canvases of one Easel above, and
  at the foot an Easel button (the Add item type-button pill, in that Easel's
  colours). Tapping a canvas picks it straight away. The Easel button opens an
  Easels menu — the control bar's list (no header), the Inbox at the top: an Easel there
  switches the list to its canvases, the Inbox picks the Inbox.

  selected:   { categoryId, projectId } | null — the current destination
  browse:     the Easel whose canvases are listed
  keepId:     a canvas to list even if archived (the item's own)
*/
export default function DestinationPicker({
  categories, selected, browse, onBrowse, onPick, onPickInbox,
  keepId = null, scrollRef, addCanvasActive = true, onAddCanvasDone,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [addSignal, setAddSignal] = useState(0)   // bumps to open the new-canvas field
  const barRef = useRef(null)
  const menuRef = useRef(null)
  const ownScrollRef = useRef(null)
  const listRef = scrollRef || ownScrollRef

  const catIdx = categories.findIndex(c => c.id === browse)
  const cat = catIdx >= 0 ? categories[catIdx] : null
  const accent = cat ? getCategoryAccent(catIdx) : null
  const projs = (cat?.projects || []).filter(p => !p.archived || p.id === keepId)

  // The Easels menu rises from the Easel button and may run past the top of
  // the card it sits in (the card lets it out while it's open), stopping 24px
  // short of the top of the screen and scrolling beyond that
  useLayoutEffect(() => {
    if (!menuOpen) return
    const menu = menuRef.current, bar = barRef.current
    const card = bar?.closest('.save-to-card, .move-to-card')
    if (!menu || !bar || !card) return
    const holders = [card, card.closest('.save-to-panel')].filter(Boolean)
    holders.forEach(el => el.classList.add('easels-open'))
    const app = document.getElementById('app')
    const top = Math.max(0, app ? app.getBoundingClientRect().top : 0)
    const room = bar.getBoundingClientRect().top - top - 24
    menu.style.maxHeight = Math.max(160, room) + 'px'
    return () => holders.forEach(el => el.classList.remove('easels-open'))
  }, [menuOpen])

  // A tap anywhere outside the menu (its Easel button included) only closes
  // it — the tap is swallowed, so it doesn't also pick a canvas underneath
  useEffect(() => {
    if (!menuOpen) return
    let swallowing = false
    const inside = (e) => e.target instanceof Element && e.target.closest('.dest-easels-menu')
    const onDown = (e) => {
      if (inside(e)) return
      e.preventDefault()
      e.stopPropagation()
      swallowing = true
      setMenuOpen(false)
    }
    const swallow = (e) => {
      if (!swallowing) return
      e.preventDefault()
      e.stopPropagation()
      if (e.type === 'click') swallowing = false
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('mousedown', swallow, true)
    document.addEventListener('pointerup', swallow, true)
    document.addEventListener('click', swallow, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      // the tap's own trailing events still arrive after the menu closes
      setTimeout(() => {
        document.removeEventListener('mousedown', swallow, true)
        document.removeEventListener('pointerup', swallow, true)
        document.removeEventListener('click', swallow, true)
      }, 400)
    }
  }, [menuOpen])

  // A different Easel starts its list at the top
  useEffect(() => {
    const s = listRef.current
    if (s) { s.scrollTop = 0; s.classList.remove('scrolled') }
  }, [browse]) // eslint-disable-line react-hooks/exhaustive-deps

  const inboxAccent = getInboxAccent()

  // Swiping across the canvas list steps through the Easels in order (not the
  // Inbox): right-to-left shows the next Easel's canvases, left-to-right the
  // previous one's. The list slides in from the side it came from.
  const swipeRef = useRef(null)
  const rowTapRef = useRef(null)
  const slideDirRef = useRef(0)
  const onListPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.target.closest('input, .save-to-new-row')) return
    swipeRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
  }
  const onListPointerUp = (e) => {
    const sw = swipeRef.current
    swipeRef.current = null
    if (!sw || sw.id !== e.pointerId) return
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    const idx = categories.findIndex(c => c.id === browse)
    const next = categories[idx + (dx < 0 ? 1 : -1)]
    if (!next) return
    slideDirRef.current = dx < 0 ? 1 : -1
    setMenuOpen(false)
    onBrowse(next.id)
  }
  useLayoutEffect(() => {
    const dir = slideDirRef.current
    slideDirRef.current = 0
    const el = listRef.current
    if (!dir || !el) return
    el.animate(
      [{ transform: `translateX(${dir * 32}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
      { duration: 200, easing: 'ease-out' }
    )
  }, [browse]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div
        className="save-to-scroll dest-canvas-list"
        ref={listRef}
        onScroll={e => e.currentTarget.classList.toggle('scrolled', e.currentTarget.scrollTop > 4)}
        onPointerDown={onListPointerDown}
        onPointerUp={onListPointerUp}
        onPointerCancel={() => { swipeRef.current = null }}
        style={{ ...accentVars(accent, 'cb'), touchAction: 'pan-y' }}
      >
        {projs.map((proj, i) => {
          const on = selected?.projectId === proj.id
          return (
            <div key={proj.id}>
              {i > 0 && <div className="save-to-divider"/>}
              <button
                className={`save-to-option no-radio${on ? ' is-current' : ''}`}
                /* Picked on a clean tap only — press and release in place. A
                   swipe across the list (to step through the Easels) or a
                   scroll never picks the row it started or ended on. */
                onMouseDown={e => e.preventDefault()}
                onPointerDown={e => { rowTapRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, projectId: proj.id } }}
                onPointerUp={e => {
                  const t = rowTapRef.current
                  rowTapRef.current = null
                  if (!t || t.id !== e.pointerId || t.projectId !== proj.id) return
                  if (Math.abs(e.clientX - t.x) > 8 || Math.abs(e.clientY - t.y) > 8) return
                  onPick({ categoryId: browse, projectId: proj.id })
                }}
                onPointerCancel={() => { rowTapRef.current = null }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick({ categoryId: browse, projectId: proj.id }) } }}
              >
                <span>{proj.name}</span>
              </button>
            </div>
          )
        })}
        <AddCanvasRow
          active={addCanvasActive}
          categoryId={browse}
          onCreated={pick => onPick(pick)}
          onDone={onAddCanvasDone}
          openSignal={addSignal}
          hideTrigger
        />
      </div>

      <div className="dest-easel-bar" ref={barRef}>
        <button
          type="button"
          className={`dest-easel-btn${menuOpen ? ' open' : ''}`}
          style={accentVars(accent, 'cb')}
          onMouseDown={e => { e.preventDefault(); setMenuOpen(v => !v) }}
        >
          <EaselGlyph accent={accent}/>
          <span className="dest-easel-label">{cat?.name || 'Choose easel'}</span>
        </button>

        {/* Add canvas: opens the name field at the foot of the list above */}
        <button
          type="button"
          className="dest-add-canvas-btn"
          style={accentVars(accent, 'cb')}
          disabled={!browse}
          onMouseDown={e => { e.preventDefault(); setMenuOpen(false); setAddSignal(n => n + 1) }}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
            <line x1="10" y1="3.5" x2="10" y2="16.5" style={{ stroke: accent?.base || 'var(--accent-base)' }} strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
            <line x1="3.5" y1="10" x2="16.5" y2="10" style={{ stroke: accent?.base || 'var(--accent-base)' }} strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
          </svg>
          <span className="dest-easel-label">Add canvas</span>
        </button>

        <div ref={menuRef} className={`card-context-menu mbar-page-menu dest-easels-menu${menuOpen ? ' open' : ''}`}>
          <div className="mbar-page-menu-list">
            <div>
              <button
                className="card-context-item dest-inbox-item"
                onMouseDown={e => { e.preventDefault(); setMenuOpen(false); onPickInbox() }}
              >
                <InboxIcon color={inboxAccent.dark} strokeWidth={2}/>
                <span className="mbar-page-menu-label" style={{ color: inboxAccent.dark }}>Inbox</span>
              </button>
            </div>
            {categories.map((c, idx) => {
              const acc = getCategoryAccent(idx)
              return (
                <div key={c.id}>
                  <button
                    className="card-context-item"
                    onMouseDown={e => { e.preventDefault(); setMenuOpen(false); onBrowse(c.id) }}
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ stroke: acc.dark, marginRight: 2 }}>
                      <rect x="3.5" y="2.5" width="13" height="9.5" fill={acc.base} fillOpacity="0.16" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                      <line x1="10" y1="12" x2="10" y2="17.5" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                      <line x1="6" y1="12" x2="3.5" y2="17.5" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                      <line x1="14" y1="12" x2="16.5" y2="17.5" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                    </svg>
                    <span className="mbar-page-menu-label" style={{ color: acc.dark }}>{c.name}</span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
