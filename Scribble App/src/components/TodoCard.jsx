import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react'
import { EyeIcon, EyeOffIcon } from './MenuIcons.jsx'
import { useAppContext } from '../context/AppContext.jsx'

function useSwipe(onDelete, onTagActive) {
  const swipeState = useRef({})

  const onPointerDown = useCallback((e, id) => {
    if (e.target.closest('.swipe-action-btn') || e.target.closest('.checkbox-wrap')) return
    const row = e.currentTarget.closest('.swipe-row')
    if (!row) return
    const wasLeft = row.classList.contains('swiped-left')
    const wasRight = row.classList.contains('swiped-right')
    swipeState.current = { id, startX: e.clientX, startY: e.clientY, row, dir: null, wasLeft, wasRight, lockSign: null }

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
      const content = s.row.querySelector('.swipe-content')
      if (!content) return
      const base = s.wasLeft ? -84 : s.wasRight ? 84 : 0
      const proposed = base + dx
      if (s.lockSign === null && Math.abs(proposed) > 2) s.lockSign = proposed > 0 ? 1 : -1
      let newX = Math.max(-84, Math.min(84, proposed))
      if (s.lockSign === 1 || s.wasRight) newX = Math.max(0, newX)
      if (s.lockSign === -1 || s.wasLeft) newX = Math.min(0, newX)
      content.style.transition = 'none'
      content.style.transform = `translateX(${newX}px)`
    }

    const onUp = (e2) => {
      const s = swipeState.current
      if (!s.row) { cleanup(); return }
      const dx = e2.clientX - s.startX
      const dy = e2.clientY - s.startY
      const content = s.row.querySelector('.swipe-content')
      if (!content) { cleanup(); return }
      content.style.transition = ''
      const isTap = Math.abs(dx) < 8 && Math.abs(dy) < 8
      if (isTap && (s.wasLeft || s.wasRight)) {
        s.row.classList.remove('swiped-left', 'swiped-right')
        content.style.transform = ''
        cleanup()
        return
      }
      const base = s.wasLeft ? -84 : s.wasRight ? 84 : 0
      const rawTotal = base + dx
      let total = s.wasRight ? Math.max(0, rawTotal) : s.wasLeft ? Math.min(0, rawTotal) : rawTotal
      if (s.lockSign === 1) total = Math.max(0, total)
      if (s.lockSign === -1) total = Math.min(0, total)
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

    const handleCancel = () => {
      const s2 = swipeState.current
      if (s2.row) {
        const c2 = s2.row.querySelector('.swipe-content')
        if (c2) {
          c2.style.transition = ''
          const m = c2.style.transform.match(/translateX\((-?[\d.]+)px\)/)
          const cx = m ? parseFloat(m[1]) : 0
          if (cx < -36) { s2.row.classList.add('swiped-left'); s2.row.classList.remove('swiped-right') }
          else if (cx > 36) { s2.row.classList.add('swiped-right'); s2.row.classList.remove('swiped-left') }
          else { s2.row.classList.remove('swiped-left', 'swiped-right') }
          c2.style.transform = ''
        }
      }
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', handleCancel)
    }
    const cleanup = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', handleCancel)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', handleCancel)
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
    const preventScroll = (e) => { if (started) e.preventDefault() }

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
    document.addEventListener('touchmove', preventScroll, { passive: false })

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
      if (longPressTimer && (dx > 8 || dy > 8)) { clearTimeout(longPressTimer); longPressTimer = null; document.removeEventListener('touchmove', preventScroll) }
      if (!started) return
      e2.preventDefault()
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

    const onCancel = () => {
      clearTimeout(longPressTimer); longPressTimer = null
      document.removeEventListener('pointermove', onMove, { passive: false })
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('touchmove', preventScroll)
      const s = dragRef.current
      if (!s) return
      dragRef.current = null
      s.clone.remove()
      s.snapshots.forEach(snap => { snap.wrapper.style.transition = ''; snap.wrapper.style.transform = ''; snap.wrapper.style.opacity = '' })
    }

    const onUp = () => {
      clearTimeout(longPressTimer); longPressTimer = null
      document.removeEventListener('pointermove', onMove, { passive: false })
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('touchmove', preventScroll)
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

    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
  }, [containerRef, onReorder])

  return { onDragPointerDown }
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" style={{ fill: 'rgba(var(--accent-base-rgb),0.2)', stroke: 'var(--accent-dark)' }}>
      <polyline points="3,6.8 10,2.6 17,6.8" vectorEffect="non-scaling-stroke"/>
      <line x1="5" y1="7.6" x2="5" y2="14" vectorEffect="non-scaling-stroke"/>
      <line x1="8.33" y1="7.6" x2="8.33" y2="14" vectorEffect="non-scaling-stroke"/>
      <line x1="11.67" y1="7.6" x2="11.67" y2="14" vectorEffect="non-scaling-stroke"/>
      <line x1="15" y1="7.6" x2="15" y2="14" vectorEffect="non-scaling-stroke"/>
      <line x1="3.5" y1="14" x2="16.5" y2="14" vectorEffect="non-scaling-stroke"/>
      <line x1="3" y1="17" x2="17" y2="17" vectorEffect="non-scaling-stroke"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ActiveTagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,6.8 10,2.6 17,6.8" vectorEffect="non-scaling-stroke"/>
      <line x1="5" y1="7.6" x2="5" y2="14" vectorEffect="non-scaling-stroke"/>
      <line x1="8.33" y1="7.6" x2="8.33" y2="14" vectorEffect="non-scaling-stroke"/>
      <line x1="11.67" y1="7.6" x2="11.67" y2="14" vectorEffect="non-scaling-stroke"/>
      <line x1="15" y1="7.6" x2="15" y2="14" vectorEffect="non-scaling-stroke"/>
      <line x1="3.5" y1="14" x2="16.5" y2="14" vectorEffect="non-scaling-stroke"/>
      <line x1="3" y1="17" x2="17" y2="17" vectorEffect="non-scaling-stroke"/>
    </svg>
  )
}

