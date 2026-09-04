import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import UnderlineSvg from '../assets/Underline.svg?react'
import { useAppContext } from '../context/AppContext.jsx'
import { getCategoryAccent } from '../theme.js'
import { NoteDetailPage } from './NoteCard.jsx'
import LinkDetailPage from './LinkDetailPage.jsx'
import { LinkGridCard, NoteRowContent, useGridDragReorder } from './ProjectCard.jsx'
import DetailFooter from './DetailFooter.jsx'
import MoveToCard from './MoveToCard.jsx'
import { keepKeyboardAlive } from '../keyboardKeeper.js'
import { pasteInto } from '../clipboard.js'
import { TrashMenuIcon } from './MenuIcons.jsx'
import { useRowMenu, RowActionMenu, isRowMenuOpen } from './RowMenu.jsx'
import { isRecurring } from './ScheduleBits.jsx'
import { useScrollable } from '../useScrollable.js'

// Strip the scheme for a cleaner one-line preview
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

// Plain-text preview from a note's paragraphs after the title
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

function NoteListIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="5" cy="7" r="1.6" fill="#595959"/>
      <line x1="9" y1="7" x2="21" y2="7" stroke="#595959" strokeWidth="1" strokeLinecap="round"/>
      <circle cx="5" cy="13" r="1.6" fill="#595959"/>
      <line x1="9" y1="13" x2="21" y2="13" stroke="#595959" strokeWidth="1" strokeLinecap="round"/>
      <circle cx="5" cy="19" r="1.6" fill="#595959"/>
      <line x1="9" y1="19" x2="15" y2="19" stroke="#595959" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

function PaperclipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M21 11.5l-8.6 8.6a5 5 0 01-7.07-7.07l8.6-8.6a3.33 3.33 0 014.71 4.71l-8.6 8.6a1.67 1.67 0 01-2.36-2.36l7.9-7.9"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function PlusIcon({ color = '#242424' }) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M16 8 L16 24 M8 16 L24 16" stroke={color} strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="mc-check" width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 12.5L9.5 18L20 6.5" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
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

function SendIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
      <path d="M10 16 L10 4" style={{ stroke: 'var(--accent-dark)' }} strokeWidth="1" strokeLinecap="round"/>
      <path d="M4 9 L10 3 L16 9" style={{ stroke: 'var(--accent-dark)' }} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// Row icons matching the project card note/link rows
