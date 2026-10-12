import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { getCategoryAccent, getInboxAccent } from '../theme.js'
import AddCanvasRow from './AddCanvasRow.jsx'
import { isPhoneLayout } from '../layoutMode'

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


const isDots = () => ['dark-dots', 'light-dots'].includes(document.documentElement.dataset.theme)

/*
  The body of the Save to / Move to menus.

  A grey list box holds one of three lists:
    - 'easels':   the Inbox, then every Easel — tapping an Easel lists its
                  canvases, tapping the Inbox picks it
    - 'canvases': one Easel's canvases (each with that Easel's icon) — tapping
                  one picks it. At the foot of the box sit the Easel button
                  (opens the Easels menu: the Inbox, then the Easels) and Add
                  canvas (opens the name field at the end of the list).
    - results:    while something is typed in the search field — matching
                  canvases (and every canvas of a matching Easel), the Inbox
                  first, as in the @ tag menu: the canvas name with its Easel's
                  name under it in the Easel's colour

  Beneath the box, a grey search pill. A press anywhere else in the menu takes
  the caret out of it.

  selected:    { categoryId, projectId } | null — the current destination
  browse:      the Easel whose canvases are listed
  keepId:      a canvas to list even if archived (the item's own)
  open:        each time this turns true the menu starts over (startLevel, no query)
  startLevel:  'easels' | 'canvases'
  autoFocus:   focus the search field on mount (inside the opening tap, so a
               phone raises its keyboard)
*/
export default function DestinationPicker({
  categories, selected, browse, onBrowse, onPick, onPickInbox,
  keepId = null, scrollRef, addCanvasActive = true, onAddCanvasDone,
  open = true, startLevel = 'canvases', autoFocus = false,
  searchRef, onSearchBlur, onEscape,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [addSignal, setAddSignal] = useState(0)   // bumps to open the new-canvas field
  const [level, setLevel] = useState(startLevel)
  const [query, setQuery] = useState('')
  const barRef = useRef(null)
  const menuRef = useRef(null)
  const fieldRef = useRef(null)
  const ownScrollRef = useRef(null)
  const ownSearchRef = useRef(null)
  const listRef = scrollRef || ownScrollRef
  const inputRef = searchRef || ownSearchRef

  const q = query.trim().toLowerCase()
  const searching = !!q
  const view = searching ? 'results' : level

  const catIdx = categories.findIndex(c => c.id === browse)
  const cat = catIdx >= 0 ? categories[catIdx] : null
  const accent = cat ? getCategoryAccent(catIdx) : null
  const projs = (cat?.projects || []).filter(p => !p.archived || p.id === keepId)
  const inboxAccent = getInboxAccent()
  const dots = isDots()

  // Each opening starts over: the first list, nothing typed
  useLayoutEffect(() => {
    if (!open) return
    setLevel(startLevel)
    setQuery('')
    setMenuOpen(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Desktop: a press anywhere in the menu outside the search field takes the
  // caret out of it (the menu's own handlers would otherwise keep focus where
  // it was). Phone: the field keeps the caret, and the keyboard stays up, for as
  // long as the menu is open — presses on everything else in the menu (the
  // Easels list and menu, the buttons, the canvases) still work but don't take
  // focus; only another text field (naming a new canvas) can.
  const isPhone = isPhoneLayout
  const pressInsideRef = useRef(0)
  useEffect(() => {
    if (!open) return
    const inCard = (t) => {
      const card = fieldRef.current?.closest('.save-to-card, .move-to-card')
      return !!(card && t && card.contains(t))
    }
    const onDown = (e) => {
      const t = e.target instanceof Element ? e.target : null
      if (!t) return
      if (isPhone()) {
        if (!inCard(t)) return
        pressInsideRef.current = Date.now()
        if (e.type === 'mousedown' && !t.closest('input, textarea, [contenteditable="true"]')) e.preventDefault()
        return
      }
      if (e.type !== 'pointerdown') return
      const input = inputRef.current
      if (!input || document.activeElement !== input) return
      if (t.closest('.dest-search-field')) return
      if (inCard(t)) input.blur()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('mousedown', onDown, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('mousedown', onDown, true)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Phone: if a press inside the menu still knocked the caret out of the field
  // (and it didn't go to another text field), put it straight back
  const handleSearchBlur = (e) => {
    if (open && isPhone() && Date.now() - pressInsideRef.current < 800) {
      setTimeout(() => {
        const input = inputRef.current
        const ae = document.activeElement
        if (!input || !input.isConnected) return
        if (ae && ae !== document.body && ae.matches?.('input, textarea, [contenteditable="true"]')) return
        input.focus({ preventScroll: true })
      }, 0)
      return
    }
    onSearchBlur?.(e)
  }

  // Search results, as in the @ tag menu
  const results = []
  if (searching) {
    if (onPickInbox && 'inbox'.includes(q)) results.push({ inbox: true, key: 'inbox', name: 'Inbox' })
    categories.forEach((c, idx) => {
      const easelHit = (c.name || '').toLowerCase().includes(q)
      ;(c.projects || []).forEach(p => {
        if (p.archived && p.id !== keepId) return
        if (easelHit || (p.name || '').toLowerCase().includes(q)) {
          results.push({ key: p.id, name: p.name, categoryId: c.id, projectId: p.id, categoryName: c.name, accent: getCategoryAccent(idx) })
        }
      })
    })
  }
  const pickResult = (r) => {
    if (!r) return
    if (r.inbox) onPickInbox?.()
    else onPick({ categoryId: r.categoryId, projectId: r.projectId })
  }

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

  // A list that runs on past the buttons beneath it fades out over its last
  // 16px (until it's scrolled to the end)
  const fadeFoot = () => {
    const el = listRef.current
    if (el) el.classList.toggle('fade-foot', el.scrollHeight - el.scrollTop - el.clientHeight > 1)
  }
  useLayoutEffect(fadeFoot)
  useEffect(() => {
    const el = listRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(fadeFoot)
    ro.observe(el)
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // A different list starts at the top
  useEffect(() => {
    const s = listRef.current
    if (s) { s.scrollTop = 0; s.classList.remove('scrolled') }
  }, [browse, view]) // eslint-disable-line react-hooks/exhaustive-deps

  // Swiping across the canvas list steps through the Easels in order (not the
  // Inbox): right-to-left shows the next Easel's canvases, left-to-right the
  // previous one's. The list slides in from the side it came from.
  const swipeRef = useRef(null)
  const rowTapRef = useRef(null)
  const slideDirRef = useRef(0)
  const onListPointerDown = (e) => {
    if (view !== 'canvases') return
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
  }, [browse, level]) // eslint-disable-line react-hooks/exhaustive-deps

  // A row picks on a clean tap only — press and release in place. A swipe
  // across the list or a scroll never picks the row it started or ended on.
  const tapProps = (key, run) => ({
    onMouseDown: e => e.preventDefault(),
    onPointerDown: e => { rowTapRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, key } },
    onPointerUp: e => {
      const t = rowTapRef.current
      rowTapRef.current = null
      if (!t || t.id !== e.pointerId || t.key !== key) return
      if (Math.abs(e.clientX - t.x) > 8 || Math.abs(e.clientY - t.y) > 8) return
      run()
    },
    onPointerCancel: () => { rowTapRef.current = null },
    onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run() } },
  })

  const openEasel = (id) => {
    slideDirRef.current = 1
    setLevel('canvases')
    setMenuOpen(false)
    onBrowse(id)
  }

  let rows
  if (view === 'results') {
    rows = results.length === 0 ? (
      <div className="dest-empty">No canvases</div>
    ) : results.map((r, i) => (
      <div key={r.key}>
        {i > 0 && <div className="save-to-divider"/>}
        <button
          type="button"
          className={`save-to-option no-radio dest-result${r.inbox ? ' dest-row-inbox' : ''}${i === 0 ? ' is-highlight' : ''}`}
          style={accentVars(r.inbox ? inboxAccent : r.accent, 'cb')}
          {...tapProps('r-' + r.key, () => pickResult(r))}
        >
          {r.inbox && <InboxIcon className="dest-row-icon" size={18} color={inboxAccent.dark} strokeWidth={dots ? 2 : 1}/>}
          <span className="cc-option-text">
            <span className="cc-option-name">{r.name}</span>
            {!!r.categoryName && <span className="cc-option-page" style={{ color: r.accent.base }}>{r.categoryName}</span>}
          </span>
        </button>
      </div>
    ))
  } else if (view === 'easels') {
    rows = (
      <>
        {onPickInbox && (
          <div>
            <button
              type="button"
              className="save-to-option no-radio dest-easel-row dest-row-inbox"
              {...tapProps('inbox', () => onPickInbox())}
            >
              <InboxIcon className="dest-row-icon" size={18} color={inboxAccent.dark} strokeWidth={dots ? 2 : 1}/>
              <span>Inbox</span>
            </button>
          </div>
        )}
        {categories.map((c, idx) => {
          const acc = getCategoryAccent(idx)
          return (
            <div key={c.id}>
              {(idx > 0 || onPickInbox) && <div className="save-to-divider"/>}
              <button
                type="button"
                className="save-to-option no-radio dest-easel-row"
                style={accentVars(acc, 'cb')}
                {...tapProps('e-' + c.id, () => openEasel(c.id))}
              >
                <EaselGlyph accent={acc} className="dest-row-icon"/>
                <span>{c.name}</span>
              </button>
            </div>
          )
        })}
      </>
    )
  } else {
    rows = (
      <>
        {projs.map((proj, i) => {
          const on = selected?.projectId === proj.id
          return (
            <div key={proj.id}>
              {i > 0 && <div className="save-to-divider"/>}
              <button
                type="button"
                className={`save-to-option no-radio dest-canvas-row${on ? ' is-current' : ''}`}
                {...tapProps('p-' + proj.id, () => onPick({ categoryId: browse, projectId: proj.id }))}
              >
                <EaselGlyph accent={accent} className="dest-row-icon"/>
                <span>{proj.name}</span>
              </button>
            </div>
          )
        })}
        <AddCanvasRow
          active={addCanvasActive}
          categoryId={browse}
          onCreated={pick => onPick(pick)}
          onDone={() => { if (open && isPhone()) inputRef.current?.focus({ preventScroll: true }); else onAddCanvasDone?.() }}
          openSignal={addSignal}
          hideTrigger
        />
      </>
    )
  }

  return (
    <>
      <div className={`dest-list-box dest-view-${view}`}>
        <div
          className="save-to-scroll dest-canvas-list"
          ref={listRef}
          onScroll={e => { e.currentTarget.classList.toggle('scrolled', e.currentTarget.scrollTop > 4); fadeFoot() }}
          onPointerDown={onListPointerDown}
          onPointerUp={onListPointerUp}
          onPointerCancel={() => { swipeRef.current = null }}
          style={{ ...accentVars(accent, 'cb'), touchAction: 'pan-y' }}
        >
          {rows}
        </div>

        {view === 'canvases' && (
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
                {onPickInbox && (
                  <div>
                    <button
                      className="card-context-item dest-inbox-item"
                      onMouseDown={e => { e.preventDefault(); setMenuOpen(false); onPickInbox() }}
                    >
                      <InboxIcon color={inboxAccent.dark} strokeWidth={2}/>
                      <span className="mbar-page-menu-label" style={{ color: inboxAccent.dark }}>Inbox</span>
                    </button>
                  </div>
                )}
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
        )}
      </div>

      {/* Search: the open search module's grey pill */}
      <div className="dest-search-bar">
        <div className="dest-search-field" ref={fieldRef}>
          <svg className="dest-search-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="8.75" cy="8.75" r="5.25" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="12.6" y1="12.6" x2="16.75" y2="16.75" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <input
            ref={inputRef}
            className="dest-search-input"
            placeholder="Search"
            value={query}
            onChange={e => { setQuery(e.target.value); setMenuOpen(false) }}
            onBlur={handleSearchBlur}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); if (searching) pickResult(results[0]) }
              else if (e.key === 'Escape') { e.preventDefault(); onEscape?.() }
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck="false"
            enterKeyHint="go"
          />
          {!!query && (
            <button
              type="button"
              className={`dest-search-clear${results.length ? ' with-send' : ''}`}
              aria-label="Clear search"
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => { e.preventDefault(); setQuery(''); inputRef.current?.focus({ preventScroll: true }) }}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <line x1="5" y1="5" x2="15" y2="15" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <line x1="15" y1="5" x2="5" y2="15" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
            </button>
          )}
          {/* Send: files to the highlighted (top) result, as Return does */}
          {searching && results.length > 0 && (
            <button
              type="button"
              className={`dest-search-send${results[0].inbox ? ' is-inbox' : ''}`}
              aria-label={`Send to ${results[0].name}`}
              style={accentVars(results[0].inbox ? inboxAccent : results[0].accent, 'cb')}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pickResult(results[0])}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M10 16 L10 4" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
                <path d="M4 9 L10 3 L16 9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </>
  )
}
