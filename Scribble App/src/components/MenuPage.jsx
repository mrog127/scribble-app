import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react'
import { lockRowDrag, unlockRowDrag } from '../rowDragLock.js'
import { useAppContext } from '../context/AppContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import UnderlineSvg from '../assets/Underline.svg?react'
import { getCategoryAccent, ACCENT_COLORS, getHomeAccent } from '../theme.js'
import { getMorningSummaryState, enableMorningSummary, disableMorningSummary, sendTestSummary, isIOS, lastPushError } from '../push.js'
import { THEMES, getTheme, setTheme, themeName } from '../themes.js'
import { dragLiftShadow, makeGlassStroke } from '../dragClone.js'

// Same FLIP drag-reorder animation as TodoCard/NoteCard, adapted for category rows.
// Trigger: immediate pointerdown on the drag handle (no long-press needed).
// DOM contract:
//   containerRef  →  the div whose .children are the per-category wrapper divs
//   wrapper div   →  direct child of container; keyed by cat.id; used for FLIP + shift transforms
//   [data-cat-id] →  the visible 52px row inside each wrapper; cloned for the floating ghost
// Exported so the mobile page menu can reorder the same list the same way.
// opts.ghostClass: in Dark Dots, the floating copy takes this class and the
// same clear-glass skin as a row dragged out of a canvas card.
export function useCategoryDragReorder(containerRef, categories, onReorder, opts = {}) {
  const ghostClass = opts.ghostClass
  const ghostPill = !!opts.pill
  // opts.ghostInset: { left, right, edge } — a pill whose left edge sits `left`
  // px in from the row and whose right edge sits `right` px in from the
  // element matching `edge` (the Easels menu), matching the row's highlight
  const ghostInset = opts.ghostInset || null
  const dragRef = useRef(null)
  const flipRef = useRef(null)
  const catsRef = useRef(categories)
  catsRef.current = categories

  // Fires after React commits the reordered DOM — runs FLIP animation
  useLayoutEffect(() => {
    const flip = flipRef.current
    if (!flip) return
    flipRef.current = null

    // Clear any in-flight transforms before measuring new positions
    flip.forEach(({ el }) => {
      el.style.transition = 'none'
      el.style.transform = ''
      el.style.opacity = ''
    })
    document.body.offsetHeight // force reflow

    // Compute delta: where each element was (fromTop) vs where it landed (new DOM position)
    const frames = flip
      .map(({ el, fromTop }) => ({ el, dy: fromTop - el.getBoundingClientRect().top }))
      .filter(f => Math.abs(f.dy) > 1)
    if (!frames.length) return

    // Apply inverted transforms (puts elements back to visual start position)
    frames.forEach(({ el, dy }) => {
      el.style.transition = 'none'
      el.style.transform = `translateY(${dy}px)`
    })
    document.body.offsetHeight // force reflow

    // Animate to natural position
    requestAnimationFrame(() => {
      frames.forEach(({ el }) => {
        el.style.transition = 'transform 250ms ease'
        el.style.transform = ''
      })
      setTimeout(() => frames.forEach(({ el }) => { el.style.transition = '' }), 250)
    })
  }, [categories])

  // Press-and-hold anywhere on a row to start reordering (matches the card list rows).
  const onDragPointerDown = useCallback((e, catId) => {
    // Ignore the three-dot menu, its dropdown, and the rename input
    if (e.target.closest('.cat-menu-btn') || e.target.closest('.cat-menu-dropdown') || e.target.closest('input')) return
    const startX = e.clientX, startY = e.clientY
    let started = false, longPressTimer = null
    const preventScroll = (ev) => { if (started) ev.preventDefault() }

    const start = (clientY) => {
      const container = containerRef.current
      if (!container) return false
      const snapshots = [...container.children].map(w => {
        const row = w.querySelector('[data-cat-id]')
        return row ? { el: row, wrapper: w, id: row.dataset.catId, rect: row.getBoundingClientRect() } : null
      }).filter(Boolean)
      const dragIdx = snapshots.findIndex(s => s.id === catId)
      if (dragIdx < 0) return false
      const dragged = snapshots[dragIdx]
      const appEl = document.getElementById('app')
      const portal = document.getElementById('animation-portal')
      if (!appEl || !portal) return false
      const appRect = appEl.getBoundingClientRect()
      const cloneTop = dragged.rect.top - appRect.top - 4

      // Build floating ghost clone
      const darkGhost = !!ghostClass && ['dark-dots', 'light-dots'].includes(document.documentElement.dataset.theme)
      const cloneInner = dragged.el.cloneNode(true)
      cloneInner.style.pointerEvents = 'none'
      cloneInner.style.background = darkGhost ? 'transparent' : '#F7F6F3'
      // Settings in the Dots themes: a pill set 8px in from the card's edges,
      // with the row's content held where it was
      const pill = darkGhost && (ghostPill || !!ghostInset)
      let insetL = 8, cloneW = dragged.rect.width - 16
      if (darkGhost && ghostInset) {
        const edge = dragged.el.closest(ghostInset.edge)?.getBoundingClientRect()
        insetL = ghostInset.left
        const rightEdge = (edge ? edge.right : dragged.rect.right) - ghostInset.right
        cloneW = rightEdge - (dragged.rect.left + insetL)
      }
      if (pill) { cloneInner.style.marginLeft = -insetL + 'px'; cloneInner.style.boxSizing = 'border-box'; cloneInner.style.width = dragged.rect.width + 'px' }
      const clone = document.createElement('div')
      if (darkGhost) clone.className = ghostClass
      const skin = darkGhost
        ? ['background:var(--glass-fill)', 'border:none',
           `box-shadow:${dragLiftShadow().replace('0 10px 32px rgba(0,0,0,0.3)', '0 6px 24px rgba(0,0,0,0.2)')}`, `border-radius:${pill ? '999px' : '16px'}`,
           '-webkit-backdrop-filter:blur(10px) saturate(180%)', 'backdrop-filter:blur(10px) saturate(180%)']
        : ['box-shadow:0 4px 20px rgba(0,0,0,0.10)', 'border-radius:8px',
           'border:1px solid #C2C1BF', 'background:#F7F6F3']
      clone.style.cssText = [
        'position:absolute',
        `left:${dragged.rect.left - appRect.left + (pill ? insetL : -4)}px`,
        `top:${cloneTop}px`,
        `width:${pill ? cloneW : dragged.rect.width + 8}px`,
        'padding:4px 0',
        'pointer-events:none',
        ...skin,
        'overflow:hidden',
        'z-index:999',
      ].join(';')
      if (darkGhost) {
        const stroke = makeGlassStroke()
        if (pill) stroke.style.borderRadius = '999px'
        clone.appendChild(stroke)
      }
      clone.appendChild(cloneInner)
      portal.appendChild(clone)
      dragged.wrapper.style.opacity = '0'

      const topBound = snapshots[0].rect.top - appRect.top
      const lastSnap = snapshots[snapshots.length - 1]
      const bottomBound =
        (lastSnap.rect.top + lastSnap.rect.height) - appRect.top
        - dragged.wrapper.getBoundingClientRect().height

      dragRef.current = {
        clone, snapshots, dragIdx, currentIdx: dragIdx, cloneTop,
        startY: clientY, draggedH: dragged.wrapper.getBoundingClientRect().height,
        topBound, bottomBound,
      }
      return true
    }

    const doStart = (clientY) => {
      if (started) return
      started = start(clientY); if (started) lockRowDrag()
      if (!started) return
      const s = dragRef.current
      if (s) {
        s.clone.style.transition = 'box-shadow 120ms ease'
        s.clone.style.boxShadow = s.clone.className ? dragLiftShadow() : '0 8px 24px rgba(0,0,0,0.18)'
        setTimeout(() => { if (dragRef.current === s) s.clone.style.transition = '' }, 120)
      }
    }

    longPressTimer = setTimeout(() => { longPressTimer = null; doStart(startY) }, 250)
    document.addEventListener('touchmove', preventScroll, { passive: false })

    const applyShifts = (newIdx) => {
      const s = dragRef.current
      if (!s) return
      s.snapshots.forEach((snap, i) => {
        if (i === s.dragIdx) return
        let dy = 0
        if (newIdx < s.dragIdx && i >= newIdx && i < s.dragIdx) dy = s.draggedH
        if (newIdx > s.dragIdx && i > s.dragIdx && i <= newIdx) dy = -s.draggedH
        snap.wrapper.style.transition = 'transform 180ms ease'
        snap.wrapper.style.transform = dy ? `translateY(${dy}px)` : ''
      })
    }

    const onMove = (moveE) => {
      const dx = Math.abs(moveE.clientX - startX), dy = Math.abs(moveE.clientY - startY)
      if (longPressTimer && (dx > 8 || dy > 8)) {
        clearTimeout(longPressTimer); longPressTimer = null
        document.removeEventListener('touchmove', preventScroll); unlockRowDrag()
      }
      if (!started) return
      moveE.preventDefault()
      const s = dragRef.current
      if (!s) return
      const rawTop = s.cloneTop + (moveE.clientY - s.startY)
      s.clone.style.top = Math.max(s.topBound, Math.min(s.bottomBound, rawTop)) + 'px'

      const nonDragged = s.snapshots.filter((_, i) => i !== s.dragIdx)
      let insertAt = nonDragged.length
      for (let j = 0; j < nonDragged.length; j++) {
        if (moveE.clientY < nonDragged[j].rect.top + nonDragged[j].rect.height / 2) { insertAt = j; break }
      }
      const newIdx = Math.min(insertAt, s.snapshots.length - 1)
      if (newIdx !== s.currentIdx) {
        s.currentIdx = newIdx
        applyShifts(newIdx)
        // Recolor the floating decoration to match the accent of its new position
        const dec = s.clone.querySelector('.cat-row-decoration')
        if (dec) {
          const acc = getCategoryAccent(newIdx)
          dec.style.color = acc.base
          dec.style.setProperty('--row-dot', acc.dot ?? acc.base)
        }
      }
    }

    const cleanupListeners = () => {
      document.removeEventListener('pointermove', onMove, { passive: false })
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('touchmove', preventScroll); unlockRowDrag()
    }

    const onCancel = () => {
      clearTimeout(longPressTimer); longPressTimer = null
      cleanupListeners()
      const s = dragRef.current
      if (!s) return
      dragRef.current = null
      s.clone.remove()
      s.snapshots.forEach(snap => { snap.wrapper.style.transition = ''; snap.wrapper.style.transform = ''; snap.wrapper.style.opacity = '' })
    }

    const onUp = () => {
      clearTimeout(longPressTimer); longPressTimer = null
      cleanupListeners()
      const s = dragRef.current
      if (!s || !started) return
      dragRef.current = null

      if (s.currentIdx === s.dragIdx) {
        s.clone.remove()
        s.snapshots.forEach(snap => { snap.wrapper.style.transition = ''; snap.wrapper.style.transform = ''; snap.wrapper.style.opacity = '' })
        return
      }

      const cloneReleaseTop = s.clone.getBoundingClientRect().top
      const fromTops = s.snapshots.map((snap, i) =>
        i === s.dragIdx ? cloneReleaseTop : snap.wrapper.getBoundingClientRect().top
      )
      s.clone.remove()

      const ids = s.snapshots.map(sn => sn.id)
      const [movedId] = ids.splice(s.dragIdx, 1)
      ids.splice(s.currentIdx, 0, movedId)
      const allCats = catsRef.current
      const newOrder = ids.map(id => allCats.find(c => c.id === id)).filter(Boolean)

      flipRef.current = s.snapshots.map((snap, i) => ({ el: snap.wrapper, fromTop: fromTops[i] }))
      onReorder(newOrder)
    }

    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
  }, [containerRef, onReorder, ghostClass])

  return { onDragPointerDown }
}

