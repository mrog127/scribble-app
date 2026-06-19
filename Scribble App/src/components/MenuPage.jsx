import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react'
import { useAppContext } from '../context/AppContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import UnderlineSvg from '../assets/Underline.svg?react'
import { getCategoryAccent } from '../theme.js'

// Same FLIP drag-reorder animation as TodoCard/NoteCard, adapted for category rows.
// Trigger: immediate pointerdown on the drag handle (no long-press needed).
// DOM contract:
//   containerRef  →  the div whose .children are the per-category wrapper divs
//   wrapper div   →  direct child of container; keyed by cat.id; used for FLIP + shift transforms
//   [data-cat-id] →  the visible 52px row inside each wrapper; cloned for the floating ghost
function useCategoryDragReorder(containerRef, categories, onReorder) {
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
      const cloneInner = dragged.el.cloneNode(true)
      cloneInner.style.pointerEvents = 'none'
      cloneInner.style.background = '#F7F6F3'
      const clone = document.createElement('div')
      clone.style.cssText = [
        'position:absolute',
        `left:${dragged.rect.left - appRect.left - 4}px`,
        `top:${cloneTop}px`,
        `width:${dragged.rect.width + 8}px`,
        'padding:4px 0',
        'pointer-events:none',
        'box-shadow:0 4px 20px rgba(0,0,0,0.10)',
        'border-radius:8px',
        'border:1px solid #C2C1BF',
        'background:#F7F6F3',
        'overflow:hidden',
        'z-index:999',
      ].join(';')
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
      started = start(clientY)
      if (!started) return
      const s = dragRef.current
      if (s) {
        s.clone.style.transition = 'box-shadow 120ms ease'
        s.clone.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)'
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
        document.removeEventListener('touchmove', preventScroll)
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
        if (dec) dec.style.color = getCategoryAccent(newIdx).base
      }
    }

    const cleanupListeners = () => {
      document.removeEventListener('pointermove', onMove, { passive: false })
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('touchmove', preventScroll)
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
  }, [containerRef, onReorder])

  return { onDragPointerDown }
}

export default function MenuPage({ pageAnimClass = '', isExiting = false, onSelectTab }) {
  const { categories, reorderCategories, renameCategory, deleteCategory, addCategory, toggleCategoryHomescreen } = useAppContext()
  const { user, signOut } = useAuth()

  const containerRef = useRef(null)
  const { onDragPointerDown } = useCategoryDragReorder(containerRef, categories, reorderCategories)

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
    <div className={`page active${pageAnimClass ? ` ${pageAnimClass}` : ''}`} id={isExiting ? undefined : 'page-menu'}>
      <div className="page-header">
        <p className="active-title">Menu</p>
      </div>

      <div style={{ padding: '16px 12px', overflowY: 'auto' }}>

        {/* Categories list card */}
        <div
          style={{
            background: '#F7F6F3',
            border: '1px solid #C2C1BF',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
          }}
        >
          {/* Header row — project-card header styling */}
          <div className="card-header">
            <span className="card-title">Tabs</span>
            <button
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
                <div style={{ height: 1, background: '#DBDAD8', marginLeft: 16, marginRight: 16 }} />
              )}
              {/* [data-cat-id] row: press-and-hold anywhere to reorder; also the clone source */}
              <div
                data-cat-id={cat.id}
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
                    style={{
                      flex: 1, border: 'none', background: 'transparent', outline: 'none', padding: 0,
                      fontFamily: "'Open Sans', sans-serif",
                      fontSize: 16, fontWeight: 400, color: '#333333',
                    }}
                  />
                ) : (
                  <span style={{
                    flex: 1,
                    fontFamily: "'Open Sans', sans-serif",
                    fontSize: 16, fontWeight: 400, color: '#333333',
                  }}>
                    {cat.name}
                  </span>
                )}

                {/* No-homescreen indicator — shows when this category is excluded from the homescreen */}
                {cat.sendToHomescreen === false && (
                  <div style={{ flexShrink: 0, marginRight: 16, display: 'flex', alignItems: 'center' }}>
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
                            <span style={{
                              width: 20, height: 20, flexShrink: 0,
                              borderRadius: 2, border: `1px solid ${sendOn ? '#000000' : '#B8B8B8'}`,
                              background: sendOn ? '#737373' : '#FAF9F7',
                              boxShadow: sendOn ? 'none' : '0 3px 0px rgba(0,0,0,0.1)',
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
                        onClick={() => { deleteCategory(cat.id); setOpenMenuId(null) }}
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

          {/* Add category inline input row */}
          {isAdding && (
            <div>
              {categories.length > 0 && (
                <div style={{ height: 1, background: '#DBDAD8', marginLeft: 16, marginRight: 16 }} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', height: 52, paddingLeft: 16 }}>
                <input
                  autoFocus
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

        {/* Account section */}
        <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{
            fontFamily: "'Open Sans', system-ui, sans-serif",
            fontSize: 14, fontWeight: 500, color: '#959493', margin: 0,
          }}>
            {user?.email}
          </p>
          <button
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