export default function TodoCard({ todos, onToggle, onDelete, onReorder }) {
  const [hideCompleted, setHideCompleted] = useState(() => {
    try { return localStorage.getItem('hc-active-todos') !== 'false' } catch { return true }
  })
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const containerRef = useRef(null)
  const { promptDelete } = useAppContext()
  const handleDelete = useCallback((id) => {
    promptDelete(() => {
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
    })
  }, [onDelete, promptDelete])
  const { onPointerDown } = useSwipe(handleDelete, () => {})
  const checkTimers = useRef({})
  const checkPopping = useRef({})
  const cardRef = useRef(null)
  const { onDragPointerDown } = useDragReorder(containerRef, todos, onReorder)
  const toggleFlipRef = useRef(null)
  const showingRef = useRef(false)

  // Compute before early return so hooks can use it
  const hasChecked = todos.some(t => t.checked)

  // Close the three-dot menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [menuOpen])

  // Close the menu if the last completed item goes away (menu hides entirely)
  useEffect(() => { if (!hasChecked) setMenuOpen(false) }, [hasChecked])

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

  if (todos.length === 0) return null

  const sorted = hideCompleted
    ? todos.filter(t => !t.checked)
    : [...todos.filter(t => !t.checked), ...todos.filter(t => t.checked)]

  const handleCheckboxDown = (e, id) => {
    e.stopPropagation()
    const row = e.currentTarget.closest('.swipe-row')
    if (row && (row.classList.contains('swiped-left') || row.classList.contains('swiped-right'))) {
      row.classList.remove('swiped-left', 'swiped-right')
      const content = row.querySelector('.swipe-content')
      if (content) content.style.transform = ''
      checkTimers.current[`suppress_${id}`] = true
      return
    }
    checkTimers.current[`suppress_${id}`] = false
    checkPopping.current[id] = false
    const checkboxEl = e.currentTarget.querySelector('.checkbox')
    if (checkboxEl) {
      checkboxEl.getAnimations().forEach(a => { if (!(a.animationName || '').includes('orbit')) a.cancel() })
      checkboxEl.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(0.82)' }],
        { duration: 100, fill: 'forwards' }
      )
    }
    checkTimers.current[id] = setTimeout(() => {}, 300)
  }

  const handleCheckboxUp = (e, id) => {
    e.stopPropagation()
    if (checkTimers.current[`suppress_${id}`]) {
      checkTimers.current[`suppress_${id}`] = false
      return
    }
    clearTimeout(checkTimers.current[id])

    const checkboxEl = e.currentTarget.querySelector('.checkbox')
    if (!checkboxEl) { onToggle(id); return }

    const isChecked = todos.find(t => t.id === id)?.checked

    checkPopping.current[id] = true
    const popAnim = checkboxEl.animate(
      [
        { transform: 'scale(0.82)' },
        { transform: 'scale(1.3)' },
        { transform: 'scale(1)' },
      ],
      { duration: 350, easing: 'ease', fill: 'forwards' }
    )
    popAnim.onfinish = () => checkboxEl.getAnimations().forEach(a => { if (!(a.animationName || '').includes('orbit')) a.cancel() })

    if (!isChecked) {
      // Apply checked visual immediately so color/checkmark appear during the pop
      checkboxEl.classList.add('checked')
      e.currentTarget.closest('.todo-row')?.classList.add('checked')

      // Row flash in accent color
      const todoRow = e.currentTarget.closest('.todo-row')
      if (todoRow) {
        const rgb = getComputedStyle(todoRow).getPropertyValue('--accent-base-rgb').trim() || '96,119,135'
        todoRow.animate(
          [
            { background: `rgba(${rgb},0)` },
            { background: `rgba(${rgb},0.18)`, offset: 0.2 },
            { background: `rgba(${rgb},0)` },
          ],
          { duration: 500, easing: 'ease', fill: 'none' }
        )
      }

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
        setHideCompleted(true)
        try { localStorage.setItem('hc-active-todos', 'true') } catch {}
      }, 210)
    } else {
      // Mark that we want to animate items in after re-render
      showingRef.current = true
      setHideCompleted(false)
      try { localStorage.setItem('hc-active-todos', 'false') } catch {}
    }
  }

  return (
    <div className="card card-intro" id="listsCard" ref={cardRef}>
      <div className="card-header">
        <span className="card-title">Lists</span>
        {hasChecked && (
          <div className="dots-menu-wrap" ref={menuRef}>
            <div
              className="dots-menu dots-menu-btn"
              onMouseDown={e => { e.preventDefault(); setMenuOpen(v => !v) }}
            >
              <span/><span/><span/>
            </div>
              <div className={`card-context-menu${menuOpen ? ' open' : ''}`}>
                <button
                  className="card-context-item"
                  onMouseDown={e => { e.preventDefault(); handleToggleHideCompleted(); setMenuOpen(false) }}
                >
                  {hideCompleted ? <EyeIcon/> : <EyeOffIcon/>}
                  {hideCompleted ? 'Show Completed' : 'Hide Completed'}
                </button>
              </div>
          </div>
        )}
      </div>

      <div id="lists-container" ref={containerRef}>
        {sorted.map((t, i) => (
          <div key={t.id}>
            {i > 0 && <div className="divider"/>}
            <div className="swipe-row" data-swipe-id={t.id} data-swipe-type="todo">
              <button className="swipe-action-btn active-tag" onMouseDown={e => e.preventDefault()}>
                <div className="swipe-active-inner">
                  <ActiveTagIcon/>
                  <span className="swipe-action-label">Displayed</span>
                </div>
              </button>
              <button className="swipe-action-btn delete" onMouseDown={e => { e.preventDefault(); handleDelete(t.id) }}>
                <div className="swipe-active-inner">
                  <TrashIcon/>
                  <span className="swipe-action-label">Delete</span>
                </div>
              </button>
              <div className="swipe-content">
                <div
                  className={`todo-row${t.checked ? ' checked' : ''}`}
                  data-id={t.id}
                  onPointerDown={e => { onPointerDown(e, t.id); onDragPointerDown(e, t.id) }}
                >
                  <div
                    className="checkbox-wrap"
                    onPointerDown={e => handleCheckboxDown(e, t.id)}
                    onPointerUp={e => handleCheckboxUp(e, t.id)}
                    onPointerLeave={e => {
                      clearTimeout(checkTimers.current[t.id])
                      if (!checkPopping.current[t.id]) {
                        e.currentTarget.querySelector('.checkbox')?.getAnimations().forEach(a => { if (!(a.animationName || '').includes('orbit')) a.cancel() })
                      }
                    }}
                  >
                    <div className={`checkbox${t.checked ? ' checked' : ''}`}>
                      <svg className="checkmark" width="16" height="16" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
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
    </div>
  )
}
