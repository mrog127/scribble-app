import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react'
import { useAppContext } from '../context/AppContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'

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

  const onDragPointerDown = useCallback((e, catId) => {
    e.preventDefault()
    e.stopPropagation()

    const container = containerRef.current
    if (!container) return

    // Snapshot all category wrappers and their row rects
    const wrappers = [...container.children]
    const snapshots = wrappers.map(w => {
      const row = w.querySelector('[data-cat-id]')
      return row ? { el: row, wrapper: w, id: row.dataset.catId, rect: row.getBoundingClientRect() } : null
    }).filter(Boolean)

    const dragIdx = snapshots.findIndex(s => s.id === catId)
    if (dragIdx < 0) return

    const dragged = snapshots[dragIdx]
    const appEl = document.getElementById('app')
    const portal = document.getElementById('animation-portal')
    if (!appEl || !portal) return

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

    // Fade out original row so the ghost appears to be the dragged item
    dragged.wrapper.style.opacity = '0'

    // Clamp bounds so clone can't leave the list area
    const topBound = snapshots[0].rect.top - appRect.top
    const lastSnap = snapshots[snapshots.length - 1]
    const bottomBound =
      (lastSnap.rect.top + lastSnap.rect.height) - appRect.top
      - dragged.wrapper.getBoundingClientRect().height

    // Lift shadow to signal drag has started
    clone.style.transition = 'box-shadow 120ms ease'
    clone.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)'
    setTimeout(() => { if (dragRef.current) dragRef.current.clone.style.transition = '' }, 120)

    dragRef.current = {
      clone, snapshots, dragIdx,
      currentIdx: dragIdx,
      cloneTop,
      startY: e.clientY,
      draggedH: dragged.wrapper.getBoundingClientRect().height,
      topBound, bottomBound,
    }

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
      const s = dragRef.current
      if (!s) return
      const rawTop = s.cloneTop + (moveE.clientY - s.startY)
      s.clone.style.top = Math.max(s.topBound, Math.min(s.bottomBound, rawTop)) + 'px'

      const nonDragged = s.snapshots.filter((_, i) => i !== s.dragIdx)
      let insertAt = nonDragged.length
      for (let j = 0; j < nonDragged.length; j++) {
        if (moveE.clientY < nonDragged[j].rect.top + nonDragged[j].rect.height / 2) {
          insertAt = j
          break
        }
      }
      const newIdx = Math.min(insertAt, s.snapshots.length - 1)
      if (newIdx !== s.currentIdx) {
        s.currentIdx = newIdx
        applyShifts(newIdx)
      }
    }

    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      const s = dragRef.current
      if (!s) return
      dragRef.current = null

      // Dropped in place — just clean up
      if (s.currentIdx === s.dragIdx) {
        s.clone.remove()
        s.snapshots.forEach(snap => {
          snap.wrapper.style.transition = ''
          snap.wrapper.style.transform = ''
          snap.wrapper.style.opacity = ''
        })
        return
      }

      // Record where each element is visually right now (clone position for the dragged item)
      const cloneReleaseTop = s.clone.getBoundingClientRect().top
      const fromTops = s.snapshots.map((snap, i) =>
        i === s.dragIdx ? cloneReleaseTop : snap.wrapper.getBoundingClientRect().top
      )

      s.clone.remove()
      // Note: don't clear transforms here — useLayoutEffect handles it after React re-renders

      // Build new order and call onReorder
      const ids = s.snapshots.map(sn => sn.id)
      const [movedId] = ids.splice(s.dragIdx, 1)
      ids.splice(s.currentIdx, 0, movedId)
      const allCats = catsRef.current
      const newOrder = ids.map(id => allCats.find(c => c.id === id)).filter(Boolean)

      // Store FLIP data for useLayoutEffect to consume after React re-renders
      flipRef.current = s.snapshots.map((snap, i) => ({ el: snap.wrapper, fromTop: fromTops[i] }))
      onReorder(newOrder)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [containerRef, onReorder])

  return { onDragPointerDown }
}