// Theme picker. Saved per device; the id lands on <html data-theme="…">.
function ThemesCard() {
  const [theme, setThemeState] = useState(getTheme)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (!e.target.closest('.theme-menu-btn') && !e.target.closest('.cat-menu-dropdown')) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  const pick = (id) => { setTheme(id); setThemeState(id); setOpen(false) }

  return (
    <div
      className="settings-card"
      style={{
        marginTop: 16,
        background: '#F7F6F3',
        border: '1px solid #C2C1BF',
        borderRadius: 16,
        boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
      }}
    >
      <div className="card-header">
        <span className="card-title">Themes</span>
      </div>
      <div style={{ position: 'relative', padding: '4px 16px 14px' }}>
        <button
          className="theme-menu-btn"
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', height: 48, padding: '0 14px', cursor: 'pointer',
            background: 'none', border: '1.5px solid #C2C1BF', borderRadius: 8,
            fontFamily: "'Open Sans', sans-serif", fontSize: 16, fontWeight: 400, color: '#242424',
          }}
        >
          {themeName(theme)}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}>
            <path d="M5 8 L10 13 L15 8" stroke="#242424" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <div
            className="cat-menu-dropdown"
            style={{
              position: 'absolute', left: 16, right: 16, top: 'calc(100% - 10px)', zIndex: 200,
              background: '#F7F6F3', border: '1px solid #C2C1BF', borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)', overflow: 'hidden',
            }}
          >
            {THEMES.map((t, i) => (
              <button
                key={t.id}
                className="settings-dd-item"
                onClick={() => pick(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '12px 16px', background: 'none', border: 'none',
                  borderBottom: i < THEMES.length - 1 ? '1px solid #DBDAD8' : 'none',
                  textAlign: 'left', cursor: 'pointer',
                  fontFamily: "'Open Sans', sans-serif", fontSize: 16,
                  fontWeight: t.id === theme ? 600 : 400, color: '#242424',
                }}
              >
                {t.name}
                {t.id === theme && (
                  <svg className="settings-dd-tick" width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path d="M4 10.5 L8 14.5 L16 6" stroke="var(--accent-dark)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Settings card for the 9:30am push summarizing the Gallery's active list items.
function NotificationsCard() {
  const [state, setState] = useState(null)   // null while loading
  const [busy, setBusy] = useState(false)
  const [testNote, setTestNote] = useState('')
  const [failNote, setFailNote] = useState('')   // why turning it on just failed

  // Re-read whenever the app comes back to the front — permission can be changed
  // in the phone's / browser's settings while Scribble is in the background.
  useEffect(() => {
    let alive = true
    const check = () => getMorningSummaryState().then(s => { if (alive) setState(s) }).catch(() => { if (alive) setState('unsupported') })
    check()
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', check)
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', check) }
  }, [])

  const on = state === 'on'
  // 'denied' stays tappable: it asks again (and re-reads the permission), since
  // the saved state can lag behind a change made in Settings.
  const canToggle = state === 'on' || state === 'off' || state === 'denied'

  const toggle = async () => {
    if (!canToggle || busy) return
    setBusy(true)
    setFailNote('')
    try {
      const next = on ? await disableMorningSummary() : await enableMorningSummary()
      setState(next)
      if (!on && next !== 'on') setFailNote(lastPushError || 'Couldn\u2019t turn on')
    }
    catch (e) { console.warn('[push]', e); setFailNote(e?.message || 'Couldn\u2019t turn on') }
    setBusy(false)
  }

  const test = async () => {
    setTestNote('Sending…')
    const r = await sendTestSummary().catch(e => ({ ok: false, sent: 0, error: e?.message || '' }))
    setTestNote(!r.ok
      ? `Couldn\u2019t send${r.error ? ': ' + r.error : ''}`
      : r.sent ? `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}` : 'Server ran, but no device accepted it')
    setTimeout(() => setTestNote(''), 6000)
  }

  const sublabel = {
    'needs-install': 'Add Easels to your Home Screen to turn this on',
    denied: isIOS()
      ? 'Notifications are turned off for Easels in iPhone Settings'
      : 'Notifications are blocked for this site in your browser settings',
    unsupported: 'Not available in this browser',
  }[state] || '9:30am \u00b7 your active list items'
  const shownSub = failNote || sublabel

  return (
    <div
      className="settings-card"
      style={{
        marginTop: 16,
        background: '#F7F6F3',
        border: '1px solid #C2C1BF',
        borderRadius: 16,
        boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
      }}
    >
      <div className="card-header">
        <span className="card-title">Notifications</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 16px 14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="settings-notif-label" style={{ margin: 0, fontFamily: "'Open Sans', sans-serif", fontSize: 16, fontWeight: 400, color: '#242424' }}>
            Morning summary
          </p>
          <p className="settings-notif-sub" style={{ margin: '2px 0 0', fontFamily: "'Open Sans', sans-serif", fontSize: 14, fontWeight: 400, color: '#959493' }}>
            {shownSub}
          </p>
          {on && (
            <button
              className="settings-test-btn"
              onClick={test}
              style={{
                marginTop: 8, padding: 0, background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: "'Open Sans', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--accent-dark)',
              }}
            >
              {testNote || 'Send a test'}
            </button>
          )}
        </div>
        <button
          role="switch"
          className={`settings-switch${on ? ' on' : ''}`}
          aria-checked={on}
          aria-label="Morning summary"
          disabled={!canToggle || busy}
          onClick={toggle}
          style={{
            position: 'relative', flexShrink: 0, width: 48, height: 28, padding: 0,
            borderRadius: 14, border: 'none', cursor: canToggle ? 'pointer' : 'default',
            background: on ? 'var(--accent-base)' : '#DBDAD8',
            opacity: canToggle ? 1 : 0.5,
            transition: 'background 200ms ease',
          }}
        >
          <span
            className="settings-switch-knob"
            style={{
              position: 'absolute', top: 3, left: 3, width: 22, height: 22, borderRadius: '50%',
              background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              transform: on ? 'translateX(20px)' : 'translateX(0)',
              transition: 'transform 200ms ease',
            }}
          />
        </button>
      </div>
    </div>
  )
}

export default function MenuPage({ pageAnimClass = '', isExiting = false, onSelectTab, onClose }) {
  const {
    categories, archivedCategories, archiveCategory, unarchiveCategory,
    reorderCategories, renameCategory, deleteCategory, addCategory,
    toggleCategoryHomescreen, promptDelete,
  } = useAppContext()
  const [showArchivedCats, setShowArchivedCats] = useState(false)
  const { user, signOut } = useAuth()

  const containerRef = useRef(null)
  const { onDragPointerDown } = useCategoryDragReorder(containerRef, categories, reorderCategories, { ghostClass: 'settings-drag-ghost', pill: true })

  // Quick tap (no movement, released before the 250ms long-press) navigates to that tab
  const rowTapState = useRef({})
  const onRowPointerDown = useCallback((e, catId) => {
    if (e.target.closest('.cat-menu-btn') || e.target.closest('.cat-menu-dropdown') || e.target.closest('input')) return
    rowTapState.current = { startX: e.clientX, startY: e.clientY, startTime: Date.now(), moved: false }
    const onMove = (e2) => {
      const s = rowTapState.current
      if (Math.abs(e2.clientX - s.startX) > 8 || Math.abs(e2.clientY - s.startY) > 8) s.moved = true
    }
    const onUp = () => {
      cleanup()
      const s = rowTapState.current
      if (!s.moved && Date.now() - s.startTime < 250) onSelectTab?.(catId)
    }
    const cleanup = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [onSelectTab])

  const [openMenuId, setOpenMenuId] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [addValue, setAddValue] = useState('')

  // Close dropdown on outside click
  useEffect(() => {
    if (!openMenuId) return
    const handler = (e) => {
      if (!e.target.closest('.cat-menu-btn') && !e.target.closest('.cat-menu-dropdown')) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [openMenuId])

  const handleRenameSubmit = (id) => {
    const trimmed = renameValue.trim()
    if (trimmed) renameCategory(id, trimmed)
    setRenamingId(null)
    setRenameValue('')
  }

  const handleAddSubmit = () => {
    const trimmed = addValue.trim()
    if (trimmed) addCategory(trimmed)
    setIsAdding(false)
    setAddValue('')
  }

  return (
    <div
      className={`page active${pageAnimClass ? ` ${pageAnimClass}` : ''}`}
      id={isExiting ? undefined : 'page-menu'}
      style={{ '--accent-base': getHomeAccent().base, '--accent-dark': getHomeAccent().dark, '--accent-light': getHomeAccent().light, '--accent-base-rgb': getHomeAccent().baseRgb }}
    >
      <div className="page-header">
        <div className="settings-header-row">
          <p className="active-title">Settings</p>
          {/* Only present when Settings is shown as a sheet (mobile) */}
          {onClose && (
            <button className="settings-close-btn" aria-label="Close settings" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <line x1="4.5" y1="4.5" x2="15.5" y2="15.5" stroke="#242424" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <line x1="15.5" y1="4.5" x2="4.5" y2="15.5" stroke="#242424" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="settings-body" style={{ padding: '16px 12px', overflowY: 'auto' }}>

        {/* Categories list card */}
        <div
          className="settings-card"
          style={{
            background: '#F7F6F3',
            border: '1px solid #C2C1BF',
            borderRadius: 16,
            boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
          }}
        >
          {/* Header row — project-card header styling */}
          <div className="card-header">
            <span className="card-title">Easels</span>
            <button
              className="settings-add-tab"
              onClick={() => { setIsAdding(true); setOpenMenuId(null) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, padding: 0,
                fontFamily: "'Open Sans', sans-serif",
                fontSize: 16, fontWeight: 400, color: '#242424',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <line x1="10" y1="4" x2="10" y2="16" stroke="#242424" strokeWidth="1" strokeLinecap="round"/>
                <line x1="4" y1="10" x2="16" y2="10" stroke="#242424" strokeWidth="1" strokeLinecap="round"/>
              </svg>
              Add Tab
            </button>
          </div>

          {/* containerRef children are the per-category wrappers */}
          <div ref={containerRef}>
          {categories.map((cat, index) => (
            // wrapper div: keyed by cat.id, used for FLIP transforms + opacity fade during drag
            <div key={cat.id}>
              {index > 0 && (
                <div className="settings-divider" style={{ height: 1, background: '#DBDAD8', marginLeft: 16, marginRight: 16 }} />
              )}
              {/* [data-cat-id] row: press-and-hold anywhere to reorder; also the clone source */}
              <div
                data-cat-id={cat.id}
                className="settings-tab-row"
                onPointerDown={e => { onDragPointerDown(e, cat.id); onRowPointerDown(e, cat.id) }}
                style={{ display: 'flex', alignItems: 'center', height: 52, paddingLeft: 16 }}
              >
                {/* Tab decoration: underline rotated 90°, row-height, colored by this tab's accent */}
                <span
                  className="cat-row-decoration"
                  style={{
                    flexShrink: 0, width: 14, height: 52, marginRight: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: getCategoryAccent(index).base,
                    '--row-dot': getCategoryAccent(index).dot ?? getCategoryAccent(index).base,
                    transition: 'color 200ms ease',
                  }}
                >
                  <UnderlineSvg style={{ flexShrink: 0, width: 28, height: 'auto', transform: 'rotate(270deg)', display: 'block' }} />
                </span>

                {/* Name or rename input */}
                {renamingId === cat.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRenameSubmit(cat.id)
                      if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') }
                    }}
                    onBlur={() => handleRenameSubmit(cat.id)}
                    className="settings-tab-name"
                    style={{
                      flex: 1, border: 'none', background: 'transparent', outline: 'none', padding: 0,
                      fontFamily: "'Open Sans', sans-serif",
                      fontSize: 16, fontWeight: 400, color: '#333333',
                    }}
                  />
                ) : (
                  <span className="settings-tab-name" style={{
                    flex: 1,
                    fontFamily: "'Open Sans', sans-serif",
                    fontSize: 16, fontWeight: 400, color: '#333333',
                  }}>
                    {cat.name}
                  </span>
                )}

                {/* No-homescreen indicator — shows when this category is excluded from the homescreen */}
                {cat.sendToHomescreen === false && (
                  <div className="settings-nohome" style={{ flexShrink: 0, marginRight: 16, display: 'flex', alignItems: 'center' }}>
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                      <circle cx="11" cy="11" r="9" stroke="#959493" strokeWidth="1"/>
                      <line x1="4.64" y1="4.64" x2="17.36" y2="17.36" stroke="#959493" strokeWidth="1" strokeLinecap="round"/>
                    </svg>
                  </div>
                )}

                {/* Three-dot menu */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    className="cat-menu-btn"
                    onClick={() => setOpenMenuId(openMenuId === cat.id ? null : cat.id)}
                    style={{
                      width: 44, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'none', border: 'none', cursor: 'pointer',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <circle cx="9" cy="4" r="1.5" fill="#242424"/>
                      <circle cx="9" cy="9" r="1.5" fill="#242424"/>
                      <circle cx="9" cy="14" r="1.5" fill="#242424"/>
                    </svg>
                  </button>

                  {openMenuId === cat.id && (
                    <div
                      className="cat-menu-dropdown"
                      style={{
                        position: 'absolute', right: 8, top: '100%', zIndex: 200,
                        background: '#F7F6F3', border: '1px solid #C2C1BF', borderRadius: 8,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 140, overflow: 'hidden',
                      }}
                    >
                      {(() => {
                        const sendOn = cat.sendToHomescreen !== false
                        return (
                          <button
                            className="settings-dd-item"
                            onClick={() => toggleCategoryHomescreen(cat.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 16,
                              width: '100%', padding: '12px 16px',
                              background: 'none', border: 'none', borderBottom: '1px solid #DBDAD8',
                              textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap',
                              fontFamily: "'Open Sans', sans-serif",
                              fontSize: 16, fontWeight: 400, color: '#242424',
                            }}
                          >
                            Send to homescreen
                            <span className={`settings-dd-check${sendOn ? ' on' : ''}`} style={{
                              width: 20, height: 20, flexShrink: 0,
                              borderRadius: 2, border: `1px solid ${sendOn ? '#000000' : '#B8B8B8'}`,
                              background: sendOn ? '#737373' : '#FAF9F7',
                              boxShadow: sendOn ? 'none' : '0 3px 20px rgba(0,0,0,0.1)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {sendOn && (
                                <svg width="16" height="16" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </span>
                          </button>
                        )
                      })()}
                      <button
                        className="settings-dd-item"
                        onClick={() => {
                          setRenamingId(cat.id)
                          setRenameValue(cat.name)
                          setOpenMenuId(null)
                        }}
                        style={{
                          display: 'block', width: '100%', padding: '12px 16px',
                          background: 'none', border: 'none', borderBottom: '1px solid #DBDAD8',
                          textAlign: 'left', cursor: 'pointer',
                          fontFamily: "'Open Sans', sans-serif",
                          fontSize: 16, fontWeight: 400, color: '#242424',
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="settings-dd-item"
                        onClick={() => { setOpenMenuId(null); archiveCategory(cat.id) }}
                        style={{
                          display: 'block', width: '100%', padding: '12px 16px',
                          background: 'none', border: 'none', borderBottom: '1px solid #DBDAD8',
                          textAlign: 'left', cursor: 'pointer',
                          fontFamily: "'Open Sans', sans-serif",
                          fontSize: 16, fontWeight: 400, color: '#242424',
                        }}
                      >
                        Archive
                      </button>
                      <button
                        className="settings-dd-item danger"
                        onClick={() => {
                          setOpenMenuId(null)
                          promptDelete(() => {
                            const row = document.querySelector(`#page-menu [data-cat-id="${cat.id}"]`)
                            const wrapper = row?.parentElement
                            if (!wrapper) { deleteCategory(cat.id); return }
                            wrapper.animate([{ background: 'rgba(178,74,74,0)' }, { background: 'rgba(178,74,74,0.20)', offset: 0.4 }, { background: 'rgba(178,74,74,0)' }], { duration: 280, fill: 'none' })
                            setTimeout(() => {
                              const height = wrapper.getBoundingClientRect().height
                              wrapper.style.height = height + 'px'; wrapper.style.overflow = 'hidden'
                              requestAnimationFrame(() => requestAnimationFrame(() => { wrapper.style.transition = 'height 220ms ease, opacity 180ms ease'; wrapper.style.height = '0'; wrapper.style.opacity = '0' }))
                              setTimeout(() => deleteCategory(cat.id), 250)
                            }, 180)
                          })
                        }}
                        style={{
                          display: 'block', width: '100%', padding: '12px 16px',
                          background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer',
                          fontFamily: "'Open Sans', sans-serif",
                          fontSize: 16, fontWeight: 400, color: '#B24A4A',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          </div>

          {/* ---- Archived easels ---- */}
          {archivedCategories.length > 0 && (
            <div className="settings-archived-group">
              <div className="settings-archived-head">
                <span className="settings-archived-label">Archived</span>
                <button
                  className="settings-archived-toggle"
                  onClick={() => setShowArchivedCats(v => !v)}
                >
                  {showArchivedCats ? 'Hide' : 'Show'}
                </button>
              </div>
              {showArchivedCats && archivedCategories.map((cat, i) => (
                <div key={cat.id}>
                  {i > 0 && <div className="settings-divider" style={{ height: 1, background: '#DBDAD8', marginLeft: 16, marginRight: 16 }} />}
                  <div className="settings-archived-row">
                    <span className="settings-archived-name">{cat.name}</span>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <button
                        className="cat-menu-btn"
                        onClick={() => setOpenMenuId(openMenuId === `arch-${cat.id}` ? null : `arch-${cat.id}`)}
                        /* Same box as the active rows' menu so the dots line up */
                        style={{
                          width: 44, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'none', border: 'none', cursor: 'pointer',
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                          <circle cx="9" cy="4" r="1.5" fill="#242424"/>
                          <circle cx="9" cy="9" r="1.5" fill="#242424"/>
                          <circle cx="9" cy="14" r="1.5" fill="#242424"/>
                        </svg>
                      </button>
                      {openMenuId === `arch-${cat.id}` && (
                        <div
                          className="cat-menu-dropdown"
                          style={{
                            position: 'absolute', right: 8, top: '100%', zIndex: 200,
                            background: '#F7F6F3', border: '1px solid #C2C1BF', borderRadius: 8,
                            boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 140, overflow: 'hidden',
                          }}
                        >
                          <button
                            className="settings-dd-item"
                            onClick={() => { setOpenMenuId(null); unarchiveCategory(cat.id) }}
                            style={{
                              display: 'block', width: '100%', padding: '12px 16px',
                              background: 'none', border: 'none', borderBottom: '1px solid #DBDAD8',
                              textAlign: 'left', cursor: 'pointer',
                              fontFamily: "'Open Sans', sans-serif",
                              fontSize: 16, fontWeight: 400, color: '#242424',
                            }}
                          >
                            Unarchive
                          </button>
                          <button
                            className="settings-dd-item danger"
                            onClick={() => {
                              setOpenMenuId(null)
                              promptDelete(() => deleteCategory(cat.id))
                            }}
                            style={{
                              display: 'block', width: '100%', padding: '12px 16px',
                              background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer',
                              fontFamily: "'Open Sans', sans-serif",
                              fontSize: 16, fontWeight: 400, color: '#B24A4A',
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add category inline input row */}
          {isAdding && (
            <div>
              {categories.length > 0 && (
                <div className="settings-divider" style={{ height: 1, background: '#DBDAD8', marginLeft: 16, marginRight: 16 }} />
              )}
              <div className="settings-tab-row" style={{ display: 'flex', alignItems: 'center', height: 52, paddingLeft: 16 }}>
                <input
                  autoFocus
                  className="settings-tab-name"
                  placeholder="Category name..."
                  value={addValue}
                  onChange={e => setAddValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddSubmit()
                    if (e.key === 'Escape') { setIsAdding(false); setAddValue('') }
                  }}
                  onBlur={handleAddSubmit}
                  style={{
                    flex: 1, border: 'none', background: 'transparent', outline: 'none', padding: 0,
                    fontFamily: "'Open Sans', sans-serif",
                    fontSize: 16, fontWeight: 400, color: '#333333',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <ThemesCard />

        <NotificationsCard />

        {/* Account section */}
        <div className="settings-account" style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="settings-email" style={{
            fontFamily: "'Open Sans', system-ui, sans-serif",
            fontSize: 14, fontWeight: 500, color: '#959493', margin: 0,
          }}>
            {/* Account icon — shown in the Dots themes only (see layout.css) */}
            <svg className="settings-email-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {user?.email}
          </p>
          <button
            className="settings-logout"
            onClick={signOut}
            style={{
              height: 48, borderRadius: 8, background: 'none',
              border: '1.5px solid #C2C1BF', cursor: 'pointer',
              textAlign: 'left', padding: '0 16px',
              fontFamily: "'Open Sans', system-ui, sans-serif",
              fontSize: 16, fontWeight: 500, color: '#B24A4A',
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