function NoteRowIcon({ activated }) {
  const stroke = activated ? 'var(--accent-dark)' : '#7A7A7A'
  return (
    <svg width="24" height="24" viewBox="0 0 20 22" fill="none">
      <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" stroke={stroke} strokeWidth="1" fill={activated ? 'var(--accent-light)' : 'none'}/>
      <path d="M12 3v5h5" stroke={stroke} strokeWidth="1" fill="none"/>
      <line x1="5" y1="13" x2="15" y2="13" stroke={stroke} strokeWidth="1" strokeLinecap="round"/>
      <line x1="5" y1="16.5" x2="12" y2="16.5" stroke={stroke} strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

// ---- Inline composer (matches the project-card footer input) ----
function NoteComposer({ onAdd, autoFocus, onDismiss }) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { if (autoFocus) inputRef.current?.focus() }, [autoFocus])

  const submit = () => {
    const text = value.trim()
    if (!text) return
    onAdd(text, active)
    setValue('')
    // The new note opens into edit mode ~650ms later, on a timer — hold the
    // keyboard so focus can transfer to the editor when it does.
    keepKeyboardAlive()
    inputRef.current?.blur()
    if (onDismiss) onDismiss()
  }

  const sendVisible = focused || !!value.trim()

  return (
    <div className={`project-input-wrap${focused ? ' focused' : ''}`}>
      <div className="project-input-row">
        <input
          ref={inputRef}
          className="project-input"
          placeholder="Add a note"
          value={value}
          onChange={e => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => requestAnimationFrame(() => {
            setFocused(false)
            // The box only exists while it's being typed in
            if (!value.trim() && onDismiss) onDismiss()
          })}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
        />
        <button className={`project-send-btn${sendVisible ? ' visible' : ''}`} onMouseDown={e => { e.preventDefault(); submit() }}>
          <SendIcon/>
        </button>
      </div>
      <div className="project-input-bottom">
        <div className="project-input-divider"/>
        <div className="project-footer-toolbar">
          <div className="project-toolbar-left">
            <button
              className={`project-active-btn${active ? ' on' : ''}`}
              onMouseDown={e => { e.preventDefault(); setActive(v => !v) }}
            >
              <ActivateIcon activated={active}/>
              <span>{active ? 'Displayed' : 'Display'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LinkComposer({ onAdd, autoFocus, onDismiss }) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(false)
  const titleRef = useRef(null)
  const urlRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => { if (autoFocus) titleRef.current?.focus() }, [autoFocus])

  const submit = () => {
    const u = url.trim()
    if (!u) return
    onAdd(title.trim(), u, active)
    setTitle('')
    setUrl('')
    titleRef.current?.blur()
    urlRef.current?.blur()
    if (onDismiss) onDismiss()
  }

  const onBlur = () => requestAnimationFrame(() => {
    const ae = document.activeElement
    if (ae && wrapRef.current && wrapRef.current.contains(ae)) return
    setFocused(false)
    // The box only exists while it's being typed in
    if (!title.trim() && !url.trim() && onDismiss) onDismiss()
  })

  const sendVisible = focused || !!title.trim() || !!url.trim()

  return (
    <div className={`project-input-wrap link-mode${focused ? ' focused' : ''}`} ref={wrapRef}>
      <div className="project-input-row">
        <input
          ref={titleRef}
          className="project-input"
          placeholder={focused ? 'Title your link' : 'Add a link'}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={onBlur}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); urlRef.current?.focus() } }}
        />
        <button className={`project-send-btn${sendVisible ? ' visible' : ''}`} onMouseDown={e => { e.preventDefault(); submit() }}>
          <SendIcon/>
        </button>
      </div>
      <div className={`project-link-url-row${focused ? ' open' : ''}`}>
        <div className="project-input-divider"/>
        <input
          ref={urlRef}
          className="project-input project-link-url-input"
          placeholder="Add link"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={onBlur}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
          tabIndex={focused ? 0 : -1}
        />
        {!url && (
          <button
            className="paste-btn"
            tabIndex={focused ? 0 : -1}
            onMouseDown={e => { e.preventDefault(); pasteInto(setUrl, urlRef) }}
          >Paste</button>
        )}
      </div>
      <div className="project-input-bottom">
        <div className="project-input-divider"/>
        <div className="project-footer-toolbar">
          <div className="project-toolbar-left">
            <button
              className={`project-active-btn${active ? ' on' : ''}`}
              onMouseDown={e => { e.preventDefault(); setActive(v => !v) }}
            >
              <ActivateIcon activated={active}/>
              <span>{active ? 'Displayed' : 'Display'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AttachedNoteRow({ note, divider, onOpen, onPointerDown, onDragPointerDown, onMenuDown, onContextMenu }) {
  return (
    <>
    {divider && <div className="divider"/>}
    <div className="todo-attach-row-wrap" data-attach-id={note.id}>
      <div className="todo-swipe-row swipe-row">
        <div
          className="todo-swipe-content swipe-content"
          onPointerDown={e => { onMenuDown(e); onPointerDown(e, onOpen); onDragPointerDown && onDragPointerDown(e, note.id) }}
          onContextMenu={onContextMenu}
        >
          <div className={`note-row${note.archived ? ' archived' : ''}`}>
            <div className="checkbox-wrap" style={{ pointerEvents: 'none' }}>
              <NoteRowIcon activated={note.activated}/>
            </div>
            <div className="item-content">
              <NoteRowContent note={note}/>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}

// Collapse / expand a section card from its header, exactly as a canvas card does:
// the body animates its height over 250ms and the state persists per section.
function useSectionCollapse(storageKey) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(storageKey) === 'true' } catch { return false }
  })
  const bodyRef = useRef(null)
  const mountedRef = useRef(false)

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    // First run: apply the persisted state with no animation.
    if (!mountedRef.current) {
      mountedRef.current = true
      if (collapsed) { el.style.height = '0px'; el.style.overflow = 'hidden' }
      return
    }
    const full = el.scrollHeight
    el.style.overflow = 'hidden'
    el.style.height = (collapsed ? full : 0) + 'px'
    el.offsetHeight // force reflow
    el.style.transition = 'height 250ms ease'
    el.style.height = (collapsed ? 0 : full) + 'px'
    const done = (e) => {
      if (e && e.propertyName !== 'height') return
      el.style.transition = ''
      if (!collapsed) { el.style.height = ''; el.style.overflow = '' }
      el.removeEventListener('transitionend', done)
    }
    el.addEventListener('transitionend', done)
    return () => el.removeEventListener('transitionend', done)
  }, [collapsed])

  const onHeaderClick = useCallback((e) => {
    if (e.target.closest('button, input, .card-context-menu')) return
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(storageKey, next ? 'true' : 'false') } catch {}
      return next
    })
  }, [storageKey])

  return { collapsed, bodyRef, onHeaderClick }
}

