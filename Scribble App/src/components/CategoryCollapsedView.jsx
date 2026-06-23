import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAppContext } from '../context/AppContext.jsx'
import { NoteDetailPage } from './NoteCard.jsx'
import TodoDetailPage from './TodoDetailPage.jsx'
import { getCategoryAccent } from '../theme.js'
import { ActivateSwipeButton, CalendarIcon, toAnchorRect, groupByActivation } from './ScheduleBits.jsx'
import CalendarPopup from './CalendarPopup.jsx'
import { EyeIcon, EyeOffIcon } from './MenuIcons.jsx'
import OutlinkButton from './OutlinkButton.jsx'
import LinkDetailPage from './LinkDetailPage.jsx'

// Open a (possibly scheme-less) URL in a new browser tab
function openUrl(url) {
  if (!url) return
  let u = url.trim()
  // A phone number in the link field → start a call instead of opening a URL
  const digits = u.replace(/\D/g, '')
  if (/^[+()\-.\s\d]+$/.test(u) && digits.length >= 7 && digits.length <= 15) {
    window.location.href = 'tel:' + u.replace(/[^\d+]/g, '')
    return
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u
  window.open(u, '_blank', 'noopener,noreferrer')
}

function displayUrl(url) {
  if (!url) return ''
  const t = url.trim()
  const d = t.replace(/\D/g, '')
  // Recognised phone number → format with parentheses + dash
  if (/^[+()\-.\s\d]+$/.test(t) && d.length >= 7 && d.length <= 15) {
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
    if (d.length === 11 && d[0] === '1') return `1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
    if (d.length === 7) return `${d.slice(0, 3)}-${d.slice(3)}`
    return t
  }
  return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/$/, '')
}

function closeSwipeRow(row) {
  if (!row) return
  row.classList.remove('swiped-left', 'swiped-right')
  const content = row.querySelector('.swipe-content')
  if (content) { content.style.transition = ''; content.style.transform = '' }
}

// ---- Icons ----
function TrashIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <polyline points="3 6 5 6 21 6" stroke="#8B3333" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="#8B3333" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 11v6M14 11v6" stroke="#8B3333" strokeWidth="1" strokeLinecap="round"/>
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="#8B3333" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
      <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
      <path d="M10 12h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

function RetrieveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
      <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
      <path d="M12 18v-6" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <path d="M9.5 14.5L12 12l2.5 2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ActivateIcon({ activated }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ fill: activated ? 'rgba(var(--accent-base-rgb),0.3)' : 'none' }}>
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

// ---- Note preview helpers (mirrors ProjectCard) ----
function extractNotePreview(editorHTML) {
  if (!editorHTML) return null
  try {
    const tmp = document.createElement('div')
    tmp.innerHTML = editorHTML
    const paras = [...tmp.querySelectorAll('.note-para')]
    if (paras.length <= 1) return null
    const text = paras.slice(1).map(p => p.textContent).join(' ').replace(/\s+/g, ' ').trim()
    return text || null
  } catch { return null }
}

function NoteRowContent({ note }) {
  const titleRef = useRef(null)
  const [isMultiLine, setIsMultiLine] = useState(false)
  const previewText = useMemo(() => extractNotePreview(note.editorHTML), [note.editorHTML])

  useLayoutEffect(() => {
    const el = titleRef.current
    if (!el || !previewText) { setIsMultiLine(false); return }
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 22.4
    setIsMultiLine(el.scrollHeight > lh * 1.5)
  }, [note.text, previewText]) // eslint-disable-line react-hooks/exhaustive-deps

  const titleStyle = isMultiLine
    ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
    : { display: 'block' }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <span ref={titleRef} className="note-text" style={titleStyle}>{note.text}</span>
      {previewText && !isMultiLine && (
        <span className="note-preview-text">{previewText}</span>
      )}
    </div>
  )
}

// ---- Swipe hook (directional, ProjectCard-style) ----
function useSwipe() {
  const swipeState = useRef({})
  const onPointerDown = useCallback((e, id) => {
    if (e.target.closest('.swipe-action-btn') || e.target.closest('.checkbox-wrap')) return
    const row = e.currentTarget.closest('.swipe-row')
    if (!row) return
    const wasLeft = row.classList.contains('swiped-left')
    const wasRight = row.classList.contains('swiped-right')
    const leftMax = parseInt(row.dataset.leftMax, 10) || 84
    swipeState.current = { id, startX: e.clientX, startY: e.clientY, row, dir: null, wasLeft, wasRight, lockSign: null, leftMax }

    const onMove = (e2) => {
      const s = swipeState.current
      if (!s.row) return
      const dx = e2.clientX - s.startX, dy = e2.clientY - s.startY
      if (!s.dir) {
        if (Math.abs(dy) > 8) { cleanup(); return }
        if (Math.abs(dx) > 10) s.dir = dx < 0 ? 'left' : 'right'
        else return
      }
      const content = s.row.querySelector('.swipe-content')
      if (!content) return
      const base = s.wasLeft ? -s.leftMax : s.wasRight ? 84 : 0
      const proposed = base + dx
      if (s.lockSign === null && Math.abs(proposed) > 2) s.lockSign = proposed > 0 ? 1 : -1
      let newX = Math.max(-s.leftMax, Math.min(84, proposed))
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
      const base = s.wasLeft ? -s.leftMax : s.wasRight ? 84 : 0
      const rawTotal = base + dx
      let total = s.wasRight ? Math.max(0, rawTotal) : s.wasLeft ? Math.min(0, rawTotal) : rawTotal
      if (s.lockSign === 1) total = Math.max(0, total)
      if (s.lockSign === -1) total = Math.min(0, total)
      if (total < -36) { s.row.classList.add('swiped-left'); s.row.classList.remove('swiped-right'); content.style.transform = '' }
      else if (total > 36) { s.row.classList.add('swiped-right'); s.row.classList.remove('swiped-left'); content.style.transform = '' }
      else { s.row.classList.remove('swiped-left', 'swiped-right'); content.style.transform = '' }
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
      cleanup()
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

// ---- Drag reorder hook (group-aware) ----
// groupKeysProp: optional array aligned to `items`. Items sharing a contiguous key
// form an independent reorderable group; an item whose key is null/undefined is
// locked (not draggable). Dragging is confined within the dragged item's group, so
// e.g. active items only reorder among active, inactive among inactive.
function useDragReorder(containerRef, items, onReorder, groupKeysProp) {
  const dragRef = useRef(null)
  const flipRef = useRef(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const gkRef = useRef(groupKeysProp)
  gkRef.current = groupKeysProp

  useLayoutEffect(() => {
    const flip = flipRef.current
    if (!flip) return
    flipRef.current = null
    flip.forEach(({ el }) => { el.style.transition = 'none'; el.style.transform = ''; el.style.opacity = '' })
    document.body.offsetHeight
    const frames = flip.map(({ el, fromTop }) => ({ el, dy: fromTop - el.getBoundingClientRect().top })).filter(f => Math.abs(f.dy) > 1)
    if (!frames.length) return
    frames.forEach(({ el, dy }) => { el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)` })
    document.body.offsetHeight
    requestAnimationFrame(() => {
      frames.forEach(({ el }) => { el.style.transition = 'transform 250ms ease'; el.style.transform = '' })
      setTimeout(() => frames.forEach(({ el }) => { el.style.transition = '' }), 250)
    })
  }, [items])

  const onDragPointerDown = useCallback((e, id) => {
    if (e.target.closest('.swipe-action-btn') || e.target.closest('.checkbox-wrap')) return
    const startX = e.clientX, startY = e.clientY
    let started = false, longPressTimer = null
    const preventScroll = (e) => { if (started) e.preventDefault() }

    const start = (clientY) => {
      const container = containerRef.current
      if (!container) return false
      const snapshots = [...container.children].map(w => {
        const sr = w.querySelector('.swipe-row[data-swipe-id]')
        return sr ? { el: sr, wrapper: w, id: sr.dataset.swipeId, rect: sr.getBoundingClientRect() } : null
      }).filter(Boolean)
      const dragIdx = snapshots.findIndex(s => String(s.id) === String(id))
      if (dragIdx < 0) return false
      // Determine the contiguous group the dragged row belongs to.
      const groupKeys = gkRef.current
      let groupStart = 0, groupEnd = snapshots.length
      if (groupKeys) {
        const key = groupKeys[dragIdx]
        if (key == null) return false   // locked row (e.g. completed todo)
        groupStart = dragIdx
        while (groupStart > 0 && groupKeys[groupStart - 1] === key) groupStart--
        groupEnd = dragIdx + 1
        while (groupEnd < snapshots.length && groupKeys[groupEnd] === key) groupEnd++
      }
      const dragged = snapshots[dragIdx]
      const appEl = document.getElementById('app'), portal = document.getElementById('animation-portal')
      if (!appEl || !portal) return false
      const appRect = appEl.getBoundingClientRect()
      const cloneTop = dragged.rect.top - appRect.top - 4
      const draggedH = dragged.wrapper.getBoundingClientRect().height
      let topBound = -Infinity, bottomBound = Infinity
      if (groupKeys && groupEnd - groupStart > 0) {
        topBound = snapshots[groupStart].rect.top - appRect.top - 4
        const lastInGroup = snapshots[groupEnd - 1]
        bottomBound = (lastInGroup.rect.top + lastInGroup.rect.height) - appRect.top - draggedH - 4
      }
      const cloneInner = dragged.el.cloneNode(true)
      cloneInner.style.cssText = 'pointer-events:none;background:#F7F6F3;'
      const clone = document.createElement('div')
      clone.style.cssText = ['position:absolute', `left:${dragged.rect.left - appRect.left - 4}px`, `top:${cloneTop}px`, `width:${dragged.rect.width + 8}px`, 'padding:4px 0', 'pointer-events:none', 'box-shadow:0 4px 20px rgba(0,0,0,0.10)', 'border-radius:8px', 'border:1px solid #C2C1BF', 'background:#F7F6F3', 'overflow:hidden', 'z-index:999'].join(';')
      clone.appendChild(cloneInner)
      portal.appendChild(clone)
      dragged.wrapper.style.opacity = '0'
      dragRef.current = { clone, snapshots, dragIdx, currentIdx: dragIdx, cloneTop, startY: clientY, draggedH, groupStart, groupEnd, topBound, bottomBound }
      return true
    }

    const doStart = (clientY, longPress) => {
      if (started) return
      started = start(clientY)
      if (!started || !longPress) return
      const s = dragRef.current
      if (s) { s.clone.style.transition = 'box-shadow 120ms ease'; s.clone.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)'; setTimeout(() => { if (dragRef.current === s) s.clone.style.transition = '' }, 120) }
    }

    longPressTimer = setTimeout(() => { longPressTimer = null; doStart(startY, true) }, 250)
    document.addEventListener('touchmove', preventScroll, { passive: false })

    const applyShifts = (snapshots, dragIdx, newIdx, draggedH, groupStart, groupEnd) => {
      snapshots.forEach((snap, i) => {
        if (i === dragIdx) return
        if (i < groupStart || i >= groupEnd) return
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
      s.clone.style.top = (s.topBound > -Infinity ? Math.max(s.topBound, Math.min(s.bottomBound, rawTop)) : rawTop) + 'px'
      const targetSnaps = s.snapshots.slice(s.groupStart, s.groupEnd)
      const dragLocal = s.dragIdx - s.groupStart
      const nonDragged = targetSnaps.filter((_, i) => i !== dragLocal)
      let insertAt = nonDragged.length
      for (let j = 0; j < nonDragged.length; j++) { if (e2.clientY < nonDragged[j].rect.top + nonDragged[j].rect.height / 2) { insertAt = j; break } }
      const newIdx = s.groupStart + Math.min(insertAt, (s.groupEnd - s.groupStart) - 1)
      if (newIdx !== s.currentIdx) { s.currentIdx = newIdx; applyShifts(s.snapshots, s.dragIdx, s.currentIdx, s.draggedH, s.groupStart, s.groupEnd) }
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
      if (s.currentIdx === s.dragIdx) { s.clone.remove(); s.snapshots.forEach(snap => { snap.wrapper.style.transition = ''; snap.wrapper.style.transform = ''; snap.wrapper.style.opacity = '' }); return }
      const cloneReleaseTop = s.clone.getBoundingClientRect().top
      const fromTops = s.snapshots.map((snap, i) => i === s.dragIdx ? cloneReleaseTop : snap.wrapper.getBoundingClientRect().top)
      s.clone.remove()
      const visibleIds = s.snapshots.map(sn => sn.id)
      const [movedId] = visibleIds.splice(s.dragIdx, 1)
      visibleIds.splice(s.currentIdx, 0, movedId)
      const allItems = itemsRef.current
      const visibleSet = new Set(s.snapshots.map(sn => sn.id))
      const hidden = allItems.filter(it => !visibleSet.has(String(it.id)) && !visibleSet.has(it.id))
      const newOrder = [...visibleIds.map(sid => allItems.find(it => String(it.id) === String(sid))).filter(Boolean), ...hidden]
      flipRef.current = s.snapshots.map((snap, i) => ({ el: snap.wrapper, fromTop: fromTops[i] }))
      onReorder(newOrder)
    }

    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
  }, [containerRef, onReorder])

  return { onDragPointerDown }
}

// Sort by the per-category global order (cat_sort_order). Items without one keep
// their incoming (project-major) order via the stable sort + Infinity fallback.
const byCatOrder = (a, b) => (a.catSortOrder ?? Infinity) - (b.catSortOrder ?? Infinity)

// Distribute a reordered aggregate list back into its source projects
function distribute(category, newOrder, type, reorderFn) {
  const byProj = {}
  newOrder.forEach(it => {
    if (!byProj[it.projectId]) byProj[it.projectId] = []
    byProj[it.projectId].push(it)
  })
  Object.entries(byProj).forEach(([projectId, list]) => {
    const proj = category.projects.find(p => p.id === projectId)
    if (!proj) return
    const src = type === 'todo' ? proj.todos : type === 'link' ? proj.links : proj.notes
    const ordered = list.map(it => src.find(x => x.id === it.id)).filter(Boolean)
    src.forEach(x => { if (!ordered.includes(x)) ordered.push(x) })
    reorderFn(category.id, projectId, ordered)
  })
}

// ============ Lists (todos) ============
function CollapsedTodosCard({ category }) {
  const { categories, toggleProjectTodo, deleteProjectTodo, toggleProjectTodoActivated, reorderCategoryTodos, setProjectTodoScheduled, promptArchiveAttachments } = useAppContext()
  const categoryRef = useRef(category)
  categoryRef.current = category
  const [calFor, setCalFor] = useState(null)
  const accent = useMemo(() => {
    const idx = categories.findIndex(c => c.id === category.id)
    return idx === -1 ? null : getCategoryAccent(idx)
  }, [categories, category.id])
  const openSchedule = useCallback((item, el) => {
    closeSwipeRow(el?.closest('.swipe-row'))
    setCalFor({ id: item.id, projectId: item.projectId, current: item.scheduledDate || null, anchorRect: toAnchorRect(el) })
  }, [])
  const clearSchedule = useCallback((id, projectId, row) => { closeSwipeRow(row); setProjectTodoScheduled(category.id, projectId, id, null) }, [category.id, setProjectTodoScheduled])

  const [hideCompleted, setHideCompleted] = useState(() => {
    try { return localStorage.getItem(`hc-cat-${category.id}`) !== 'false' } catch { return true }
  })
  const [openTodoId, setOpenTodoId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const cardRef = useRef(null)
  const containerRef = useRef(null)
  const sortFlipRef = useRef(null)
  const showingRef = useRef(false)
  const checkTimers = useRef({})
  const checkPopping = useRef({})
  const todoTapState = useRef({})

  const allTodos = category.projects.filter(p => !p.archived).flatMap(p =>
    p.todos.map(t => ({ ...t, projectId: p.id, projectName: p.name }))
  ).sort(byCatOrder)

  const uncheckedOrdered = groupByActivation(allTodos.filter(t => !t.checked))
  const sorted = hideCompleted
    ? uncheckedOrdered
    : [...uncheckedOrdered, ...allTodos.filter(t => t.checked)]
  const uncheckedCount = allTodos.filter(t => !t.checked).length
  const hasChecked = allTodos.some(t => t.checked)
  const checkedCount = allTodos.filter(t => t.checked).length

  const { onPointerDown } = useSwipe()

  const handleReorder = useCallback((newOrder) => {
    reorderCategoryTodos(category.id, newOrder)
  }, [reorderCategoryTodos, category.id])

  // Reorder groups: active (activated) and inactive (unchecked, not activated) each
  // reorder among themselves; completed todos are locked (null key).
  const todoGroupKeys = sorted.map(t => t.checked ? null : (t.activated ? 'active' : 'inactive'))
  const { onDragPointerDown } = useDragReorder(containerRef, sorted, handleReorder, todoGroupKeys)

  useEffect(() => {
    const card = cardRef.current
    if (card) requestAnimationFrame(() => card.classList.add('visible'))
  }, [])

  // FLIP after checkbox / activate reorders the list
  useLayoutEffect(() => {
    const flip = sortFlipRef.current
    if (!flip) return
    sortFlipRef.current = null
    document.body.offsetHeight
    const frames = flip.map(({ el, top }) => ({ el, dy: top - el.getBoundingClientRect().top })).filter(f => Math.abs(f.dy) > 1)
    if (!frames.length) return
    frames.forEach(({ el, dy }) => { el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)` })
    document.body.offsetHeight
    requestAnimationFrame(() => {
      frames.forEach(({ el }) => { el.style.transition = 'transform 350ms cubic-bezier(0.4,0,0.2,1)'; el.style.transform = '' })
      setTimeout(() => frames.forEach(({ el }) => { el.style.transition = '' }), 350)
    })
  }, [sorted.map(t => t.id + (t.checked ? 'c' : '') + (t.activated ? 'a' : '')).join(',')]) // eslint-disable-line

  // Animate checked items back in after "Show Completed"
  useLayoutEffect(() => {
    if (!showingRef.current) return
    showingRef.current = false
    const container = containerRef.current
    if (!container) return
    const wrappers = sorted.filter(t => t.checked).map(t =>
      container.querySelector(`[data-swipe-id="${t.id}"]`)?.parentElement
    ).filter(Boolean)
    if (!wrappers.length) return
    wrappers.forEach(el => { el.style.overflow = 'hidden'; el.style.maxHeight = '0'; el.style.opacity = '0'; el.style.transition = 'none' })
    document.body.offsetHeight
    requestAnimationFrame(() => {
      wrappers.forEach(el => { el.style.transition = 'max-height 220ms ease, opacity 180ms ease'; el.style.maxHeight = el.scrollHeight + 'px'; el.style.opacity = '1' })
      setTimeout(() => wrappers.forEach(el => { el.style.maxHeight = ''; el.style.overflow = ''; el.style.transition = ''; el.style.opacity = '' }), 220)
    })
  }, [hideCompleted]) // eslint-disable-line

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [menuOpen])

  useEffect(() => { if (!hasChecked) setMenuOpen(false) }, [hasChecked])

  const snapshotForFlip = () => {
    if (containerRef.current) {
      sortFlipRef.current = [...containerRef.current.children].map(el => ({ el, top: el.getBoundingClientRect().top }))
    }
  }

  const handleCheckboxDown = useCallback((e, id) => {
    e.stopPropagation()
    const row = e.currentTarget.closest('.swipe-row')
    if (row && (row.classList.contains('swiped-left') || row.classList.contains('swiped-right'))) {
      closeSwipeRow(row)
      checkTimers.current[`suppress_${id}`] = true
      return
    }
    checkTimers.current[`suppress_${id}`] = false
    checkPopping.current[id] = false
    const checkboxEl = e.currentTarget.querySelector('.checkbox')
    if (checkboxEl) {
      checkboxEl.getAnimations().forEach(a => { if (!(a.animationName || '').includes('orbit')) a.cancel() })
      checkboxEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.82)' }], { duration: 100, fill: 'forwards' })
    }
    checkTimers.current[id] = setTimeout(() => {}, 300)
  }, [])

  const handleCheckboxUp = useCallback((e, id, projectId) => {
    e.stopPropagation()
    if (checkTimers.current[`suppress_${id}`]) { checkTimers.current[`suppress_${id}`] = false; return }
    clearTimeout(checkTimers.current[id])
    const checkboxEl = e.currentTarget.querySelector('.checkbox')
    const item = allTodos.find(t => t.id === id)
    const isChecked = item?.checked
    const attachedNoteIds = item?.linkedNoteIds || []
    if (!checkboxEl) { snapshotForFlip(); toggleProjectTodo(category.id, projectId, id); if (!isChecked) promptArchiveAttachments(category.id, projectId, attachedNoteIds); return }
    checkPopping.current[id] = true
    const popAnim = checkboxEl.animate(
      [{ transform: 'scale(0.82)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
      { duration: 320, easing: 'ease', fill: 'forwards' }
    )
    popAnim.onfinish = () => checkboxEl.getAnimations().forEach(a => { if (!(a.animationName || '').includes('orbit')) a.cancel() })
    if (!isChecked) {
      checkboxEl.classList.add('checked')
      const todoRow = e.currentTarget.closest('.todo-row')
      todoRow?.classList.add('checked')
      if (todoRow) {
        const rgb = getComputedStyle(todoRow).getPropertyValue('--accent-base-rgb').trim() || '96,119,135'
        todoRow.animate([{ background: `rgba(${rgb},0)` }, { background: `rgba(${rgb},0.18)`, offset: 0.2 }, { background: `rgba(${rgb},0)` }], { duration: 500, easing: 'ease', fill: 'none' })
      }
      setTimeout(() => { snapshotForFlip(); toggleProjectTodo(category.id, projectId, id); promptArchiveAttachments(category.id, projectId, attachedNoteIds) }, 500)
    } else {
      snapshotForFlip()
      toggleProjectTodo(category.id, projectId, id)
    }
  }, [allTodos, category.id, toggleProjectTodo, promptArchiveAttachments])

  const handleActivate = useCallback((id, projectId, row) => {
    closeSwipeRow(row)
    const wrapper = row?.parentElement
    if (wrapper) {
      wrapper.animate(
        [{ background: 'rgba(var(--accent-base-rgb),0)' }, { background: 'rgba(var(--accent-base-rgb),0.55)', offset: 0.4 }, { background: 'rgba(var(--accent-base-rgb),0)' }],
        { duration: 280, fill: 'none' }
      )
    }
    setTimeout(() => { snapshotForFlip(); toggleProjectTodoActivated(category.id, projectId, id) }, 280)
  }, [category.id, toggleProjectTodoActivated])

  const handleDelete = useCallback((id, projectId, row) => {
    const wrapper = row?.parentElement
    if (!wrapper) { deleteProjectTodo(category.id, projectId, id); return }
    wrapper.animate([{ background: 'rgba(178,74,74,0)' }, { background: 'rgba(178,74,74,0.20)', offset: 0.4 }, { background: 'rgba(178,74,74,0)' }], { duration: 280, fill: 'none' })
    setTimeout(() => {
      const height = wrapper.getBoundingClientRect().height
      wrapper.style.height = height + 'px'; wrapper.style.overflow = 'hidden'
      requestAnimationFrame(() => requestAnimationFrame(() => { wrapper.style.transition = 'height 220ms ease, opacity 180ms ease'; wrapper.style.height = '0'; wrapper.style.opacity = '0' }))
      setTimeout(() => deleteProjectTodo(category.id, projectId, id), 250)
    }, 180)
  }, [category.id, deleteProjectTodo])

  const onTodoTap = useCallback((e, id) => {
    if (e.target.closest('.swipe-action-btn') || e.target.closest('.checkbox-wrap')) return
    const row = e.currentTarget.closest('.swipe-row')
    if (!row) return
    if (row.classList.contains('swiped-left') || row.classList.contains('swiped-right')) return
    todoTapState.current = { startX: e.clientX, startY: e.clientY, moved: false }
    const onMove = (e2) => {
      const s = todoTapState.current
      if (Math.abs(e2.clientX - s.startX) > 8 || Math.abs(e2.clientY - s.startY) > 8) s.moved = true
    }
    const onUp = () => { if (!todoTapState.current.moved) setOpenTodoId(id); cleanup() }
    const cleanup = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [])

  const handleToggleHideCompleted = useCallback(() => {
    if (!hideCompleted) {
      const container = containerRef.current
      const wrappers = allTodos.filter(t => t.checked).map(t =>
        container?.querySelector(`[data-swipe-id="${t.id}"]`)?.parentElement
      ).filter(Boolean)
      wrappers.forEach(el => {
        el.style.overflow = 'hidden'; el.style.maxHeight = el.getBoundingClientRect().height + 'px'
        el.offsetHeight
        el.style.transition = 'max-height 200ms ease, opacity 150ms ease'; el.style.maxHeight = '0'; el.style.opacity = '0'
      })
      setTimeout(() => {
        wrappers.forEach(el => { el.style.maxHeight = ''; el.style.overflow = ''; el.style.transition = ''; el.style.opacity = '' })
        setHideCompleted(true)
        try { localStorage.setItem(`hc-cat-${category.id}`, 'true') } catch {}
      }, 210)
    } else {
      showingRef.current = true
      setHideCompleted(false)
      try { localStorage.setItem(`hc-cat-${category.id}`, 'false') } catch {}
    }
  }, [hideCompleted, allTodos, category.id])

  // Look up open todo across the category
  let openTodo = null, openTodoProj = null
  if (openTodoId != null) {
    for (const p of category.projects) {
      const t = p.todos.find(x => x.id === openTodoId)
      if (t) { openTodo = t; openTodoProj = p; break }
    }
  }

  return (
    <div className="card card-intro" ref={cardRef}>
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
                  {hideCompleted ? `Show ${checkedCount} Completed` : 'Hide Completed'}
                </button>
              </div>
          </div>
        )}
      </div>
      <div ref={containerRef}>
        {sorted.map((t, i) => (
          <div key={t.id}>
            {i > 0 && <div className="divider"/>}
            <div className="swipe-row" data-swipe-id={t.id}>
              <ActivateSwipeButton
                item={t} type="todo"
                onActivateTap={(_, id, row) => handleActivate(id, t.projectId, row)}
                onScheduleClear={(_, id, row) => clearSchedule(id, t.projectId, row)}
                onScheduleOpen={(_, item, el) => openSchedule(item, el)}
              />
              <button className="swipe-action-btn delete" onMouseDown={e => { e.preventDefault(); handleDelete(t.id, t.projectId, e.currentTarget.closest('.swipe-row')) }}>
                <div className="swipe-active-inner"><TrashIcon/></div>
              </button>
              <div className="swipe-content">
                <div
                  className={`todo-row${t.checked ? ' checked' : ''}`}
                  data-id={t.id}
                  onPointerDown={e => { onPointerDown(e, t.id); onTodoTap(e, t.id); onDragPointerDown(e, t.id) }}
                >
                  <div
                    className="checkbox-wrap"
                    onPointerDown={e => handleCheckboxDown(e, t.id)}
                    onPointerUp={e => handleCheckboxUp(e, t.id, t.projectId)}
                    onPointerLeave={e => {
                      clearTimeout(checkTimers.current[t.id])
                      if (!checkPopping.current[t.id]) {
                        e.currentTarget.querySelector('.checkbox')?.getAnimations().forEach(a => { if (!(a.animationName || '').includes('orbit')) a.cancel() })
                      }
                    }}
                  >
                    <div className={`checkbox${t.activated ? ' activated-checkbox' : ''}${t.checked ? ' checked' : ''}`}
                      style={{ '--cb-delay': `-${(String(t.id).split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 80) / 10}s`, '--cb-dir': (String(t.id).split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 2 ? 'reverse' : 'normal') }}>
                      <svg className="checkmark" width="16" height="16" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                  <div className="item-content">
                    <span className={`item-text${t.checked ? ' checked-text' : ''}`}>{t.text}</span>
                    <div className="source-label">
                      <span className="source-label-text">{t.projectName}</span>
                    </div>
                  </div>
                  {(t.scheduledDate && !t.activated) ? (
                    <span className="row-schedule-indicator"><CalendarIcon size={20}/></span>
                  ) : ((t.linkedNoteIds?.length || 0) + (t.linkedLinkIds?.length || 0)) > 0 && (
                    <span className="todo-attach-indicator">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M21 11.5l-8.6 8.6a5 5 0 01-7.07-7.07l8.6-8.6a3.33 3.33 0 014.71 4.71l-8.6 8.6a1.67 1.67 0 01-2.36-2.36l7.9-7.9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {openTodo && openTodoProj && createPortal(
        <TodoDetailPage
          todo={openTodo}
          categoryId={category.id}
          projectId={openTodoProj.id}
          projectNotes={openTodoProj.notes || []}
          projectLinks={openTodoProj.links || []}
          onClose={() => setOpenTodoId(null)}
        />,
        document.getElementById('app')
      )}

      {calFor && (
        <CalendarPopup
          anchorRect={calFor.anchorRect}
          initialDate={calFor.current}
          accent={accent}
          onSelect={(d) => setProjectTodoScheduled(category.id, calFor.projectId, calFor.id, d)}
          onClose={() => setCalFor(null)}
        />
      )}
    </div>
  )
}

// ============ Notes ============
function CollapsedNotesCard({ category }) {
  const { categories, deleteProjectNote, updateProjectNote, toggleProjectNoteActivated, reorderCategoryNotes, setProjectNoteScheduled, archiveProjectNote, unarchiveProjectNote, openDetail, setOpenDetail } = useAppContext()
  const categoryRef = useRef(category)
  categoryRef.current = category
  // Open-note state is shared via AppContext so footer-added notes can auto-open here.
  const openNoteId = openDetail?.type === 'note' ? openDetail.id : null
  const setOpenNoteId = (id) => setOpenDetail(id == null ? null : { type: 'note', id })
  const [calFor, setCalFor] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const [showArchived, setShowArchived] = useState(() => {
    try { return localStorage.getItem(`arch-cat-note-${category.id}`) === 'true' } catch { return false }
  })
  const cardRef = useRef(null)
  const containerRef = useRef(null)
  const accent = useMemo(() => {
    const idx = categories.findIndex(c => c.id === category.id)
    return idx === -1 ? null : getCategoryAccent(idx)
  }, [categories, category.id])
  const openSchedule = useCallback((item, el) => {
    closeSwipeRow(el?.closest('.swipe-row'))
    setCalFor({ id: item.id, projectId: item.projectId, current: item.scheduledDate || null, anchorRect: toAnchorRect(el) })
  }, [])
  const clearSchedule = useCallback((id, projectId, row) => { closeSwipeRow(row); setProjectNoteScheduled(category.id, projectId, id, null) }, [category.id, setProjectNoteScheduled])

  // Active notes across non-archived projects; archived ones are collected
  // separately and shown only when "Show Archived" is toggled on.
  const allNotes = groupByActivation(category.projects.filter(p => !p.archived).flatMap(p =>
    p.notes.filter(n => !n.archived).map(n => ({ ...n, projectId: p.id, projectName: p.name }))
  ).sort(byCatOrder))
  const archivedNotes = category.projects.filter(p => !p.archived).flatMap(p =>
    p.notes.filter(n => n.archived).map(n => ({ ...n, projectId: p.id, projectName: p.name }))
  ).sort(byCatOrder)
  const archivedNoteCount = archivedNotes.length
  const sortedNotes = showArchived ? [...allNotes, ...archivedNotes] : allNotes

  const { onPointerDown } = useSwipe()

  const handleReorder = useCallback((newOrder) => {
    reorderCategoryNotes(category.id, newOrder)
  }, [reorderCategoryNotes, category.id])

  // Archived rows are locked (null key) so they can't be dragged or mixed.
  const noteGroupKeys = sortedNotes.map(n => n.archived ? null : (n.activated ? 'active' : 'inactive'))
  const { onDragPointerDown } = useDragReorder(containerRef, sortedNotes, handleReorder, noteGroupKeys)

  useEffect(() => {
    const card = cardRef.current
    if (card) requestAnimationFrame(() => card.classList.add('visible'))
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleToggleShowArchived = useCallback(() => {
    setShowArchived(v => {
      const next = !v
      try { localStorage.setItem(`arch-cat-note-${category.id}`, next ? 'true' : 'false') } catch {}
      return next
    })
  }, [category.id])

  const handleRetrieve = useCallback((id, projectId, row) => {
    closeSwipeRow(row)
    const wrapper = row?.parentElement
    if (wrapper) {
      wrapper.animate(
        [{ background: 'rgba(var(--accent-base-rgb),0)' }, { background: 'rgba(var(--accent-base-rgb),0.55)', offset: 0.4 }, { background: 'rgba(var(--accent-base-rgb),0)' }],
        { duration: 280, fill: 'none' }
      )
    }
    unarchiveProjectNote(category.id, projectId, id)
  }, [category.id, unarchiveProjectNote])

  const handleActivate = useCallback((id, projectId, row) => {
    closeSwipeRow(row)
    const wrapper = row?.parentElement
    if (wrapper) {
      wrapper.animate(
        [{ background: 'rgba(var(--accent-base-rgb),0)' }, { background: 'rgba(var(--accent-base-rgb),0.55)', offset: 0.4 }, { background: 'rgba(var(--accent-base-rgb),0)' }],
        { duration: 280, fill: 'none' }
      )
    }
    toggleProjectNoteActivated(category.id, projectId, id)
  }, [category.id, toggleProjectNoteActivated])

  const handleArchive = useCallback((id, projectId, row) => {
    closeSwipeRow(row)
    const wrapper = row?.parentElement
    const finish = () => archiveProjectNote(category.id, projectId, id)
    if (wrapper) {
      wrapper.animate(
        [{ background: 'rgba(var(--accent-base-rgb),0)' }, { background: 'rgba(var(--accent-base-rgb),0.55)', offset: 0.4 }, { background: 'rgba(var(--accent-base-rgb),0)' }],
        { duration: 280, fill: 'none' }
      )
    }
    if (!wrapper) { finish(); return }
    setTimeout(() => {
      const height = wrapper.getBoundingClientRect().height
      wrapper.style.height = height + 'px'; wrapper.style.overflow = 'hidden'
      requestAnimationFrame(() => requestAnimationFrame(() => { wrapper.style.transition = 'height 220ms ease, opacity 180ms ease'; wrapper.style.height = '0'; wrapper.style.opacity = '0' }))
      setTimeout(finish, 250)
    }, 180)
  }, [category.id, archiveProjectNote])

  const handleDelete = useCallback((id, projectId, row) => {
    const wrapper = row?.parentElement
    if (!wrapper) { deleteProjectNote(category.id, projectId, id); return }
    wrapper.animate([{ background: 'rgba(178,74,74,0)' }, { background: 'rgba(178,74,74,0.20)', offset: 0.4 }, { background: 'rgba(178,74,74,0)' }], { duration: 280, fill: 'none' })
    setTimeout(() => {
      const height = wrapper.getBoundingClientRect().height
      wrapper.style.height = height + 'px'; wrapper.style.overflow = 'hidden'
      requestAnimationFrame(() => requestAnimationFrame(() => { wrapper.style.transition = 'height 220ms ease, opacity 180ms ease'; wrapper.style.height = '0'; wrapper.style.opacity = '0' }))
      setTimeout(() => deleteProjectNote(category.id, projectId, id), 250)
    }, 180)
  }, [category.id, deleteProjectNote])

  const noteTapState = useRef({})
  const onNoteTap = useCallback((e, id) => {
    if (e.target.closest('.swipe-action-btn')) return
    const row = e.currentTarget.closest('.swipe-row')
    if (!row) return
    if (row.classList.contains('swiped-left') || row.classList.contains('swiped-right')) return
    noteTapState.current = { startX: e.clientX, startY: e.clientY, moved: false }
    const onMove = (e2) => {
      const s = noteTapState.current
      if (Math.abs(e2.clientX - s.startX) > 8 || Math.abs(e2.clientY - s.startY) > 8) s.moved = true
    }
    const onUp = () => { if (!noteTapState.current.moved) setOpenNoteId(id); cleanup() }
    const cleanup = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [])

  let openNote = null, openNoteProj = null
  if (openNoteId != null) {
    for (const p of category.projects) {
      const n = p.notes.find(x => x.id === openNoteId)
      if (n) { openNote = n; openNoteProj = p; break }
    }
  }

  return (
    <div className="card card-intro" ref={cardRef}>
      <div className="card-header">
        <span className="card-title">Notes</span>
        {archivedNoteCount > 0 && (
          <div className="dots-menu-wrap" ref={menuRef}>
            <div className="dots-menu dots-menu-btn" onMouseDown={e => { e.preventDefault(); setMenuOpen(v => !v) }}>
              <span/><span/><span/>
            </div>
            <div className={`card-context-menu${menuOpen ? ' open' : ''}`}>
              <button className="card-context-item" onMouseDown={e => { e.preventDefault(); handleToggleShowArchived(); setMenuOpen(false) }}>
                {showArchived ? <EyeOffIcon/> : <EyeIcon/>}
                {showArchived ? 'Hide Archived' : `Show ${archivedNoteCount} Archived`}
              </button>
            </div>
          </div>
        )}
      </div>
      <div ref={containerRef}>
        {sortedNotes.map((n, i) => (
          <div key={n.id}>
            {i > 0 && <div className="divider"/>}
            <div className="swipe-row archivable" data-swipe-id={n.id} data-left-max="148">
              {!n.archived && (
                <ActivateSwipeButton
                  item={n} type="note"
                  onActivateTap={(_, id, row) => handleActivate(id, n.projectId, row)}
                  onScheduleClear={(_, id, row) => clearSchedule(id, n.projectId, row)}
                  onScheduleOpen={(_, item, el) => openSchedule(item, el)}
                />
              )}
              {n.archived ? (
                <button className="swipe-action-btn archive" onMouseDown={e => { e.preventDefault(); handleRetrieve(n.id, n.projectId, e.currentTarget.closest('.swipe-row')) }}>
                  <div className="swipe-active-inner"><RetrieveIcon/></div>
                </button>
              ) : (
                <button className="swipe-action-btn archive" onMouseDown={e => { e.preventDefault(); handleArchive(n.id, n.projectId, e.currentTarget.closest('.swipe-row')) }}>
                  <div className="swipe-active-inner"><ArchiveIcon/></div>
                </button>
              )}
              <button className="swipe-action-btn delete" onMouseDown={e => { e.preventDefault(); handleDelete(n.id, n.projectId, e.currentTarget.closest('.swipe-row')) }}>
                <div className="swipe-active-inner"><TrashIcon/></div>
              </button>
              <div className="swipe-content">
                <div
                  className={`note-row${n.archived ? ' archived' : ''}`}
                  data-note-id={n.id}
                  onPointerDown={e => { onPointerDown(e, n.id); onNoteTap(e, n.id); onDragPointerDown(e, n.id) }}
                >
                  <div className="checkbox-wrap" style={{ pointerEvents: 'none' }}>
                    <svg width="24" height="24" viewBox="0 0 20 22" fill="none">
                      <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" stroke={n.activated ? 'var(--accent-dark)' : '#7A7A7A'} strokeWidth="1" fill={n.activated ? 'var(--accent-light)' : 'none'}/>
                      <path d="M12 3v5h5" stroke={n.activated ? 'var(--accent-dark)' : '#7A7A7A'} strokeWidth="1" fill="none"/>
                      <line x1="5" y1="13" x2="15" y2="13" stroke={n.activated ? 'var(--accent-dark)' : '#7A7A7A'} strokeWidth="1" strokeLinecap="round"/>
                      <line x1="5" y1="16.5" x2="12" y2="16.5" stroke={n.activated ? 'var(--accent-dark)' : '#7A7A7A'} strokeWidth="1" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="item-content">
                    <NoteRowContent note={n} />
                    <div className="source-label">
                      <span className="source-label-text">{n.projectName}</span>
                    </div>
                  </div>
                  {(n.scheduledDate && !n.activated) && (
                    <span className="row-schedule-indicator"><CalendarIcon size={20}/></span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {openNote && openNoteProj && createPortal(
        <NoteDetailPage
          note={{ ...openNote, categoryId: category.id }}
          onClose={() => setOpenNoteId(null)}
          onSave={(noteId, html, text) => updateProjectNote(category.id, openNoteProj.id, noteId, html, text)}
          activated={!!openNote.activated}
          onToggleActive={() => toggleProjectNoteActivated(category.id, openNoteProj.id, openNote.id)}
          projectName={openNoteProj.name}
          categoryId={category.id}
          projectId={openNoteProj.id}
        />,
        document.getElementById('app')
      )}

      {calFor && (
        <CalendarPopup
          anchorRect={calFor.anchorRect}
          initialDate={calFor.current}
          accent={accent}
          onSelect={(d) => setProjectNoteScheduled(category.id, calFor.projectId, calFor.id, d)}
          onClose={() => setCalFor(null)}
        />
      )}
    </div>
  )
}

// ============ Links ============
function CollapsedLinksCard({ category }) {
  const { categories, deleteProjectLink, toggleProjectLinkActivated, setProjectLinkScheduled, archiveProjectLink, unarchiveProjectLink, reorderCategoryLinks, openDetail, setOpenDetail } = useAppContext()
  const openLinkId = openDetail?.type === 'link' ? openDetail.id : null
  const setOpenLinkId = (id) => setOpenDetail(id == null ? null : { type: 'link', id })
  const categoryRef = useRef(category)
  categoryRef.current = category
  const cardRef = useRef(null)
  const containerRef = useRef(null)
  const linkSwipeState = useRef({})
  const [calFor, setCalFor] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const [showArchived, setShowArchived] = useState(() => {
    try { return localStorage.getItem(`arch-cat-link-${category.id}`) === 'true' } catch { return false }
  })
  const accent = useMemo(() => {
    const idx = categories.findIndex(c => c.id === category.id)
    return idx === -1 ? null : getCategoryAccent(idx)
  }, [categories, category.id])
  const openSchedule = useCallback((item, el) => {
    closeSwipeRow(el?.closest('.swipe-row'))
    setCalFor({ id: item.id, projectId: item.projectId, current: item.scheduledDate || null, anchorRect: toAnchorRect(el) })
  }, [])
  const clearSchedule = useCallback((id, projectId, row) => { closeSwipeRow(row); setProjectLinkScheduled(category.id, projectId, id, null) }, [category.id, setProjectLinkScheduled])

  // Active links across non-archived projects; archived shown only when toggled on.
  const allLinks = groupByActivation(category.projects.filter(p => !p.archived).flatMap(p =>
    p.links.filter(l => !l.archived).map(l => ({ ...l, projectId: p.id, projectName: p.name }))
  ).sort(byCatOrder))
  const archivedLinks = category.projects.filter(p => !p.archived).flatMap(p =>
    p.links.filter(l => l.archived).map(l => ({ ...l, projectId: p.id, projectName: p.name }))
  ).sort(byCatOrder)
  const archivedLinkCount = archivedLinks.length
  const sortedLinks = showArchived ? [...allLinks, ...archivedLinks] : allLinks

  const handleReorder = useCallback((newOrder) => {
    reorderCategoryLinks(category.id, newOrder)
  }, [reorderCategoryLinks, category.id])
  const linkGroupKeys = sortedLinks.map(l => l.archived ? null : (l.activated ? 'active' : 'inactive'))
  const { onDragPointerDown } = useDragReorder(containerRef, sortedLinks, handleReorder, linkGroupKeys)

  useEffect(() => {
    const card = cardRef.current
    if (card) requestAnimationFrame(() => card.classList.add('visible'))
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleToggleShowArchived = useCallback(() => {
    setShowArchived(v => {
      const next = !v
      try { localStorage.setItem(`arch-cat-link-${category.id}`, next ? 'true' : 'false') } catch {}
      return next
    })
  }, [category.id])

  const handleRetrieve = useCallback((id, projectId, row) => {
    closeSwipeRow(row)
    const wrapper = row?.parentElement
    if (wrapper) {
      wrapper.animate(
        [{ background: 'rgba(var(--accent-base-rgb),0)' }, { background: 'rgba(var(--accent-base-rgb),0.55)', offset: 0.4 }, { background: 'rgba(var(--accent-base-rgb),0)' }],
        { duration: 280, fill: 'none' }
      )
    }
    unarchiveProjectLink(category.id, projectId, id)
  }, [category.id, unarchiveProjectLink])

  const handleActivate = useCallback((id, projectId, row) => {
    closeSwipeRow(row)
    const wrapper = row?.parentElement
    if (wrapper) {
      wrapper.animate(
        [{ background: 'rgba(var(--accent-base-rgb),0)' }, { background: 'rgba(var(--accent-base-rgb),0.55)', offset: 0.4 }, { background: 'rgba(var(--accent-base-rgb),0)' }],
        { duration: 280, fill: 'none' }
      )
    }
    toggleProjectLinkActivated(category.id, projectId, id)
  }, [category.id, toggleProjectLinkActivated])

  const handleArchive = useCallback((id, projectId, row) => {
    closeSwipeRow(row)
    const wrapper = row?.parentElement
    const finish = () => archiveProjectLink(category.id, projectId, id)
    if (wrapper) {
      wrapper.animate(
        [{ background: 'rgba(var(--accent-base-rgb),0)' }, { background: 'rgba(var(--accent-base-rgb),0.55)', offset: 0.4 }, { background: 'rgba(var(--accent-base-rgb),0)' }],
        { duration: 280, fill: 'none' }
      )
    }
    if (!wrapper) { finish(); return }
    setTimeout(() => {
      const height = wrapper.getBoundingClientRect().height
      wrapper.style.height = height + 'px'; wrapper.style.overflow = 'hidden'
      requestAnimationFrame(() => requestAnimationFrame(() => { wrapper.style.transition = 'height 220ms ease, opacity 180ms ease'; wrapper.style.height = '0'; wrapper.style.opacity = '0' }))
      setTimeout(finish, 250)
    }, 180)
  }, [category.id, archiveProjectLink])

  const handleDelete = useCallback((id, projectId, row) => {
    const wrapper = row?.parentElement
    if (!wrapper) { deleteProjectLink(category.id, projectId, id); return }
    wrapper.animate([{ background: 'rgba(178,74,74,0)' }, { background: 'rgba(178,74,74,0.20)', offset: 0.4 }, { background: 'rgba(178,74,74,0)' }], { duration: 280, fill: 'none' })
    setTimeout(() => {
      const height = wrapper.getBoundingClientRect().height
      wrapper.style.height = height + 'px'; wrapper.style.overflow = 'hidden'
      requestAnimationFrame(() => requestAnimationFrame(() => { wrapper.style.transition = 'height 220ms ease, opacity 180ms ease'; wrapper.style.height = '0'; wrapper.style.opacity = '0' }))
      setTimeout(() => deleteProjectLink(category.id, projectId, id), 250)
    }, 180)
  }, [category.id, deleteProjectLink])

  const onLinkPointerDown = useCallback((e, id) => {
    if (e.target.closest('.swipe-action-btn') || e.target.closest('.link-outlink-btn')) return
    const row = e.currentTarget.closest('.swipe-row')
    if (!row) return
    if (row.classList.contains('swiped-left') || row.classList.contains('swiped-right')) return
    linkSwipeState.current = { startX: e.clientX, startY: e.clientY, dir: null }
    const onMove = (e2) => {
      const s = linkSwipeState.current
      const dx = e2.clientX - s.startX, dy = e2.clientY - s.startY
      if (!s.dir) {
        if (Math.abs(dy) > 8) { cleanup(); return }
        if (Math.abs(dx) > 10) s.dir = dx < 0 ? 'left' : 'right'
      }
    }
    const onUp = (e2) => {
      const s = linkSwipeState.current
      const dx = e2.clientX - s.startX, dy = e2.clientY - s.startY
      if (!s.dir && Math.abs(dx) < 8 && Math.abs(dy) < 8) setOpenLinkId(id)
      cleanup()
    }
    const cleanup = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [setOpenLinkId])

  const { onPointerDown } = useSwipe()

  let openLink = null, openLinkProj = null
  if (openLinkId != null) {
    for (const p of category.projects) {
      const l = p.links.find(x => x.id === openLinkId)
      if (l) { openLink = l; openLinkProj = p; break }
    }
  }

  return (
    <div className="card card-intro" ref={cardRef}>
      <div className="card-header">
        <span className="card-title">Links</span>
        {archivedLinkCount > 0 && (
          <div className="dots-menu-wrap" ref={menuRef}>
            <div className="dots-menu dots-menu-btn" onMouseDown={e => { e.preventDefault(); setMenuOpen(v => !v) }}>
              <span/><span/><span/>
            </div>
            <div className={`card-context-menu${menuOpen ? ' open' : ''}`}>
              <button className="card-context-item" onMouseDown={e => { e.preventDefault(); handleToggleShowArchived(); setMenuOpen(false) }}>
                {showArchived ? <EyeOffIcon/> : <EyeIcon/>}
                {showArchived ? 'Hide Archived' : `Show ${archivedLinkCount} Archived`}
              </button>
            </div>
          </div>
        )}
      </div>
      <div ref={containerRef}>
        {sortedLinks.map((l, i) => (
          <div key={l.id}>
            {i > 0 && <div className="divider"/>}
            <div className={`swipe-row archivable${l.id === openLinkId ? ' row-open' : ''}`} data-swipe-id={l.id} data-left-max="148">
              {!l.archived && (
                <ActivateSwipeButton
                  item={l} type="link"
                  onActivateTap={(_, id, row) => handleActivate(id, l.projectId, row)}
                  onScheduleClear={(_, id, row) => clearSchedule(id, l.projectId, row)}
                  onScheduleOpen={(_, item, el) => openSchedule(item, el)}
                />
              )}
              {l.archived ? (
                <button className="swipe-action-btn archive" onMouseDown={e => { e.preventDefault(); handleRetrieve(l.id, l.projectId, e.currentTarget.closest('.swipe-row')) }}>
                  <div className="swipe-active-inner"><RetrieveIcon/></div>
                </button>
              ) : (
                <button className="swipe-action-btn archive" onMouseDown={e => { e.preventDefault(); handleArchive(l.id, l.projectId, e.currentTarget.closest('.swipe-row')) }}>
                  <div className="swipe-active-inner"><ArchiveIcon/></div>
                </button>
              )}
              <button className="swipe-action-btn delete" onMouseDown={e => { e.preventDefault(); handleDelete(l.id, l.projectId, e.currentTarget.closest('.swipe-row')) }}>
                <div className="swipe-active-inner"><TrashIcon/></div>
              </button>
              <div className="swipe-content">
                <div
                  className={`note-row link-row${l.archived ? ' archived' : ''}`}
                  onPointerDown={e => { onPointerDown(e, l.id); onLinkPointerDown(e, l.id); onDragPointerDown(e, l.id) }}
                >
                  <div className="checkbox-wrap" style={{ pointerEvents: 'none' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      {l.activated && <circle cx="12" cy="12" r="8" fill="var(--accent-light)"/>}
                      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke={l.activated ? 'var(--accent-dark)' : '#7A7A7A'} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke={l.activated ? 'var(--accent-dark)' : '#7A7A7A'} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="item-content">
                    <span className="note-text">{l.title || displayUrl(l.url)}</span>
                    <div className="source-label">
                      <span className="source-label-text">{l.projectName}</span>
                    </div>
                  </div>
                  {(l.scheduledDate && !l.activated) && (
                    <span className="row-schedule-indicator"><CalendarIcon size={20}/></span>
                  )}
                  <OutlinkButton onOpen={() => openUrl(l.url)} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {openLink && openLinkProj && createPortal(
        <LinkDetailPage
          link={openLink}
          categoryId={category.id}
          projectId={openLinkProj.id}
          onClose={() => setOpenLinkId(null)}
        />,
        document.getElementById('app')
      )}

      {calFor && (
        <CalendarPopup
          anchorRect={calFor.anchorRect}
          initialDate={calFor.current}
          accent={accent}
          onSelect={(d) => setProjectLinkScheduled(category.id, calFor.projectId, calFor.id, d)}
          onClose={() => setCalFor(null)}
        />
      )}
    </div>
  )
}

// ============ Main collapsed view ============
export default function CategoryCollapsedView({ category }) {
  if (!category) return null
  const hasTodos = category.projects.some(p => p.todos.length > 0)
  const hasNotes = category.projects.some(p => p.notes.length > 0)
  const hasLinks = category.projects.some(p => p.links.length > 0)

  if (!hasTodos && !hasNotes && !hasLinks) {
    return (
      <div className="empty-state">
        <p>Nothing here yet</p>
      </div>
    )
  }

  return (
    <>
      {hasTodos && <CollapsedTodosCard category={category} />}
      {hasNotes && <CollapsedNotesCard category={category} />}
      {hasLinks && <CollapsedLinksCard category={category} />}
    </>
  )
}
