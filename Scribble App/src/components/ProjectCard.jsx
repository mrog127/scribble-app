import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppContext } from '../context/AppContext.jsx'
import { NoteDetailPage } from './NoteCard.jsx'

// ---- Swipe hook ----
function useSwipe() {
  const swipeState = useRef({})

  const onPointerDown = useCallback((e, id) => {
    if (e.target.closest('.swipe-action-btn') || e.target.closest('.checkbox-wrap')) return
    const row = e.currentTarget.closest('.swipe-row')
    if (!row) return
    swipeState.current = { id, startX: e.clientX, startY: e.clientY, row, dir: null }

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
      const base = s.row.classList.contains('swiped-left') ? -72 : s.row.classList.contains('swiped-right') ? 72 : 0
      content.style.transition = 'none'
      content.style.transform = `translateX(${Math.max(-72, Math.min(72, base + dx))}px)`
    }

    const onUp = (e2) => {
      const s = swipeState.current
      if (!s.row) { cleanup(); return }
      const dx = e2.clientX - s.startX
      const content = s.row.querySelector('.swipe-content')
      if (!content) { cleanup(); return }
      content.style.transition = ''
      const total = (s.row.classList.contains('swiped-left') ? -72 : s.row.classList.contains('swiped-right') ? 72 : 0) + dx
      if (total < -36) { s.row.classList.add('swiped-left'); s.row.classList.remove('swiped-right'); content.style.transform = '' }
      else if (total > 36) { s.row.classList.add('swiped-right'); s.row.classList.remove('swiped-left'); content.style.transform = '' }
      else { s.row.classList.remove('swiped-left', 'swiped-right'); content.style.transform = '' }
      cleanup()
    }

    const cleanup = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [])

  return { onPointerDown }
}

// ---- Drag reorder hook ----
function useDragReorder(containerRef, items, onReorder, uncheckedCountProp) {
  const dragRef = useRef(null)
  const flipRef = useRef(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const ucRef = useRef(uncheckedCountProp)
  ucRef.current = uncheckedCountProp

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

    const start = (clientY) => {
      const container = containerRef.current
      if (!container) return false
      const snapshots = [...container.children].map(w => {
        const sr = w.querySelector('.swipe-row[data-swipe-id]')
        return sr ? { el: sr, wrapper: w, id: +sr.dataset.swipeId, rect: sr.getBoundingClientRect() } : null
      }).filter(Boolean)
      const dragIdx = snapshots.findIndex(s => s.id === id)
      if (dragIdx < 0) return false
      const uc = ucRef.current
      const uncheckedCount = uc !== undefined ? uc : snapshots.length
      if (uc !== undefined && dragIdx >= uncheckedCount) return false
      const dragged = snapshots[dragIdx]
      const appEl = document.getElementById('app'), portal = document.getElementById('animation-portal')
      if (!appEl || !portal) return false
      const appRect = appEl.getBoundingClientRect()
      const cloneTop = dragged.rect.top - appRect.top - 4
      let topBound = -Infinity, bottomBound = Infinity
      if (uc !== undefined && uncheckedCount > 0) {
        topBound = snapshots[0].rect.top - appRect.top - 4
        const lastUnchecked = snapshots[uncheckedCount - 1]
        bottomBound = (lastUnchecked.rect.top + lastUnchecked.rect.height) - appRect.top - dragged.wrapper.getBoundingClientRect().height - 4
      }
      const cloneInner = dragged.el.cloneNode(true)
      cloneInner.style.cssText = 'pointer-events:none;background:#F7F6F3;'
      const clone = document.createElement('div')
      clone.style.cssText = ['position:absolute', `left:${dragged.rect.left - appRect.left - 4}px`, `top:${cloneTop}px`, `width:${dragged.rect.width + 8}px`, 'padding:4px 0', 'pointer-events:none', 'box-shadow:0 4px 20px rgba(0,0,0,0.10)', 'border-radius:8px', 'border:1px solid #C2C1BF', 'background:#F7F6F3', 'overflow:hidden', 'z-index:999'].join(';')
      clone.appendChild(cloneInner)
      portal.appendChild(clone)
      dragged.wrapper.style.opacity = '0'
      dragRef.current = { clone, snapshots, dragIdx, currentIdx: dragIdx, cloneTop, startY: clientY, draggedH: dragged.wrapper.getBoundingClientRect().height, uncheckedCount, topBound, bottomBound }
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

    const applyShifts = (snapshots, dragIdx, newIdx, draggedH, uncheckedCount) => {
      snapshots.forEach((snap, i) => {
        if (i === dragIdx) return
        if (i >= uncheckedCount) return
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
      if (!started) { if (dy < 12 || dx > dy) return; doStart(e2.clientY, false); if (!started) return }
      const s = dragRef.current
      if (!s) return
      const rawTop = s.cloneTop + (e2.clientY - s.startY)
      s.clone.style.top = (s.topBound > -Infinity ? Math.max(s.topBound, Math.min(s.bottomBound, rawTop)) : rawTop) + 'px'
      const targetSnaps = s.snapshots.slice(0, s.uncheckedCount)
      const nonDragged = targetSnaps.filter((_, i) => i !== s.dragIdx)
      let insertAt = nonDragged.length
      for (let j = 0; j < nonDragged.length; j++) { if (e2.clientY < nonDragged[j].rect.top + nonDragged[j].rect.height / 2) { insertAt = j; break } }
      const newIdx = Math.min(insertAt, s.uncheckedCount - 1)
      if (newIdx !== s.currentIdx) { s.currentIdx = newIdx; applyShifts(s.snapshots, s.dragIdx, s.currentIdx, s.draggedH, s.uncheckedCount) }
    }

    const onUp = () => {
      clearTimeout(longPressTimer); longPressTimer = null
      document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp)
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
      const hidden = allItems.filter(it => !visibleSet.has(it.id))
      const newOrder = [...visibleIds.map(sid => allItems.find(it => it.id === sid)).filter(Boolean), ...hidden]
      flipRef.current = s.snapshots.map((snap, i) => ({ el: snap.wrapper, fromTop: fromTops[i] }))
      onReorder(newOrder)
    }

    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp)
  }, [containerRef, onReorder])

  return { onDragPointerDown }
}