export default function MenuPage() {
  const { categories, reorderCategories, renameCategory, deleteCategory, addCategory } = useAppContext()
  const { user, signOut } = useAuth()

  const containerRef = useRef(null)
  const { onDragPointerDown } = useCategoryDragReorder(containerRef, categories, reorderCategories)

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
    <div className="page active" id="page-menu">
      <div className="page-header">
        <p className="active-title">Menu</p>
      </div>

      <div style={{ padding: '16px', overflowY: 'auto' }}>

        {/* Categories header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{
            fontFamily: "'Open Sans', system-ui, sans-serif",
            fontSize: 12, fontWeight: 600, color: '#959493',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            Categories
          </span>
          <button
            onClick={() => { setIsAdding(true); setOpenMenuId(null) }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0',
              fontFamily: "'Open Sans', system-ui, sans-serif",
              fontSize: 13, fontWeight: 600, color: '#6993FE',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <line x1="7" y1="2" x2="7" y2="12" stroke="#6993FE" strokeWidth="2" strokeLinecap="round"/>
              <line x1="2" y1="7" x2="12" y2="7" stroke="#6993FE" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Add
          </button>
        </div>

        {/* Categories list card — containerRef children are the per-category wrappers */}
        <div
          ref={containerRef}
          style={{
            background: '#F7F6F3',
            border: '1px solid #C2C1BF',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
          }}
        >
          {categories.map((cat, index) => (
            // wrapper div: keyed by cat.id, used for FLIP transforms + opacity fade during drag
            <div key={cat.id}>
              {index > 0 && (
                <div style={{ height: 1, background: '#DBDAD8', marginLeft: 16 }} />
              )}
              {/* [data-cat-id] row: the element that gets cloned into the floating ghost */}
              <div
                data-cat-id={cat.id}
                style={{ display: 'flex', alignItems: 'center', height: 52 }}
              >
                {/* Drag handle — pointerdown here starts the drag immediately */}
                <div
                  onPointerDown={e => onDragPointerDown(e, cat.id)}
                  style={{
                    width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'grab', flexShrink: 0, touchAction: 'none',
                  }}
                >
                  <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
                    <line x1="2" y1="1" x2="14" y2="1" stroke="#C2C1BF" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="2" y1="6" x2="14" y2="6" stroke="#C2C1BF" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="2" y1="11" x2="14" y2="11" stroke="#C2C1BF" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>

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
                      fontFamily: "'Open Sans', system-ui, sans-serif",
                      fontSize: 16, fontWeight: 600, color: '#242424',
                    }}
                  />
                ) : (
                  <span style={{
                    flex: 1,
                    fontFamily: "'Open Sans', system-ui, sans-serif",
                    fontSize: 16, fontWeight: 600, color: '#242424',
                  }}>
                    {cat.name}
                  </span>
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
                      <circle cx="9" cy="4" r="1.5" fill="#959493"/>
                      <circle cx="9" cy="9" r="1.5" fill="#959493"/>
                      <circle cx="9" cy="14" r="1.5" fill="#959493"/>
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
                          fontFamily: "'Open Sans', system-ui, sans-serif",
                          fontSize: 15, fontWeight: 600, color: '#242424',
                        }}
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => { deleteCategory(cat.id); setOpenMenuId(null) }}
                        style={{
                          display: 'block', width: '100%', padding: '12px 16px',
                          background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer',
                          fontFamily: "'Open Sans', system-ui, sans-serif",
                          fontSize: 15, fontWeight: 600, color: '#B24A4A',
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

          {/* Add category inline input row */}
          {isAdding && (
            <div>
              {categories.length > 0 && (
                <div style={{ height: 1, background: '#DBDAD8', marginLeft: 16 }} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', height: 52 }}>
                <div style={{ width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <line x1="7" y1="2" x2="7" y2="12" stroke="#C2C1BF" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="2" y1="7" x2="12" y2="7" stroke="#C2C1BF" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
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
                    fontFamily: "'Open Sans', system-ui, sans-serif",
                    fontSize: 16, fontWeight: 600, color: '#242424',
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
            fontSize: 14, fontWeight: 600, color: '#959493', margin: 0,
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
              fontSize: 16, fontWeight: 600, color: '#B24A4A',
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