// Long-press drag-reorder for a todo's attached note/link rows (a flat list).
// Operates on `.todo-attach-row-wrap[data-attach-id]` children of containerRef.
function useAttachDrag(containerRef, items, onReorder) {
  const dragRef = useRef(null)
  const flipRef = useRef(null)
  const itemsRef = useRef(items)
  itemsRef.current = items

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
    const startX = e.clientX, startY = e.clientY
    let started = false, longPressTimer = null
    const preventScroll = (ev) => { if (started) ev.preventDefault() }

    const start = () => {
      const container = containerRef.current
      if (!container) return false
      const rows = [...container.children].filter(c => c.classList && c.classList.contains('todo-attach-row-wrap'))
      const snapshots = rows.map(el => ({ el, id: el.dataset.attachId, rect: el.getBoundingClientRect() }))
      const dragIdx = snapshots.findIndex(s => String(s.id) === String(id))
      if (dragIdx < 0) return false
      const dragged = snapshots[dragIdx]
      const appEl = document.getElementById('app'), portal = document.getElementById('animation-portal')
      if (!appEl || !portal) return false
      const appRect = appEl.getBoundingClientRect()
      const cloneTop = dragged.rect.top - appRect.top
      const cloneInner = dragged.el.cloneNode(true)
      cloneInner.style.cssText = 'pointer-events:none;background:#F7F6F3;'
      const clone = document.createElement('div')
      clone.style.cssText = ['position:absolute', `left:${dragged.rect.left - appRect.left - 17}px`, `top:${cloneTop}px`, `width:${dragged.rect.width}px`, 'padding:0 16px', 'pointer-events:none', 'box-shadow:0 4px 20px rgba(0,0,0,0.10)', 'border-radius:8px', 'border:1px solid #C2C1BF', 'background:#F7F6F3', 'overflow:hidden', 'z-index:999'].join(';')
      clone.appendChild(cloneInner)
      portal.appendChild(clone)
      dragged.el.style.opacity = '0'
      // The clone can't travel above the first row or below the last one
      const firstTop = snapshots[0].rect.top
      const lastBottom = snapshots[snapshots.length - 1].rect.bottom
      const minTop = firstTop - appRect.top
      const maxTop = lastBottom - dragged.rect.height - appRect.top
      dragRef.current = { clone, snapshots, dragIdx, currentIdx: dragIdx, cloneTop, startY, draggedH: dragged.rect.height, minTop, maxTop }
      return true
    }

    longPressTimer = setTimeout(() => { longPressTimer = null; started = start() }, 250)
    document.addEventListener('touchmove', preventScroll, { passive: false })

    const applyShifts = (s) => {
      s.snapshots.forEach((snap, i) => {
        if (i === s.dragIdx) return
        let dy = 0
        if (s.currentIdx < s.dragIdx && i >= s.currentIdx && i < s.dragIdx) dy = s.draggedH
        if (s.currentIdx > s.dragIdx && i > s.dragIdx && i <= s.currentIdx) dy = -s.draggedH
        snap.el.style.transition = 'transform 180ms ease'
        snap.el.style.transform = dy ? `translateY(${dy}px)` : ''
      })
    }

    const onMove = (e2) => {
      const dx = Math.abs(e2.clientX - startX), dy = Math.abs(e2.clientY - startY)
      if (longPressTimer && (dx > 8 || dy > 8)) { clearTimeout(longPressTimer); longPressTimer = null; document.removeEventListener('touchmove', preventScroll) }
      if (!started) return
      e2.preventDefault()
      const s = dragRef.current
      if (!s) return
      const wanted = s.cloneTop + (e2.clientY - s.startY)
      s.clone.style.top = Math.max(s.minTop, Math.min(s.maxTop, wanted)) + 'px'
      const nonDragged = s.snapshots.filter((_, i) => i !== s.dragIdx)
      let insertAt = nonDragged.length
      for (let j = 0; j < nonDragged.length; j++) { if (e2.clientY < nonDragged[j].rect.top + nonDragged[j].rect.height / 2) { insertAt = j; break } }
      const newIdx = Math.min(insertAt, s.snapshots.length - 1)
      if (newIdx !== s.currentIdx) { s.currentIdx = newIdx; applyShifts(s) }
    }

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove, { passive: false })
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('touchmove', preventScroll)
    }
    const reset = (s) => s.snapshots.forEach(snap => { snap.el.style.transition = ''; snap.el.style.transform = ''; snap.el.style.opacity = '' })
    const onCancel = () => {
      clearTimeout(longPressTimer); longPressTimer = null; cleanup()
      const s = dragRef.current; if (!s) return; dragRef.current = null
      s.clone.remove(); reset(s)
    }
    const onUp = () => {
      clearTimeout(longPressTimer); longPressTimer = null; cleanup()
      const s = dragRef.current; if (!s || !started) return; dragRef.current = null
      if (s.currentIdx === s.dragIdx) { s.clone.remove(); reset(s); return }
      const cloneReleaseTop = s.clone.getBoundingClientRect().top
      const fromTops = s.snapshots.map((snap, i) => i === s.dragIdx ? cloneReleaseTop : snap.el.getBoundingClientRect().top)
      s.clone.remove()
      const ids = s.snapshots.map(sn => sn.id)
      const [moved] = ids.splice(s.dragIdx, 1)
      ids.splice(s.currentIdx, 0, moved)
      flipRef.current = s.snapshots.map((snap, i) => ({ el: snap.el, fromTop: fromTops[i] }))
      onReorder(ids)
    }

    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
  }, [containerRef, onReorder])

  return { onDragPointerDown }
}