// ---- Icons ----
function ListIcon({ active }) {
  const c = active ? '#3F5999' : '#595959'
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="5" cy="7" r="1.6" fill={c}/>
      <line x1="9" y1="7" x2="21" y2="7" stroke={c} strokeWidth="1.9" strokeLinecap="round"/>
      <circle cx="5" cy="13" r="1.6" fill={c}/>
      <line x1="9" y1="13" x2="21" y2="13" stroke={c} strokeWidth="1.9" strokeLinecap="round"/>
      <circle cx="5" cy="19" r="1.6" fill={c}/>
      <line x1="9" y1="19" x2="15" y2="19" stroke={c} strokeWidth="1.9" strokeLinecap="round"/>
    </svg>
  )
}

function NoteIcon({ active }) {
  const c = active ? '#3F5999' : '#595959'
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M4 4h10l6 6v12a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" stroke={c} strokeWidth="1.8" strokeLinejoin="round" fill="none"/>
      <path d="M14 4v6h6" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/>
      <line x1="6" y1="15" x2="18" y2="15" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="6" y1="18.5" x2="14" y2="18.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function LinkIcon({ active }) {
  const c = active ? '#3F5999' : '#595959'
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <polyline points="3 6 5 6 21 6" stroke="#B24A4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="#B24A4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 11v6M14 11v6" stroke="#B24A4A" strokeWidth="2" strokeLinecap="round"/>
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="#B24A4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ActivateIcon({ activated }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <polygon
        points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
        stroke="#3F5999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        fill={activated ? 'rgba(105,147,254,0.3)' : 'none'}
      />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 16 L10 4" stroke="#3F5999" strokeWidth="2" strokeLinecap="round"/>
      <path d="M4 9 L10 3 L16 9" stroke="#3F5999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ---- Main component ----
export default function ProjectCard({ categoryId, project }) {
  const [activeTab, setActiveTab] = useState('list')
  const [inputValue, setInputValue] = useState('')
  const [inputFocused, setInputFocused] = useState(false)
  const [openNoteId, setOpenNoteId] = useState(null)
  const [addAsActive, setAddAsActive] = useState(false)
  const [addType, setAddType] = useState('list')

  const cardRef = useRef(null)
  const todoContainerRef = useRef(null)
  const noteContainerRef = useRef(null)
  const linkContainerRef = useRef(null)
  const inputRef = useRef(null)
  const pendingAnim = useRef(null)
  const noteSwipeState = useRef({})
  const sortFlipRef = useRef(null) // positions captured before a checkbox toggle

  const {
    addProjectTodo, addProjectNote, addProjectLink,
    toggleProjectTodo, deleteProjectTodo, deleteProjectNote,
    deleteProjectLink, toggleProjectTodoActivated, toggleProjectNoteActivated,
    updateProjectNote, reorderProjectTodos, reorderProjectNotes
  } = useAppContext()

  const { onPointerDown } = useSwipe()

  // ---- Sorted todos: unchecked first, checked last ----
  const sortedTodos = [
    ...project.todos.filter(t => !t.checked),
    ...project.todos.filter(t => t.checked),
  ]
  const uncheckedCount = project.todos.filter(t => !t.checked).length

  // ---- Reorder handlers ----
  const handleTodoReorder = useCallback((newOrder) => {
    reorderProjectTodos(categoryId, project.id, newOrder)
  }, [categoryId, project.id, reorderProjectTodos])

  const handleNoteReorder = useCallback((newOrder) => {
    reorderProjectNotes(categoryId, project.id, newOrder)
  }, [categoryId, project.id, reorderProjectNotes])

  // ---- Drag reorder ----
  const { onDragPointerDown: onTodoDrag } = useDragReorder(todoContainerRef, sortedTodos, handleTodoReorder, uncheckedCount)
  const { onDragPointerDown: onNoteDrag } = useDragReorder(noteContainerRef, project.notes, handleNoteReorder, undefined)

  // ---- FLIP animation when checkbox re-sorts the list ----
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
  }, [sortedTodos])

  // ---- Which tabs have content ----
  const typesWithItems = ['list', 'note', 'link'].filter(t =>
    (t === 'list' && project.todos.length > 0) ||
    (t === 'note' && project.notes.length > 0) ||
    (t === 'link' && project.links.length > 0)
  )
  const showTabs = typesWithItems.length > 1
  const displayType = showTabs ? activeTab : (typesWithItems[0] || 'list')

  // ---- Card intro animation ----
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    requestAnimationFrame(() => { card.classList.add('visible') })
  }, [])

  // ---- Auto-correct activeTab if its type is empty ----
  useEffect(() => {
    if (typesWithItems.length > 0 && !typesWithItems.includes(activeTab)) {
      setActiveTab(typesWithItems[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typesWithItems.join(',')])

  // ---- Sync addType to displayType when input isn't focused ----
  useEffect(() => {
    if (!inputFocused) setAddType(displayType)
  }, [displayType, inputFocused])

  // ---- Clone fly animation when item is added ----
  useEffect(() => {
    if (!pendingAnim.current) return
    const anim = pendingAnim.current
    pendingAnim.current = null

    const container =
      anim.addType === 'list' ? todoContainerRef.current :
      anim.addType === 'note' ? noteContainerRef.current :
      linkContainerRef.current

    const portal = document.getElementById('animation-portal')
    const app = document.getElementById('app')
    if (!container || !portal || !app) return

    const wrappers = [...container.children]
    if (!wrappers.length) return
    const lastWrapper = wrappers[wrappers.length - 1]
    const toRect = lastWrapper.getBoundingClientRect()
    const appRect = app.getBoundingClientRect()
    const fromRect = anim.fromRect

    lastWrapper.style.opacity = '0'

    const clone = document.createElement('div')
    clone.style.cssText = [
      'position:absolute',
      `left:${fromRect.left - appRect.left}px`,
      `top:${fromRect.top - appRect.top}px`,
      `width:${toRect.width}px`,
      `height:${toRect.height}px`,
      'pointer-events:none',
      'z-index:9999',
      'overflow:hidden',
      'background:#F7F6F3',
      'border-radius:4px',
      'display:flex',
      'align-items:center',
      'padding:0 24px',
      'box-sizing:border-box',
    ].join(';')
    const label = document.createElement('span')
    label.style.cssText = 'font-family:Open Sans,sans-serif;font-size:16px;font-weight:600;color:#3D3D3D;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
    label.textContent = anim.text
    clone.appendChild(label)
    portal.appendChild(clone)

    const dx = (toRect.left - appRect.left) - (fromRect.left - appRect.left)
    const dy = toRect.top - fromRect.top

    clone.animate([
      { transform: 'translate(0,0)', opacity: 0.9 },
      { transform: `translate(${dx}px,${dy}px)`, opacity: 0, offset: 0.82 },
      { transform: `translate(${dx}px,${dy}px)`, opacity: 0 },
    ], { duration: 360, easing: 'cubic-bezier(0.4,0,0.2,1)', fill: 'forwards' }).addEventListener('finish', () => {
      clone.remove()
      lastWrapper.style.transition = 'opacity 150ms ease'
      lastWrapper.style.opacity = '1'
      setTimeout(() => { if (lastWrapper) lastWrapper.style.transition = '' }, 150)
    })
  }, [project.todos, project.notes, project.links])

  // ---- Handlers ----
  const handleDelete = useCallback((type, id, rowEl) => {
    const wrapper = rowEl?.parentElement
    if (wrapper) {
      wrapper.animate(
        [{ background: 'rgba(178,74,74,0)' }, { background: 'rgba(178,74,74,0.20)', offset: 0.4 }, { background: 'rgba(178,74,74,0)' }],
        { duration: 280, fill: 'none' }
      )
      setTimeout(() => {
        const height = wrapper.getBoundingClientRect().height
        wrapper.style.height = height + 'px'; wrapper.style.overflow = 'hidden'
        requestAnimationFrame(() => requestAnimationFrame(() => {
          wrapper.style.transition = 'height 220ms ease, opacity 180ms ease'
          wrapper.style.height = '0'; wrapper.style.opacity = '0'
        }))
        setTimeout(() => {
          if (type === 'todo') deleteProjectTodo(categoryId, project.id, id)
          else if (type === 'note') deleteProjectNote(categoryId, project.id, id)
          else if (type === 'link') deleteProjectLink(categoryId, project.id, id)
        }, 250)
      }, 180)
    } else {
      if (type === 'todo') deleteProjectTodo(categoryId, project.id, id)
      else if (type === 'note') deleteProjectNote(categoryId, project.id, id)
      else if (type === 'link') deleteProjectLink(categoryId, project.id, id)
    }
  }, [categoryId, project.id, deleteProjectTodo, deleteProjectNote, deleteProjectLink])

  const handleActivate = useCallback((type, id, row) => {
    if (type === 'todo') toggleProjectTodoActivated(categoryId, project.id, id)
    else if (type === 'note') toggleProjectNoteActivated(categoryId, project.id, id)
    if (row) {
      row.classList.remove('swiped-left', 'swiped-right')
      const content = row.querySelector('.swipe-content')
      if (content) { content.style.transition = ''; content.style.transform = '' }
    }
  }, [categoryId, project.id, toggleProjectTodoActivated, toggleProjectNoteActivated])

  const handleNoteSave = useCallback((noteId, html, text) => {
    updateProjectNote(categoryId, project.id, noteId, html, text)
  }, [updateProjectNote, categoryId, project.id])

  const onNotePointerDown = useCallback((e, id) => {
    if (e.target.closest('.swipe-action-btn')) return
    const row = e.currentTarget.closest('.swipe-row')
    if (!row) return
    noteSwipeState.current = { id, startX: e.clientX, startY: e.clientY, dir: null }
    const onMove = (e2) => {
      const s = noteSwipeState.current
      const dx = e2.clientX - s.startX, dy = e2.clientY - s.startY
      if (!s.dir) {
        if (Math.abs(dy) > 8) { cleanup(); return }
        if (Math.abs(dx) > 10) s.dir = dx < 0 ? 'left' : 'right'
      }
    }
    const onUp = (e2) => {
      const s = noteSwipeState.current
      const dx = e2.clientX - s.startX
      if (!s.dir && Math.abs(dx) < 8) setOpenNoteId(id)
      cleanup()
    }
    const cleanup = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [])

  const addItem = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    const inputEl = inputRef.current
    if (inputEl) pendingAnim.current = { fromRect: inputEl.getBoundingClientRect(), text, addType }
    if (addType === 'list') addProjectTodo(categoryId, project.id, text, addAsActive)
    else if (addType === 'note') addProjectNote(categoryId, project.id, text, addAsActive)
    else if (addType === 'link') addProjectLink(categoryId, project.id, text, addAsActive)
    setInputValue('')
    inputRef.current?.blur()
  }, [inputValue, addType, addAsActive, categoryId, project.id, addProjectTodo, addProjectNote, addProjectLink])

  const placeholder =
    displayType === 'list' ? 'Add a task...' :
    displayType === 'note' ? 'Add a note...' : 'Add a link...'

  const sendVisible = inputFocused || !!inputValue.trim()
  const openNote = project.notes.find(n => n.id === openNoteId)

  return (
    <>
      <div className="card project-card card-intro" ref={cardRef}>
        {/* Header */}
        <div className="card-header">
          <span className="card-title">{project.name}</span>
          <div className="dots-menu"><span/><span/><span/></div>
        </div>

        {/* Tab selector — only when 2+ content types have items */}
        {showTabs && (
          <div className="project-tab-bar">
            {typesWithItems.includes('list') && (
              <button
                className={`project-tab-btn${activeTab === 'list' ? ' selected' : ''}`}
                onMouseDown={e => { e.preventDefault(); setActiveTab('list') }}
              >
                <ListIcon active={activeTab === 'list'}/>
              </button>
            )}
            {typesWithItems.includes('note') && (
              <button
                className={`project-tab-btn${activeTab === 'note' ? ' selected' : ''}`}
                onMouseDown={e => { e.preventDefault(); setActiveTab('note') }}
              >
                <NoteIcon active={activeTab === 'note'}/>
              </button>
            )}
            {typesWithItems.includes('link') && (
              <button
                className={`project-tab-btn${activeTab === 'link' ? ' selected' : ''}`}
                onMouseDown={e => { e.preventDefault(); setActiveTab('link') }}
              >
                <LinkIcon active={activeTab === 'link'}/>
              </button>
            )}
          </div>
        )}

        {/* Items */}
        <div className="project-items">

          {/* ---- List (todos) ---- */}
          {displayType === 'list' && (
            <div ref={todoContainerRef}>
              {sortedTodos.map((t, i) => (
                <div key={t.id}>
                  {i > 0 && <div className="divider"/>}
                  <div className="swipe-row" data-swipe-id={t.id}>
                    <button className="swipe-action-btn active-tag" onMouseDown={e => { e.preventDefault(); handleActivate('todo', t.id, e.currentTarget.closest('.swipe-row')) }}>
                      <ActivateIcon activated={t.activated}/>
                      <span className="swipe-action-label active-tag">{t.activated ? 'Active' : 'Activate'}</span>
                    </button>
                    <button className="swipe-action-btn delete" onMouseDown={e => { e.preventDefault(); handleDelete('todo', t.id, e.currentTarget.closest('.swipe-row')) }}>
                      <TrashIcon/>
                      <span className="swipe-action-label delete">Delete</span>
                    </button>
                    <div className="swipe-content">
                      <div
                        className={`todo-row${t.checked ? ' checked' : ''}`}
                        data-id={t.id}
                        onPointerDown={e => { onPointerDown(e, t.id); onTodoDrag(e, t.id) }}
                      >
                        <div className="checkbox-wrap" onMouseDown={e => {
                          e.stopPropagation()
                          // Capture wrapper positions for FLIP before the sort changes
                          if (todoContainerRef.current) {
                            sortFlipRef.current = [...todoContainerRef.current.children].map(el => ({
                              el, top: el.getBoundingClientRect().top
                            }))
                          }
                          toggleProjectTodo(categoryId, project.id, t.id)
                        }}>
                          <div className={`checkbox${t.checked ? ' checked' : ''}`}>
                            <svg className="checkmark" width="16" height="16" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        </div>
                        <div className="item-content">
                          <span className={`item-text${t.checked ? ' checked-text' : ''}`}>{t.text}</span>
                        </div>
                        {t.activated && (
                          <div className="activated-indicator" title="Active">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <polygon points="6,1 7.27,4.27 10.85,4.63 8.3,6.9 9.09,10.4 6,8.5 2.91,10.4 3.7,6.9 1.15,4.63 4.73,4.27" fill="rgba(105,147,254,0.4)" stroke="#3F5999" strokeWidth="1.5" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ---- Notes ---- */}
          {displayType === 'note' && (
            <div ref={noteContainerRef}>
              {project.notes.map((n, i) => (
                <div key={n.id}>
                  {i > 0 && <div className="divider"/>}
                  <div className="swipe-row" data-swipe-id={n.id}>
                    <button className="swipe-action-btn active-tag" onMouseDown={e => { e.preventDefault(); handleActivate('note', n.id, e.currentTarget.closest('.swipe-row')) }}>
                      <ActivateIcon activated={n.activated}/>
                      <span className="swipe-action-label active-tag">{n.activated ? 'Active' : 'Activate'}</span>
                    </button>
                    <button className="swipe-action-btn delete" onMouseDown={e => { e.preventDefault(); handleDelete('note', n.id, e.currentTarget.closest('.swipe-row')) }}>
                      <TrashIcon/>
                      <span className="swipe-action-label delete">Delete</span>
                    </button>
                    <div className="swipe-content">
                      <div
                        className="note-row"
                        data-note-id={n.id}
                        onPointerDown={e => { onPointerDown(e, n.id); onNotePointerDown(e, n.id); onNoteDrag(e, n.id) }}
                      >
                        <div className="item-content">
                          <span className="note-text">{n.text}</span>
                        </div>
                        {n.activated && (
                          <div className="activated-indicator" title="Active">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <polygon points="6,1 7.27,4.27 10.85,4.63 8.3,6.9 9.09,10.4 6,8.5 2.91,10.4 3.7,6.9 1.15,4.63 4.73,4.27" fill="rgba(105,147,254,0.4)" stroke="#3F5999" strokeWidth="1.5" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ---- Links ---- */}
          {displayType === 'link' && (
            <div ref={linkContainerRef}>
              {project.links.map((l, i) => (
                <div key={l.id}>
                  {i > 0 && <div className="divider"/>}
                  <div className="swipe-row" data-swipe-id={l.id}>
                    <button className="swipe-action-btn delete" onMouseDown={e => { e.preventDefault(); handleDelete('link', l.id, e.currentTarget.closest('.swipe-row')) }}>
                      <TrashIcon/>
                      <span className="swipe-action-label delete">Delete</span>
                    </button>
                    <div className="swipe-content">
                      <div className="note-row" onPointerDown={e => onPointerDown(e, l.id)}>
                        <div className="item-content">
                          <span className="note-text project-link-text">{l.title}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="project-input-wrap">
          <input
            ref={inputRef}
            className="project-input"
            placeholder={placeholder}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
          />
          <button
            className={`project-send-btn${sendVisible ? ' visible' : ''}`}
            onMouseDown={e => { e.preventDefault(); addItem() }}
          >
            <SendIcon/>
          </button>
        </div>

        {/* Footer toolbar — slides in on focus */}
        <div className={`project-footer-toolbar${inputFocused ? ' visible' : ''}`}>
          <button
            className={`project-active-btn${addAsActive ? ' on' : ''}`}
            onMouseDown={e => { e.preventDefault(); setAddAsActive(v => !v) }}
          >
            <ActivateIcon activated={addAsActive}/>
            <span>Active</span>
          </button>
          <button
            className={`project-type-btn${addType === 'list' ? ' selected' : ''}`}
            onMouseDown={e => { e.preventDefault(); setAddType('list') }}
          >
            <ListIcon active={addType === 'list'}/>
          </button>
          <button
            className={`project-type-btn${addType === 'note' ? ' selected' : ''}`}
            onMouseDown={e => { e.preventDefault(); setAddType('note') }}
          >
            <NoteIcon active={addType === 'note'}/>
          </button>
          <button
            className={`project-type-btn${addType === 'link' ? ' selected' : ''}`}
            onMouseDown={e => { e.preventDefault(); setAddType('link') }}
          >
            <LinkIcon active={addType === 'link'}/>
          </button>
        </div>
      </div>

      {openNote && createPortal(
        <NoteDetailPage
          note={openNote}
          onClose={() => setOpenNoteId(null)}
          onSave={handleNoteSave}
        />,
        document.getElementById('app')
      )}
    </>
  )
}
