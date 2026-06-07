import { useRef, useCallback, useLayoutEffect, useEffect } from 'react'

function useSwipe(onDelete, onTagActive) {
  const swipeState = useRef({})

  const onPointerDown = useCallback((e, id) => {
    if (e.target.closest('.swipe-action-btn') || e.target.closest('.checkbox-wrap')) return
    const row = e.currentTarget.closest('.swipe-row')
    if (!row) return
    swipeState.current = { id, startX: e.clientX, startY: e.clientY, row, moved: false, dir: null }

    const onMove = (e2) => {
      const s = swipeState.current
      if (!s.row) return
      const dx = e2.clientX - s.startX
      const dy = e2.clientY - s.startY
      if (!s.dir) {
        if (Math.abs(dy) > 8) { cleanup(); return }
        if (Math.abs(dx) > 10) s.dir = dx < 0 ? 'left' : 'right'
        else return
      }
      s.moved = true
      const content = s.row.querySelector('.swipe-content')
      if (!content) return
      const base = s.row.classList.contains('swiped-left') ? -72 : s.row.classList.contains('swiped-right') ? 72 : 0
      const clamped = Math.max(-72, Math.min(72, base + dx))
      content.style.transition = 'none'
      content.style.transform = `translateX(${clamped}px)`
    }

    const onUp = (e2) => {
      const s = swipeState.current
      if (!s.row) { cleanup(); return }
      const dx = e2.clientX - s.startX
      const content = s.row.querySelector('.swipe-content')
      if (!content) { cleanup(); return }
      content.style.transition = ''
      const base = s.row.classList.contains('swiped-left') ? -72 : s.row.classList.contains('swiped-right') ? 72 : 0
      const total = base + dx
      if (total < -36) {
        s.row.classList.add('swiped-left'); s.row.classList.remove('swiped-right')
        content.style.transform = ''
      } else if (total > 36) {
        s.row.classList.add('swiped-right'); s.row.classList.remove('swiped-left')
        content.style.transform = ''
      } else {
        s.row.classList.remove('swiped-left', 'swiped-right')
        content.style.transform = ''
      }
      cleanup()
    }

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [])

  return { onPointerDown }
}

function useDragReorder(containerRef, items, onReorder) {
  const dragRef = useRef(null)
  const flipRef = useRef(null)
  const itemsRef = useRef(items)
  itemsRef.current = items

  // useLayoutEffect fires before browser paint — clears transforms, then FLIP-animates
  useLayoutEffect(() => {
    const flip = flipRef.current
    if (!flip) return
    flipRef.current = null

    // Clear all transforms/opacity now that React has committed the new DOM order
    flip.forEach(({ el }) => { el.style.transition = 'none'; el.style.transform = ''; el.style.opacity = '' })
    document.body.offsetHeight // force reflow

    // Compute FLIP deltas: fromTop (visual during drag) vs toTop (natural new position)
    const frames = flip.map(({ el, fromTop }) => ({
      el, dy: fromTop - el.getBoundingClientRect().top
    })).filter(f => Math.abs(f.dy) > 1)
    if (!frames.length) return

    frames.forEach(({ el, dy }) => { el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)` })
    document.body.offsetHeight // force reflow

    requestAnimationFrame(() => {
      frames.forEach(({ el }) => { el.style.transition = 'transform 250ms ease'; el.style.transform = '' })
      setTimeout(() => frames.forEach(({ el }) => { el.style.transition = '' }), 250)
    })
  }, [items])

  const onDragPointerDown = useCallback((e, id) => {
    if (e.target.closest('.swipe-action-btn') || e.target.closest('.checkbox-wrap')) return
    const startX = e.clientX, startY = e.clientY
    let started = false
    let longPressTimer = null

    const start = (clientY) => {
      const container = containerRef.current
      if (!container) return false
      const wrappers = [...container.children]
      const snapshots = wrappers.map(w => {
        const sr = w.querySelector('.swipe-row[data-swipe-id]')
        return sr ? { el: sr, wrapper: w, id: +sr.dataset.swipeId, rect: sr.getBoundingClientRect() } : null
      }).filter(Boolean)
      const dragIdx = snapshots.findIndex(s => s.id === id)
      if (dragIdx < 0) return false

      // Count unchecked items (they come first in sorted order)
      const uncheckedCount = snapshots.filter(snap =>
        !itemsRef.current.find(it => it.id === snap.id)?.checked
      ).length

      // Prevent dragging checked items
      if (dragIdx >= uncheckedCount) return false

      const dragged = snapshots[dragIdx]
      const appEl = document.getElementById('app')
      const portal = document.getElementById('animation-portal')
      if (!appEl || !portal) return false
      const appRect = appEl.getBoundingClientRect()
      const origTop = dragged.rect.top - appRect.top
      const cloneTop = origTop - 4

      const cloneInner = dragged.el.cloneNode(true)
      cloneInner.style.cssText = 'pointer-events:none;background:#F7F6F3;'
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
      // Boundary positions for clamping clone movement (app-relative)
      const topBound = snapshots[0].rect.top - appRect.top
      const lastUnchecked = snapshots[uncheckedCount - 1]
      const bottomBound = (lastUnchecked.rect.top + lastUnchecked.rect.height) - appRect.top - dragged.wrapper.getBoundingClientRect().height

      dragRef.current = {
        clone, snapshots, dragIdx, currentIdx: dragIdx,
        cloneTop, startY: clientY, draggedH: dragged.wrapper.getBoundingClientRect().height,
        uncheckedCount, topBound, bottomBound,
      }
      return true
    }

    const doStart = (clientY, longPress) => {
      if (started) return
      started = start(clientY)
      if (!started) return
      if (longPress) {
        // Shadow pop to signal the item is "lifted"
        const s = dragRef.current
        if (s) {
          s.clone.style.transition = 'box-shadow 120ms ease'
          s.clone.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)'
          setTimeout(() => { if (dragRef.current === s) s.clone.style.transition = '' }, 120)
        }
      }
    }

    longPressTimer = setTimeout(() => { longPressTimer = null; doStart(startY, true) }, 250)

    const applyShifts = (snapshots, dragIdx, newIdx, draggedH, uncheckedCount) => {
      snapshots.forEach((snap, i) => {
        if (i === dragIdx) return
        if (i >= uncheckedCount) return  // never shift checked items
        let dy = 0
        if (newIdx < dragIdx && i >= newIdx && i < dragIdx) dy = draggedH
        if (newIdx > dragIdx && i > dragIdx && i <= newIdx) dy = -draggedH
        snap.wrapper.style.transition = 'transform 180ms ease'
        snap.wrapper.style.transform = dy ? `translateY(${dy}px)` : ''
      })
    }

    const onMove = (e2) => {
      const dx = Math.abs(e2.clientX - startX), dy = Math.abs(e2.clientY - startY)
      if (longPressTimer && (dx > 8 || dy > 8)) { clearTimeout(longPressTimer); longPressTimer = null }
      if (!started) {
        if (dy < 12 || dx > dy) return
        doStart(e2.clientY, false)
        if (!started) return
      }
      const s = dragRef.current
      if (!s) return
      const rawTop = s.cloneTop + (e2.clientY - s.startY)
      s.clone.style.top = Math.max(s.topBound, Math.min(s.bottomBound, rawTop)) + 'px'
      // Only use unchecked items as drop targets — checked items are off-limits
      const uncheckedSnaps = s.snapshots.slice(0, s.uncheckedCount)
      const nonDragged = uncheckedSnaps.filter((_, i) => i !== s.dragIdx)
      let insertAt = nonDragged.length
      for (let j = 0; j < nonDragged.length; j++) {
        if (e2.clientY < nonDragged[j].rect.top + nonDragged[j].rect.height / 2) { insertAt = j; break }
      }
      const newIdx = Math.min(insertAt, s.uncheckedCount - 1)
      if (newIdx !== s.currentIdx) { s.currentIdx = newIdx; applyShifts(s.snapshots, s.dragIdx, s.currentIdx, s.draggedH, s.uncheckedCount) }
    }

    const onUp = () => {
      clearTimeout(longPressTimer); longPressTimer = null
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      const s = dragRef.current
      if (!s || !started) return
      dragRef.current = null

      if (s.currentIdx === s.dragIdx) {
        s.clone.remove()
        s.snapshots.forEach(snap => { snap.wrapper.style.transition = ''; snap.wrapper.style.transform = ''; snap.wrapper.style.opacity = '' })
        return
      }

      // Use clone's release position as "from" for the dragged item — not its original DOM position
      const cloneReleaseTop = s.clone.getBoundingClientRect().top
      const fromTops = s.snapshots.map((snap, i) =>
        i === s.dragIdx ? cloneReleaseTop : snap.wrapper.getBoundingClientRect().top
      )

      s.clone.remove()
      // Don't clear transforms here — useLayoutEffect handles it after React re-renders

      const visibleIds = s.snapshots.map(sn => sn.id)
      const [movedId] = visibleIds.splice(s.dragIdx, 1)
      visibleIds.splice(s.currentIdx, 0, movedId)
      const allItems = itemsRef.current
      const visibleSet = new Set(s.snapshots.map(sn => sn.id))
      const hidden = allItems.filter(it => !visibleSet.has(it.id))
      const newOrder = [...visibleIds.map(sid => allItems.find(it => it.id === sid)).filter(Boolean), ...hidden]

      flipRef.current = s.snapshots.map((snap, i) => ({ el: snap.wrapper, fromTop: fromTops[i] }))
      onReorder(newOrder)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [containerRef, onReorder])

  return { onDragPointerDown }
}

function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 1L7.27 4.27L10.85 4.63L8.3 6.9L9.09 10.4L6 8.5L2.91 10.4L3.7 6.9L1.15 4.63L4.73 4.27L6 1Z" fill="rgba(105,147,254,0.2)" stroke="#3F5999" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

function TrashIcon({ color = '#B24A4A' }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <polyline points="3 6 5 6 21 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 11v6M14 11v6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ActiveTagIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" stroke="#3F5999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

export default function TodoCard({ todos, hideCompleted, onToggle, onDelete, onReorder, onToggleHideCompleted }) {
  const containerRef = useRef(null)
  const handleDelete = useCallback((id) => {
    const swipeRow = containerRef.current?.querySelector(`[data-swipe-id="${id}"]`)
    const wrapper = swipeRow?.parentElement
    if (!wrapper) { onDelete(id); return }
    // Flash red, then collapse
    wrapper.animate(
      [
        { background: 'rgba(178,74,74,0)' },
        { background: 'rgba(178,74,74,0.20)', offset: 0.4 },
        { background: 'rgba(178,74,74,0)' },
      ],
      { duration: 280, fill: 'none' }
    )
    setTimeout(() => {
      const height = wrapper.getBoundingClientRect().height
      wrapper.style.height = height + 'px'
      wrapper.style.overflow = 'hidden'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          wrapper.style.transition = 'height 220ms ease, opacity 180ms ease'
          wrapper.style.height = '0'
          wrapper.style.opacity = '0'
        })
      })
      setTimeout(() => onDelete(id), 250)
    }, 180)
  }, [onDelete])
  const { onPointerDown } = useSwipe(handleDelete, () => {})
  const checkTimers = useRef({})
  const cardRef = useRef(null)
  const { onDragPointerDown } = useDragReorder(containerRef, todos, onReorder)
  const toggleFlipRef = useRef(null)
  const btnRef = useRef(null)
  const showingRef = useRef(false)

  // Compute before early return so hooks can use it
  const hasChecked = todos.some(t => t.checked)

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    requestAnimationFrame(() => { card.classList.add('visible') })
  }, [todos.length > 0])

  // FLIP-animate rows after a checkbox toggle reorders the list
  useLayoutEffect(() => {
    const flip = toggleFlipRef.current
    if (!flip) return
    toggleFlipRef.current = null
    document.body.offsetHeight
    const frames = flip.map(({ el, top }) => ({
      el, dy: top - el.getBoundingClientRect().top
    })).filter(f => Math.abs(f.dy) > 1)
    if (!frames.length) return
    frames.forEach(({ el, dy }) => { el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)` })
    document.body.offsetHeight
    requestAnimationFrame(() => {
      frames.forEach(({ el }) => { el.style.transition = 'transform 350ms cubic-bezier(0.4,0,0.2,1)'; el.style.transform = '' })
      setTimeout(() => frames.forEach(({ el }) => { el.style.transition = '' }), 350)
    })
  }, [todos])

  // Animate checked items sliding in after "Show Completed"
  useLayoutEffect(() => {
    if (!showingRef.current) return
    showingRef.current = false
    const container = containerRef.current
    if (!container) return
    const wrappers = todos.filter(t => t.checked).map(t =>
      container.querySelector(`[data-swipe-id="${t.id}"]`)?.parentElement
    ).filter(Boolean)
    if (!wrappers.length) return
    wrappers.forEach(el => {
      el.style.overflow = 'hidden'
      el.style.maxHeight = '0'
      el.style.opacity = '0'
      el.style.transition = 'none'
    })
    document.body.offsetHeight
    requestAnimationFrame(() => {
      wrappers.forEach(el => {
        el.style.transition = 'max-height 220ms ease, opacity 180ms ease'
        el.style.maxHeight = el.scrollHeight + 'px'
        el.style.opacity = '1'
      })
      setTimeout(() => wrappers.forEach(el => {
        el.style.maxHeight = ''
        el.style.overflow = ''
        el.style.transition = ''
        el.style.opacity = ''
      }), 220)
    })
  }, [hideCompleted, todos])

  // Animate the Hide/Show button in and out
  useEffect(() => {
    const btn = btnRef.current
    if (!btn) return
    if (hasChecked) {
      btn.style.display = 'block'
      requestAnimationFrame(() => { btn.classList.add('visible') })
    } else {
      btn.classList.remove('visible')
      setTimeout(() => { if (btnRef.current) btnRef.current.style.display = '' }, 210)
    }
  }, [hasChecked])

  if (todos.length === 0) return null

  const sorted = hideCompleted
    ? todos.filter(t => !t.checked)
    : [...todos.filter(t => !t.checked), ...todos.filter(t => t.checked)]

  const handleCheckboxDown = (e, id) => {
    e.stopPropagation()
    const checkboxEl = e.currentTarget.querySelector('.checkbox')
    if (checkboxEl) {
      checkboxEl.getAnimations().forEach(a => a.cancel())
      checkboxEl.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(0.82)' }],
        { duration: 100, fill: 'forwards' }
      )
    }
    checkTimers.current[id] = setTimeout(() => {}, 300)
  }

  const handleCheckboxUp = (e, id) => {
    e.stopPropagation()
    clearTimeout(checkTimers.current[id])

    const checkboxEl = e.currentTarget.querySelector('.checkbox')
    if (!checkboxEl) { onToggle(id); return }

    const isChecked = todos.find(t => t.id === id)?.checked

    // Cancel press, start pop animation
    checkboxEl.getAnimations().forEach(a => a.cancel())
    checkboxEl.animate(
      [{ transform: 'scale(0.82)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
      { duration: 320, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'none' }
    )

    if (!isChecked) {
      // Apply checked visual immediately so color/checkmark appear during the pop
      checkboxEl.classList.add('checked')
      e.currentTarget.closest('.todo-row')?.classList.add('checked')

      // Blue row flash
      e.currentTarget.closest('.todo-row')?.animate(
        [
          { background: 'rgba(105,147,254,0)' },
          { background: 'rgba(105,147,254,0.18)', offset: 0.2 },
          { background: 'rgba(105,147,254,0)' },
        ],
        { duration: 500, easing: 'ease', fill: 'none' }
      )

      // After flash completes, snapshot + trigger reorder
      setTimeout(() => {
        if (containerRef.current) {
          toggleFlipRef.current = [...containerRef.current.children].map(el => ({
            el, top: el.getBoundingClientRect().top,
          }))
        }
        onToggle(id)
      }, 500)
    } else {
      // Unchecking: snapshot then animate up
      if (containerRef.current) {
        toggleFlipRef.current = [...containerRef.current.children].map(el => ({
          el, top: el.getBoundingClientRect().top,
        }))
      }
      onToggle(id)
    }
  }

  const handleToggleHideCompleted = () => {
    if (!hideCompleted) {
      // Animate checked rows out, then hide
      const container = containerRef.current
      const wrappers = todos.filter(t => t.checked).map(t =>
        container?.querySelector(`[data-swipe-id="${t.id}"]`)?.parentElement
      ).filter(Boolean)
      wrappers.forEach(el => {
        el.style.overflow = 'hidden'
        el.style.maxHeight = el.getBoundingClientRect().height + 'px'
        el.offsetHeight
        el.style.transition = 'max-height 200ms ease, opacity 150ms ease'
        el.style.maxHeight = '0'
        el.style.opacity = '0'
      })
      setTimeout(() => {
        wrappers.forEach(el => {
          el.style.maxHeight = ''
          el.style.overflow = ''
          el.style.transition = ''
          el.style.opacity = ''
        })
        onToggleHideCompleted()
      }, 210)
    } else {
      // Mark that we want to animate items in after re-render
      showingRef.current = true
      onToggleHideCompleted()
    }
  }

  return (
    <div className="card card-intro" id="listsCard" ref={cardRef}>
      <div className="card-header">
        <div>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="5" cy="7" r="1.5" fill="#3D3D3D"/>
            <line x1="9" y1="7" x2="19" y2="7" stroke="#3D3D3D" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="5" cy="12" r="1.5" fill="#3D3D3D"/>
            <line x1="9" y1="12" x2="19" y2="12" stroke="#3D3D3D" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="5" cy="17" r="1.5" fill="#3D3D3D"/>
            <line x1="9" y1="17" x2="14" y2="17" stroke="#3D3D3D" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="card-title">Lists</span>
        <div className="dots-menu"><span/><span/><span/></div>
      </div>

      <div id="lists-container" ref={containerRef}>
        {sorted.map((t, i) => (
          <div key={t.id}>
            {i > 0 && <div className="divider"/>}
            <div className="swipe-row" data-swipe-id={t.id} data-swipe-type="todo">
              <button className="swipe-action-btn active-tag" onMouseDown={e => e.preventDefault()}>
                <ActiveTagIcon/>
                <span className="swipe-action-label active-tag">Active</span>
              </button>
              <button className="swipe-action-btn delete" onMouseDown={e => { e.preventDefault(); handleDelete(t.id) }}>
                <TrashIcon/>
                <span className="swipe-action-label delete">Delete</span>
              </button>
              <div className="swipe-content">
                <div
                  className={`todo-row${t.checked ? ' checked' : ''}`}
                  data-id={t.id}
                  onPointerDown={e => { onPointerDown(e, t.id); onDragPointerDown(e, t.id) }}
                >
                  <div
                    className="checkbox-wrap"
                    onMouseDown={e => handleCheckboxDown(e, t.id)}
                    onMouseUp={e => handleCheckboxUp(e, t.id)}
                    onMouseLeave={e => {
                      clearTimeout(checkTimers.current[t.id])
                      e.currentTarget.querySelector('.checkbox')?.getAnimations().forEach(a => a.cancel())
                    }}
                    onTouchStart={e => handleCheckboxDown(e, t.id)}
                    onTouchEnd={e => handleCheckboxUp(e, t.id)}
                  >
                    <div className={`checkbox${t.checked ? ' checked' : ''}`}>
                      <svg className="checkmark" width="16" height="16" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                  <div className="item-content">
                    <span className={`item-text${t.checked ? ' checked-text' : ''}`}>{t.text}</span>
                    <div className="source-label">
                      <StarIcon/>
                      <span className="source-label-text">{t.source}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        ref={btnRef}
        className="hide-completed-btn"
        onClick={handleToggleHideCompleted}
      >
        {hideCompleted ? 'Show Completed' : 'Hide Completed'}
      </button>
    </div>
  )
}