export default function TodoDetailPage({ todo, categoryId, projectId, projectNotes, projectLinks, onClose, archived = false }) {
  const {
    categories,
    toggleProjectTodo,
    promptArchiveAttachments,
    toggleProjectTodoActivated,
    toggleProjectNoteActivated,
    setProjectTodoScheduled,
    setProjectNoteScheduled,
    updateProjectTodoText,
    updateProjectTodoComment,
    attachNoteToTodo, detachNoteFromTodo,
    attachLinkToTodo, detachLinkFromTodo,
    addTodoNote, addTodoLink,
    reorderTodoNotes, reorderTodoLinks,
    moveProjectTodo,
    promptMoveAttachments,
    updateProjectNote,
    setAutoEditNoteId,
    promptDelete,
    deleteProjectTodo,
  } = useAppContext()

  const projectName = useMemo(
    () => categories.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)?.name || '',
    [categories, categoryId, projectId]
  )

  const [isOpen, setIsOpen] = useState(false)
  const [noteAttachOpen, setNoteAttachOpen] = useState(false)
  const [noteComposerOpen, setNoteComposerOpen] = useState(false)
  const [linkComposerOpen, setLinkComposerOpen] = useState(false)
  const noteSection = useSectionCollapse(`collapsed-todo-${todo.id}-notes`)
  const linkSection = useSectionCollapse(`collapsed-todo-${todo.id}-links`)
  const [linkAttachOpen, setLinkAttachOpen] = useState(false)
  const [openNoteId, setOpenNoteId] = useState(null)
  const [openAttachLinkId, setOpenAttachLinkId] = useState(null)
  const titleRef = useRef(null)
  const commentRef = useRef(null)
  const completeBtnRef = useRef(null)
  const flashRef = useRef(null)
  const completePressed = useRef(false)
  const scrollRef = useRef(null)
  const scrollTitleRef = useRef(null)
  const pageRef = useRef(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveTop, setMoveTop] = useState(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingComment, setEditingComment] = useState(false)
  const pendingCommentFocus = useRef(false)

  const openMove = useCallback(() => {
    const titleEl = titleRef.current
    const pageEl = pageRef.current
    if (titleEl && pageEl) {
      const pageH = pageEl.getBoundingClientRect().height
      const top = titleEl.getBoundingClientRect().bottom - pageEl.getBoundingClientRect().top + 16
      // Cap at the screen midpoint so the card keeps a minimum height (footer → halfway)
      setMoveTop(Math.min(Math.max(72, top), pageH / 2))
    }
    setMoveOpen(true)
  }, [])

  const saveMove = useCallback((sel) => {
    setMoveOpen(false)
    if (sel.categoryId === categoryId && sel.projectId === projectId) return
    const noteCount = (todo.linkedNoteIds || []).length
    const linkCount = (todo.linkedLinkIds || []).length
    if (noteCount + linkCount > 0) {
      const destName = categories.find(c => c.id === sel.categoryId)?.projects.find(p => p.id === sel.projectId)?.name || 'the new canvas'
      promptMoveAttachments({ noteCount, linkCount, destName }, (moveAttach) => {
        moveProjectTodo(categoryId, projectId, sel.categoryId, sel.projectId, todo.id, { moveAttachments: moveAttach })
      })
    } else {
      moveProjectTodo(categoryId, projectId, sel.categoryId, sel.projectId, todo.id)
    }
  }, [categoryId, projectId, todo.id, todo.linkedNoteIds, todo.linkedLinkIds, categories, moveProjectTodo, promptMoveAttachments])

  // Press down: shrink (subtly) and hold while pressed, drop the shadow
  const completeDown = useCallback(() => {
    if (archived) return
    const el = completeBtnRef.current
    if (!el) return
    completePressed.current = true
    el.style.boxShadow = 'none'
    el.getAnimations().forEach(a => { if (!(a.animationName || '').includes('orbit')) a.cancel() })
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.91)' }], { duration: 100, fill: 'forwards' })
  }, [archived])

  // Release: spring big -> settle back, toggle, and flash the page on check
  const completeUp = useCallback(() => {
    if (archived) return
    if (!completePressed.current) return
    completePressed.current = false
    const el = completeBtnRef.current
    if (el) {
      el.style.boxShadow = ''
      el.getAnimations().forEach(a => { if (!(a.animationName || '').includes('orbit')) a.cancel() })
      el.animate(
        [{ transform: 'scale(0.91)' }, { transform: 'scale(1.125)', offset: 0.5 }, { transform: 'scale(0.95)', offset: 0.78 }, { transform: 'scale(1)' }],
        { duration: 340, easing: 'ease', fill: 'none' }
      )
    }
    if (!todo.checked && flashRef.current) {
      const rgb = getComputedStyle(flashRef.current).getPropertyValue('--accent-base-rgb').trim() || '96,119,135'
      flashRef.current.animate(
        [{ background: `rgba(${rgb},0)` }, { background: `rgba(${rgb},0.18)`, offset: 0.2 }, { background: `rgba(${rgb},0)` }],
        { duration: 500, easing: 'ease', fill: 'none' }
      )
    }
    const wasChecked = todo.checked
    toggleProjectTodo(categoryId, projectId, todo.id)
    // A recurring item rolls to its next date instead of completing
    if (!wasChecked && !isRecurring(todo.recurrence)) promptArchiveAttachments(categoryId, projectId, todo.linkedNoteIds || [])
  }, [archived, todo.checked, todo.id, todo.linkedNoteIds, categoryId, projectId, toggleProjectTodo, promptArchiveAttachments])

  // Pointer left the button before release: restore size, don't toggle
  const completeCancel = useCallback(() => {
    if (!completePressed.current) return
    completePressed.current = false
    const el = completeBtnRef.current
    if (el) {
      el.style.boxShadow = ''
      el.getAnimations().forEach(a => { if (!(a.animationName || '').includes('orbit')) a.cancel() })
      el.animate([{ transform: 'scale(0.91)' }, { transform: 'scale(1)' }], { duration: 120, fill: 'forwards' })
    }
  }, [])

  const accent = useMemo(() => {
    const idx = categories.findIndex(c => c.id === categoryId)
    return idx === -1 ? null : getCategoryAccent(idx)
  }, [categories, categoryId])

  // Slide in on mount
  useEffect(() => { requestAnimationFrame(() => setIsOpen(true)) }, [])

  // Dynamic header title: fade in the item title once the big title scrolls out the top
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const check = () => {
      const titleEl = titleRef.current
      const headEl = scrollTitleRef.current
      if (!titleEl || !headEl) return
      const show = titleEl.getBoundingClientRect().bottom <= scroll.getBoundingClientRect().top + 8
      headEl.style.opacity = show ? '1' : '0'
      headEl.style.transform = show ? 'translateY(0)' : 'translateY(8px)'
      if (show) headEl.textContent = (titleEl.textContent || '').trim()
    }
    check()
    scroll.addEventListener('scroll', check, { passive: true })
    return () => scroll.removeEventListener('scroll', check)
  }, [])

  // Tapping anywhere outside an open attach menu closes it.
  // (The attach buttons themselves are excluded so they can toggle / switch menus.)
  useEffect(() => {
    if (!noteAttachOpen && !linkAttachOpen) return
    const handler = (e) => {
      if (e.target.closest('.todo-attach-panel') || e.target.closest('.todo-attach-btn')) return
      setNoteAttachOpen(false)
      setLinkAttachOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [noteAttachOpen, linkAttachOpen])

  // Seed the editable title once (uncontrolled so the caret behaves)
  useEffect(() => {
    if (titleRef.current) titleRef.current.textContent = todo.text
    if (commentRef.current) commentRef.current.textContent = todo.comment || ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo.id])

  const linkedNoteIds = (todo.linkedNoteIds || []).map(String)
  const linkedLinkIds = (todo.linkedLinkIds || []).map(String)

  const attachedNotes = useMemo(
    () => linkedNoteIds.map(id => projectNotes.find(n => String(n.id) === id)).filter(Boolean),
    [linkedNoteIds.join(','), projectNotes] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const attachedLinks = useMemo(
    () => linkedLinkIds.map(id => projectLinks.find(l => String(l.id) === id)).filter(Boolean),
    [linkedLinkIds.join(','), projectLinks] // eslint-disable-line react-hooks/exhaustive-deps
  )
  // Archived notes/links aren't offered — only live ones can be attached
  const attachableNotes = projectNotes.filter(n => !n.archived && !linkedNoteIds.includes(String(n.id)))
  const attachableLinks = projectLinks.filter(l => !l.archived && !linkedLinkIds.includes(String(l.id)))

  // Drag-reorder for attached notes / links
  const noteAttachRef = useRef(null)
  const linkGridRef = useRef(null)
  const handleNoteReorder = useCallback((newIds) => reorderTodoNotes(categoryId, projectId, todo.id, newIds), [reorderTodoNotes, categoryId, projectId, todo.id])
  const handleLinkReorder = useCallback(
    (nextLinks) => reorderTodoLinks(categoryId, projectId, todo.id, nextLinks.map(l => String(l.id))),
    [reorderTodoLinks, categoryId, projectId, todo.id]
  )
  const { onDragPointerDown: onNoteAttachDrag } = useAttachDrag(noteAttachRef, attachedNotes, handleNoteReorder)
  const { onDragPointerDown: onLinkGridDrag } = useGridDragReorder(linkGridRef, attachedLinks, handleLinkReorder)

  const saveTitle = useCallback(() => {
    const text = (titleRef.current?.textContent || '').trim()
    if (text && text !== todo.text) updateProjectTodoText(categoryId, projectId, todo.id, text)
    else if (!text && titleRef.current) titleRef.current.textContent = todo.text
  }, [categoryId, projectId, todo.id, todo.text, updateProjectTodoText])

  const saveComment = useCallback(() => {
    const text = (commentRef.current?.textContent || '').trim()
    // contentEditable leaves a stray <br> behind — clear it so :empty (the placeholder) works
    if (!text && commentRef.current) commentRef.current.innerHTML = ''
    if (text !== (todo.comment || '')) updateProjectTodoComment(categoryId, projectId, todo.id, text)
  }, [categoryId, projectId, todo.id, todo.comment, updateProjectTodoComment])

  const handleDone = () => {
    saveTitle()
    saveComment()
    setIsOpen(false)
    setTimeout(onClose, 360)
  }

  // Top-right button: "Save" while editing the title (commits + exits edit), "Done" otherwise (closes).
  // Editing state is only cleared here (not on blur) so a touch that blurs the title first can't trip "Done".
  const handleTopButton = (e) => {
    e.preventDefault()
    if (editingTitle || editingComment) {
      titleRef.current?.blur()
      commentRef.current?.blur()
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
      saveTitle()
      saveComment()
      window.getSelection()?.removeAllRanges()
      setEditingTitle(false)
      setEditingComment(false)
    } else {
      handleDone()
    }
  }

  const focusComment = useCallback(() => {
    const el = commentRef.current
    if (!el) return
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }, [])

  // Tapping the underline or the gap beneath it opens the comment with the caret in it
  const handleCommentZoneDown = (e) => {
    if (archived) return
    if (e.target.closest && e.target.closest('.todo-detail-comment')) return
    e.preventDefault()
    if (todo.comment || editingTitle || editingComment) { focusComment(); return }
    setEditingComment(true)
    pendingCommentFocus.current = true
  }

  // The comment field only exists once it's shown — focus it on the render that reveals it
  useEffect(() => {
    if (!pendingCommentFocus.current) return
    pendingCommentFocus.current = false
    focusComment()
  })

  // Return from the title drops the caret into the comment line below the underline
  const handleTitleKeyDown = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    saveTitle()
    if (!commentRef.current) { titleRef.current?.blur(); return }
    focusComment()
  }

  // Comments are a single body-copy paragraph — Return saves and leaves edit mode
  const handleCommentKeyDown = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    commentRef.current?.blur()
    saveComment()
    window.getSelection()?.removeAllRanges()
    setEditingTitle(false)
    setEditingComment(false)
  }

  // Keep pasted content plain — no styles inside a comment
  const handleCommentPaste = (e) => {
    e.preventDefault()
    const text = (e.clipboardData?.getData('text/plain') || '').replace(/\s+/g, ' ')
    document.execCommand('insertText', false, text)
  }

  // Flash highlight + collapse, then detach — mirrors the homescreen "deactivate" animation
  const handleUnattach = useCallback((rowEl, doDetach) => {
    const row = rowEl?.closest('.todo-attach-row-wrap, .link-grid-cell')
    if (!row) { doDetach(); return }
    const flashEl = row.querySelector('.todo-attached-row') || row
    const rgb = getComputedStyle(row).getPropertyValue('--accent-base-rgb').trim() || '96,119,135'
    setTimeout(() => {
      flashEl.animate(
        [{ background: `rgba(${rgb},0)` }, { background: `rgba(${rgb},0.25)`, offset: 0.4 }, { background: `rgba(${rgb},0)` }],
        { duration: 280, fill: 'none' }
      )
      setTimeout(() => {
        row.style.height = row.getBoundingClientRect().height + 'px'
        row.style.overflow = 'hidden'
        requestAnimationFrame(() => requestAnimationFrame(() => {
          row.style.transition = 'height 220ms ease, opacity 180ms ease'
          row.style.height = '0'
          row.style.opacity = '0'
        }))
        setTimeout(() => doDetach(), 250)
      }, 180)
    }, 200)
  }, [])

  // Attached rows don't swipe — a clean tap opens them, a long press opens the menu
  const onRowPointerDown = useCallback((e, onTap) => {
    if (e.button !== 0) return
    if (e.target.closest('.link-outlink-btn')) return
    const startX = e.clientX, startY = e.clientY
    let moved = false

    const onMove = (e2) => {
      if (Math.abs(e2.clientX - startX) > 8 || Math.abs(e2.clientY - startY) > 8) moved = true
    }
    const cleanup = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', cleanup)
    }
    const onUp = () => {
      cleanup()
      if (!moved && !isRowMenuOpen()) onTap()
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', cleanup)
  }, [])

  const rowMenu = useRowMenu()

  const unattachItems = useCallback((detach) => (rowEl) => ([
    { label: 'Unattach', icon: <PaperclipIcon/>, onSelect: () => handleUnattach(rowEl, detach) },
  ]), [handleUnattach])

  const openNote = attachedNotes.find(n => n.id === openNoteId)

  // Footer drop shadow only when the content can scroll
  const contentScrollable = useScrollable(scrollRef, [todo, attachedNotes.length, attachedLinks.length])

  const footerMenuItems = [
    {
      label: 'Delete Item',
      icon: <TrashMenuIcon/>,
      danger: true,
      onSelect: () => promptDelete(() => { deleteProjectTodo(categoryId, projectId, todo.id); onClose() }),
    },
  ]

  // Notes lead by default; with nothing in Notes but links attached, Links leads.
  const linksFirst = attachedNotes.length === 0 && attachedLinks.length > 0
  const notesSection = (
        <div key="notes" className={`todo-section card todo-section-card${attachedNotes.length === 0 ? ' empty-card' : ''}`}>
          <div className={`card-header${noteSection.collapsed ? ' collapsed' : ''}`} onClick={noteSection.onHeaderClick}>
            <span className="card-title">Notes</span>
            <div className="project-header-actions">
              {!archived && (
                <button
                  className="todo-attach-btn section-attach-btn"
                  aria-label="Attach a note"
                  onMouseDown={e => { e.preventDefault(); setLinkAttachOpen(false); setNoteAttachOpen(v => !v) }}
                >
                  <span className={`project-tab-count${attachedNotes.length > 0 ? '' : ' empty'}`}>{attachedNotes.length > 0 ? attachedNotes.length : ''}</span>
                  <PaperclipIcon/>
                </button>
              )}
              {!archived && (
                <button
                  type="button"
                  className="project-add-btn"
                  onMouseDown={e => { e.preventDefault(); setNoteAttachOpen(false); setLinkAttachOpen(false); setNoteComposerOpen(v => !v) }}
                >
                  <PlusIcon/>
                </button>
              )}
            </div>
          </div>

          <div className="project-items" ref={noteSection.bodyRef}>
          <div className="todo-attach-anchor">
            <div className={`todo-attach-panel${noteAttachOpen ? ' open' : ''}`}>
              {attachableNotes.length === 0 ? (
                <div className="todo-attach-empty">No other notes in this project</div>
              ) : attachableNotes.map(n => {
                const preview = extractNotePreview(n.editorHTML)
                return (
                  <button
                    key={n.id}
                    className="todo-attach-item"
                    onMouseDown={e => { e.preventDefault(); attachNoteToTodo(categoryId, projectId, todo.id, n.id) }}
                  >
                    <span className="note-text">{n.text}</span>
                    {preview && <span className="note-preview-text">{preview}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div ref={noteAttachRef}>
            {attachedNotes.map((n, i) => (
              <AttachedNoteRow
                key={n.id}
                divider={i > 0}
                note={n}
                onOpen={() => setOpenNoteId(n.id)}
                onPointerDown={onRowPointerDown}
                onDragPointerDown={onNoteAttachDrag}
                onMenuDown={e => !archived && rowMenu.press(e, unattachItems(() => detachNoteFromTodo(categoryId, projectId, todo.id, n.id)))}
                onContextMenu={e => !archived && rowMenu.context(e, unattachItems(() => detachNoteFromTodo(categoryId, projectId, todo.id, n.id)))}
              />
            ))}
          </div>

          {noteComposerOpen && !archived && (
          <div className={`todo-composer${archived ? ' disabled' : ''}`}>
            <NoteComposer autoFocus onDismiss={() => setNoteComposerOpen(false)} onAdd={(text, active) => {
              const holder = { id: null }
              holder.id = addTodoNote(categoryId, projectId, todo.id, text, active, (realId) => { holder.id = realId })
              setTimeout(() => { if (holder.id != null) { setAutoEditNoteId(holder.id); setOpenNoteId(holder.id) } }, 650)
            }} />
          </div>
          )}
          </div>
        </div>

  )

  const linksSection = (
        <div key="links" className={`todo-section card todo-section-card${attachedLinks.length === 0 ? ' empty-card' : ''}`}>
          <div className={`card-header${linkSection.collapsed ? ' collapsed' : ''}`} onClick={linkSection.onHeaderClick}>
            <span className="card-title">Links</span>
            <div className="project-header-actions">
              {!archived && (
                <button
                  className="todo-attach-btn section-attach-btn"
                  aria-label="Attach a link"
                  onMouseDown={e => { e.preventDefault(); setNoteAttachOpen(false); setLinkAttachOpen(v => !v) }}
                >
                  <span className={`project-tab-count${attachedLinks.length > 0 ? '' : ' empty'}`}>{attachedLinks.length > 0 ? attachedLinks.length : ''}</span>
                  <PaperclipIcon/>
                </button>
              )}
              {!archived && (
                <button
                  type="button"
                  className="project-add-btn"
                  onMouseDown={e => { e.preventDefault(); setNoteAttachOpen(false); setLinkAttachOpen(false); setLinkComposerOpen(v => !v) }}
                >
                  <PlusIcon/>
                </button>
              )}
            </div>
          </div>

          <div className="project-items" ref={linkSection.bodyRef}>
          <div className="todo-attach-anchor">
            <div className={`todo-attach-panel${linkAttachOpen ? ' open' : ''}`}>
              {attachableLinks.length === 0 ? (
                <div className="todo-attach-empty">No other links in this project</div>
              ) : attachableLinks.map(l => (
                <button
                  key={l.id}
                  className="todo-attach-item"
                  onMouseDown={e => { e.preventDefault(); attachLinkToTodo(categoryId, projectId, todo.id, l.id) }}
                >
                  <span className="note-text">{l.title}</span>
                  <span className="note-preview-text">{displayUrl(l.url)}</span>
                </button>
              ))}
            </div>
          </div>

          {attachedLinks.length > 0 && (
            <div className="link-grid" ref={linkGridRef}>
              {attachedLinks.map(l => (
                <div key={l.id} className="link-grid-cell" data-swipe-id={l.id}>
                  <LinkGridCard
                    link={l}
                    categoryId={categoryId}
                    projectId={projectId}
                    archived={archived}
                    onOpenPage={() => setOpenAttachLinkId(l.id)}
                    onPointerDown={e => {
                      if (archived) return
                      rowMenu.press(e, unattachItems(() => detachLinkFromTodo(categoryId, projectId, todo.id, l.id)), { side: true })
                      onLinkGridDrag(e, l.id)
                    }}
                    onContextMenu={e => !archived && rowMenu.context(e, unattachItems(() => detachLinkFromTodo(categoryId, projectId, todo.id, l.id)))}
                  />
                </div>
              ))}
            </div>
          )}

          {linkComposerOpen && !archived && (
          <div className={`todo-composer${archived ? ' disabled' : ''}`}>
            <LinkComposer autoFocus onDismiss={() => setLinkComposerOpen(false)} onAdd={(title, url, active) => addTodoLink(categoryId, projectId, todo.id, title, url, active)} />
          </div>
          )}
          </div>
        </div>
  )

  return (
    <div
      ref={pageRef}
      className={`note-detail-page${isOpen ? ' open' : ''}${archived ? ' archived' : ''}`}
      style={accent ? {
        '--accent-base': accent.base,
        '--accent-dark': accent.dark,
        '--accent-light': accent.light,
        '--accent-base-rgb': accent.baseRgb,
      } : undefined}
    >
      <div className="todo-complete-flash" ref={flashRef} />
      <div className="note-detail-header">
        <NoteListIcon/>
        {archived && <span className="detail-archived-label">Archived</span>}
        <span className="note-scroll-title" ref={scrollTitleRef} />
        <button className="note-detail-done" onMouseDown={handleTopButton}>{(editingTitle || editingComment) ? 'Save' : 'Done'}</button>
      </div>

      <div className="todo-detail-scroll" ref={scrollRef}>
        <div
          ref={titleRef}
          className="todo-detail-title"
          contentEditable={!archived}
          suppressContentEditableWarning
          autoCapitalize="sentences"
          onFocus={() => setEditingTitle(true)}
          onKeyDown={handleTitleKeyDown}
          onBlur={saveTitle}
        />

        <div className="todo-comment-zone" onMouseDown={handleCommentZoneDown}>
          <div className="todo-detail-underline">
            <UnderlineSvg style={{ display: 'block', color: 'var(--accent-base)' }} />
          </div>

          <div
            ref={commentRef}
            className={`todo-detail-comment${(todo.comment || editingTitle || editingComment) ? '' : ' hidden'}${(editingTitle && !editingComment) ? ' show-placeholder' : ''}`}
            contentEditable={!archived}
            suppressContentEditableWarning
            autoCapitalize="sentences"
            data-placeholder={'Press "Return" to add a comment'}
            onFocus={() => setEditingComment(true)}
            onKeyDown={handleCommentKeyDown}
            onPaste={handleCommentPaste}
            onBlur={saveComment}
          />
        </div>

        {linksFirst ? [linksSection, notesSection] : [notesSection, linksSection]}
      </div>

      <RowActionMenu state={rowMenu.state} onClose={rowMenu.close} />

      {moveOpen && (
        <MoveToCard
          categories={categories}
          currentCategoryId={categoryId}
          currentProjectId={projectId}
          topPx={moveTop}
          onCancel={() => setMoveOpen(false)}
          onSave={saveMove}
        />
      )}

      <DetailFooter
        menuItems={footerMenuItems}
        activated={!!todo.activated}
        scheduledDate={todo.scheduledDate}
        onToggleActive={() => toggleProjectTodoActivated(categoryId, projectId, todo.id)}
        allowRecurring
        recurrence={todo.recurrence || null}
        onSchedule={(date, r) => setProjectTodoScheduled(categoryId, projectId, todo.id, date, r)}
        onClearSchedule={() => setProjectTodoScheduled(categoryId, projectId, todo.id, null)}
        accent={accent}
        projectName={projectName}
        onProjectClick={openMove}
        menuOpen={moveOpen}
        disabledActive={archived}
        completeButton={
          <button
            ref={completeBtnRef}
            className={`mark-complete-btn${todo.checked ? ' done' : ''}`}
            onPointerDown={completeDown}
            onPointerUp={completeUp}
            onPointerLeave={completeCancel}
            onPointerCancel={completeCancel}
          >
            {todo.checked ? (<><CheckIcon/> Complete!</>) : 'Mark as Complete'}
          </button>
        }
        scrollable={contentScrollable}
      />

      {openNote && createPortal(
        <NoteDetailPage
          note={{ ...openNote, categoryId }}
          onClose={() => setOpenNoteId(null)}
          onSave={(noteId, html, text) => updateProjectNote(categoryId, projectId, noteId, html, text)}
          activated={!!openNote.activated}
          onToggleActive={() => toggleProjectNoteActivated(categoryId, projectId, openNote.id)}
          onSchedule={(date) => setProjectNoteScheduled(categoryId, projectId, openNote.id, date)}
          onClearSchedule={() => setProjectNoteScheduled(categoryId, projectId, openNote.id, null)}
          projectName={projectName}
          categoryId={categoryId}
          projectId={projectId}
          archived={archived || !!openNote.archived}
        />,
        document.getElementById('app')
      )}

      {openAttachLinkId != null && attachedLinks.find(l => l.id === openAttachLinkId) && createPortal(
        <LinkDetailPage
          link={attachedLinks.find(l => l.id === openAttachLinkId)}
          categoryId={categoryId}
          projectId={projectId}
          onClose={() => setOpenAttachLinkId(null)}
        />,
        document.getElementById('app')
      )}
    </div>
  )
}
