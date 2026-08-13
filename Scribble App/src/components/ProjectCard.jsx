import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo, useId } from 'react'
import { createPortal } from 'react-dom'
import { useAppContext } from '../context/AppContext.jsx'
import { NoteDetailPage } from './NoteCard.jsx'
import TodoDetailPage from './TodoDetailPage.jsx'
import { getCategoryAccent } from '../theme.js'
import { CalendarIcon, formatSchedule, useActivatePress, ActivateIcon, closeSwipeRow, toAnchorRect, groupByActivation, formatScheduleShort } from './ScheduleBits.jsx'
import { EyeIcon, EyeOffIcon, EditIcon, ArchiveMenuIcon, RetrieveMenuIcon, TrashMenuIcon, CalendarMenuIcon, FolderMenuIcon } from './MenuIcons.jsx'
import { useRowMenu, RowActionMenu, GalleryMenuIcon, isRowMenuOpen } from './RowMenu.jsx'
import OutlinkButton from './OutlinkButton.jsx'
import LinkDetailPage from './LinkDetailPage.jsx'
import CalendarPopup from './CalendarPopup.jsx'
import MoveToCard from './MoveToCard.jsx'
import { subscribeProjectFocus } from '../searchFocus.js'
import { subscribeOrderHold } from '../galleryPulse.js'

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


// ---- Swipe hook ----
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
    const preventScroll = (e) => { if (started) e.preventDefault() }

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
      // The clone lives in #animation-portal, outside the card, so card-scoped
      // rules (`.project-card .todo-row { min-height, align-items }` and friends)
      // stop reaching it — the row would render short and top-aligned. Wrap it in
      // a bare element carrying the source card's classes to restore that scope,
      // with the card's own box styling neutralised.
      const srcCard = dragged.el.closest('.card')
      const scope = document.createElement('div')
      if (srcCard) scope.className = srcCard.className
      scope.style.cssText = 'padding:0;margin:0;border:none;background:none;box-shadow:none;overflow:visible;opacity:1;transform:none;'
      scope.appendChild(cloneInner)
      const clone = document.createElement('div')
      clone.style.cssText = ['position:absolute', `left:${dragged.rect.left - appRect.left - 4}px`, `top:${cloneTop}px`, `width:${dragged.rect.width + 8}px`, 'padding:4px 0', 'pointer-events:none', 'box-shadow:0 4px 20px rgba(0,0,0,0.10)', 'border-radius:8px', 'border:1px solid #C2C1BF', 'background:#F7F6F3', 'overflow:hidden', 'z-index:999'].join(';')
      clone.appendChild(scope)
      portal.appendChild(clone)
      dragged.wrapper.style.opacity = '0'
      dragRef.current = { clone, snapshots, dragIdx, currentIdx: dragIdx, cloneTop, startY: clientY, draggedH: dragged.wrapper.getBoundingClientRect().height, uncheckedCount, topBound, bottomBound }
      return true
    }

    const doStart = (clientY, longPress) => {
      if (started) return
      started = start(clientY)
      if (!started) return
      if (!longPress) return
      const s = dragRef.current
      if (s) { s.clone.style.transition = 'box-shadow 120ms ease'; s.clone.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)'; setTimeout(() => { if (dragRef.current === s) s.clone.style.transition = '' }, 120) }
    }

    longPressTimer = setTimeout(() => { longPressTimer = null; doStart(startY, true) }, 250)
    document.addEventListener('touchmove', preventScroll, { passive: false })

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
      if (longPressTimer && (dx > 8 || dy > 8)) { clearTimeout(longPressTimer); longPressTimer = null; document.removeEventListener('touchmove', preventScroll) }
      if (!started) return
      e2.preventDefault()
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

// ---- Icons ----
function ListIcon({ active, size = 24, color }) {
  const c = color || (active ? 'var(--accent-dark)' : '#595959')
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="5" cy="7" r="1.6" style={{ fill: c }}/>
      <line x1="9" y1="7" x2="21" y2="7" style={{ stroke: c }} strokeWidth="1" strokeLinecap="round"/>
      <circle cx="5" cy="13" r="1.6" style={{ fill: c }}/>
      <line x1="9" y1="13" x2="21" y2="13" style={{ stroke: c }} strokeWidth="1" strokeLinecap="round"/>
      <circle cx="5" cy="19" r="1.6" style={{ fill: c }}/>
      <line x1="9" y1="19" x2="15" y2="19" style={{ stroke: c }} strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

function NoteIcon({ active, size = 24, color }) {
  const s = { stroke: color || (active ? 'var(--accent-dark)' : '#595959') }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 4h10l6 6v12a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" style={s} strokeWidth="1" strokeLinejoin="round" fill="none"/>
      <path d="M14 4v6h6" style={s} strokeWidth="1" strokeLinejoin="round"/>
      <line x1="6" y1="15" x2="18" y2="15" style={s} strokeWidth="1" strokeLinecap="round"/>
      <line x1="6" y1="18.5" x2="14" y2="18.5" style={s} strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

function LinkIcon({ active, size = 24, color }) {
  const s = { stroke: color || (active ? 'var(--accent-dark)' : '#595959') }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" style={s} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" style={s} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// Row icon for a link item. When active, a 16x16 light-colored circle sits behind it.
function LinkRowIcon({ activated }) {
  const stroke = activated ? 'var(--accent-dark)' : '#7A7A7A'
  const fid = useId()
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      {activated && (
        <defs>
          <filter id={`li-${fid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feOffset dx="4" dy="8"/>
            <feGaussianBlur stdDeviation="4" result="ob"/>
            <feComposite operator="out" in="SourceGraphic" in2="ob" result="inv"/>
            <feFlood style={{ floodColor: 'var(--accent-light)', floodOpacity: 1 }} result="col"/>
            <feComposite operator="in" in="col" in2="inv" result="sh"/>
            <feComposite operator="over" in="sh" in2="SourceGraphic"/>
          </filter>
        </defs>
      )}
      {activated && <circle cx="12" cy="12" r="8" fill="#F7F6F3" filter={`url(#li-${fid})`}/>}
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke={stroke} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke={stroke} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
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

// Archive box icon — 20x20, 1pt stroke, inherits color via currentColor.
function ArchiveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
      <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
      <path d="M10 12h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

// Retrieve (unarchive) icon — archive box with an upward arrow.
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

function SendIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
      <path d="M10 16 L10 4" style={{ stroke: 'var(--accent-dark)' }} strokeWidth="1" strokeLinecap="round"/>
      <path d="M4 9 L10 3 L16 9" style={{ stroke: 'var(--accent-dark)' }} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function CancelIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M6 6 L14 14 M14 6 L6 14" stroke="#959493" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

// Inline editor shown in a link row after a long-press: stacked title + url with a send button.
function LinkRowEditor({ link, onSave, onCancel }) {
  const [title, setTitle] = useState(link.title === link.url ? '' : (link.title || ''))
  const [url, setUrl] = useState(link.url || '')
  const wrapRef = useRef(null)
  const titleRef = useRef(null)
  const urlRef = useRef(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  // Cancel when tapping outside the editor
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) onCancel() }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [onCancel])

  const submit = () => {
    const u = url.trim()
    if (!u) { onCancel(); return }
    onSave(title.trim(), u)
  }

  return (
    <div className="link-row-editor" ref={wrapRef} onPointerDown={e => e.stopPropagation()}>
      <div className="link-row-editor-fields">
        <input
          ref={titleRef}
          className="project-input"
          placeholder="Title your link"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); urlRef.current?.focus() } if (e.key === 'Escape') onCancel() }}
        />
        <div className="project-input-divider" />
        <input
          ref={urlRef}
          className="project-input"
          placeholder="Add link"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } if (e.key === 'Escape') onCancel() }}
        />
      </div>
      <button className="project-send-btn visible" onMouseDown={e => { e.preventDefault(); submit() }}>
        <SendIcon/>
      </button>
    </div>
  )
}

// ---- Note preview helpers ----

// Extract plain text from all note-para elements after the first (the title).
// Returns null if there's nothing meaningful beyond the title.
function extractNotePreview(editorHTML) {
  if (!editorHTML) return null
  try {
    const tmp = document.createElement('div')
    tmp.innerHTML = editorHTML
    const paras = [...tmp.querySelectorAll('.note-para')]
    if (paras.length <= 1) return null
    const text = paras.slice(1)
      .map(p => p.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    return text || null
  } catch { return null }
}

// Renders the title line (clamped to 2 lines) and, when the title
// naturally fits on one line, a single truncated preview line below it.
function NoteRowContent({ note }) {
  const titleRef = useRef(null)
  const [isMultiLine, setIsMultiLine] = useState(false)

  const previewText = useMemo(() => extractNotePreview(note.editorHTML), [note.editorHTML])

  // Measure natural title height before the browser paints so there's no flicker.
  // Deps: only re-run when the title text or available preview changes.
  useLayoutEffect(() => {
    const el = titleRef.current
    if (!el || !previewText) { setIsMultiLine(false); return }
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 22.4
    // On the first render isMultiLine=false so the title is unclamped — scrollHeight
    // reflects its natural height. Deps prevent this from re-running after we clamp.
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

// ---- Main component ----
// Project cards no longer have their own item composer — items are added from the
// footer (or the desktop left-panel) text box instead. Flip this to true to bring
// the in-card text box back (and set .project-card padding-bottom back to 0 in
// cards.css to make room for it again).
const SHOW_PROJECT_INPUT = false

export default function ProjectCard({ categoryId, project }) {
  const [activeTab, setActiveTab] = useState('list')

  // A search result can ask this canvas to open on a particular content type and,
  // if the target item is currently hidden, to reveal it: expand the canvas and
  // flip whichever visibility toggle is keeping it off screen.
  useEffect(() => subscribeProjectFocus(req => {
    if (!req || String(req.projectId) !== String(project.id)) return
    if (req.type) setActiveTab(req.type)
    if (req.expand) {
      setCollapsed(false)
      try { localStorage.setItem(`collapsed-project-${project.id}`, 'false') } catch {}
    }
    if (req.showCompleted) {
      setHideCompleted(false)
      try { localStorage.setItem(`hc-project-${project.id}`, 'false') } catch {}
    }
    if (req.showArchivedNotes) {
      setShowArchived(true)
      try { localStorage.setItem(`arch-project-${project.id}`, 'true') } catch {}
    }
    if (req.showArchivedLinks) {
      setShowArchivedLinks(true)
      try { localStorage.setItem(`arch-link-project-${project.id}`, 'true') } catch {}
    }
  }), [project.id])
  const [inputValue, setInputValue] = useState('')
  const [linkUrlValue, setLinkUrlValue] = useState('')
  const [inputFocused, setInputFocused] = useState(false)
  const [addAsActive, setAddAsActive] = useState(false)
  const [addScheduledDate, setAddScheduledDate] = useState(null)
  const [editingLinkId, setEditingLinkId] = useState(null)
  const [calendarFor, setCalendarFor] = useState(null) // { type, id, current } | { type: 'create' }
  const [addType, setAddType] = useState('list')
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [hideCompleted, setHideCompleted] = useState(() => {
    try { return localStorage.getItem(`hc-project-${project.id}`) !== 'false' } catch { return true }
  })
  const [showArchived, setShowArchived] = useState(() => {
    try { return localStorage.getItem(`arch-project-${project.id}`) === 'true' } catch { return false }
  })
  const [showArchivedLinks, setShowArchivedLinks] = useState(() => {
    try { return localStorage.getItem(`arch-link-project-${project.id}`) === 'true' } catch { return false }
  })
  // Tapping the card header collapses the card to just its header (and expands
  // it again). Persisted per canvas.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(`collapsed-project-${project.id}`) === 'true' } catch { return false }
  })

  const cardRef = useRef(null)
  const inputWrapRef = useRef(null)
  const linkUrlRef = useRef(null)
  const todoContainerRef = useRef(null)
  const noteContainerRef = useRef(null)
  const linkContainerRef = useRef(null)
  const inputRef = useRef(null)
  const pendingAnim = useRef(null)
  const noteSwipeState = useRef({})
  const sortFlipRef = useRef(null)
  const menuRef = useRef(null)
  const renameInputRef = useRef(null)
  const addBtnRef = useRef(null)
  const tabBarRef = useRef(null)
  const tabIndicatorRef = useRef(null)
  const itemsRef = useRef(null)
  const itemsHeightRef = useRef(null)
  const suppressHeaderToggleRef = useRef(false)
  const collapsedRef = useRef(collapsed)
  collapsedRef.current = collapsed
  const collapseMountedRef = useRef(false)
  const defaultTabRef = useRef(false)
  const tabMountedRef = useRef(false)
  const typeBarRef = useRef(null)
  const typeIndicatorRef = useRef(null)
  const typeMountedRef = useRef(false)
  const [moveItem, setMoveItem] = useState(null)   // { type, id } — row being moved
  const [moveCanvasOpen, setMoveCanvasOpen] = useState(false)
  const showingRef = useRef(false)
  const checkTimers = useRef({})
  const checkPopping = useRef({})

  const {
    categories,
    addProjectTodo, addProjectNote, addProjectLink,
    toggleProjectTodo, deleteProjectTodo, deleteProjectNote,
    deleteProjectLink, toggleProjectTodoActivated, toggleProjectNoteActivated,
    toggleProjectLinkActivated, updateProjectLink,
    archiveProjectNote, unarchiveProjectNote, promptArchiveAttachments, promptDelete,
    archiveProjectLink, unarchiveProjectLink,
    setProjectTodoScheduled, setProjectNoteScheduled, setProjectLinkScheduled,
    updateProjectNote, reorderProjectTodos, reorderProjectNotes, reorderProjectLinks,
    renameProject, archiveProject, unarchiveProject, deleteProject, moveProject,
    moveProjectTodo, moveProjectNote, moveProjectLink,
    openDetail, setOpenDetail, setAutoEditNoteId, requestCompose,
  } = useAppContext()

  // Archived canvases are read-only: tabs + opening pages work, but checkboxes,
  // activate/schedule/archive swipes, drag-reorder, inline edit, rename, and the
  // add bar are disabled. Per-item delete swipe remains available.
  const archived = !!project.archived

  // Open-detail state is shared (AppContext) so only one row is highlighted at a
  // time across all cards; tapping the open row again toggles it closed.
  const openTodoId = (openDetail?.type === 'todo' && project.todos.some(t => t.id === openDetail.id)) ? openDetail.id : null
  const openNoteId = (openDetail?.type === 'note' && project.notes.some(n => n.id === openDetail.id)) ? openDetail.id : null
  const openLinkId = (openDetail?.type === 'link' && project.links.some(l => l.id === openDetail.id)) ? openDetail.id : null
  const setOpenTodoId = (id) => setOpenDetail(id == null ? null : (prev => (prev?.type === 'todo' && prev.id === id) ? null : { type: 'todo', id }))
  const setOpenNoteId = (id) => setOpenDetail(id == null ? null : (prev => (prev?.type === 'note' && prev.id === id) ? null : { type: 'note', id }))
  const setOpenLinkId = (id) => setOpenDetail(id == null ? null : (prev => (prev?.type === 'link' && prev.id === id) ? null : { type: 'link', id }))

  const linkSwipeState = useRef({})

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renaming])

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== project.name) renameProject(categoryId, project.id, trimmed)
    setRenaming(false)
  }, [renameValue, project.name, project.id, categoryId, renameProject])

  const handleDeleteProject = useCallback(() => {
    setMenuOpen(false)
    promptDelete(() => {
      const card = cardRef.current
      if (!card) { deleteProject(categoryId, project.id); return }
      const h = card.getBoundingClientRect().height
      card.style.height = h + 'px'
      card.style.overflow = 'hidden'
      requestAnimationFrame(() => requestAnimationFrame(() => {
        card.style.transition = 'height 220ms ease, opacity 180ms ease, margin 220ms ease'
        card.style.height = '0'
        card.style.opacity = '0'
        card.style.marginBottom = '0'
      }))
      setTimeout(() => deleteProject(categoryId, project.id), 240)
    })
  }, [categoryId, project.id, deleteProject, promptDelete])

  // Archiving a canvas: collapse the card vertically + fade it out (like a row
  // disappearing) before flagging it archived and moving it out of the stack.
  const handleArchiveProject = useCallback(() => {
    setMenuOpen(false)
    // An archived canvas shows everything by default — reveal all completed items
    // and all archived notes/links regardless of their prior visibility. Persisted,
    // so a fresh mount in the archived section reads it; the user can re-hide after.
    setHideCompleted(false); try { localStorage.setItem(`hc-project-${project.id}`, 'false') } catch {}
    setShowArchived(true); try { localStorage.setItem(`arch-project-${project.id}`, 'true') } catch {}
    setShowArchivedLinks(true); try { localStorage.setItem(`arch-link-project-${project.id}`, 'true') } catch {}
    const card = cardRef.current
    if (!card) { archiveProject(categoryId, project.id); return }
    const h = card.getBoundingClientRect().height
    card.style.height = h + 'px'
    card.style.overflow = 'hidden'
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.style.transition = 'height 220ms ease, opacity 180ms ease, margin 220ms ease'
      card.style.height = '0'
      card.style.opacity = '0'
      card.style.marginBottom = '0'
    }))
    setTimeout(() => archiveProject(categoryId, project.id), 240)
  }, [categoryId, project.id, archiveProject])

  const rowMenu = useRowMenu()

  // ---- Sorted todos: activated first, then unchecked, then checked ----
  // Order: active → scheduled → rest, with checked todos last
  const uncheckedOrdered = groupByActivation(project.todos.filter(t => !t.checked))
  // While the activation sequence plays, keep rendering the order that was on
  // screen when it started. The data has already committed; this only defers the
  // visual re-sort so the row slides to its new slot once the animations end.
  const [orderHeld, setOrderHeld] = useState(false)
  const heldOrderRef = useRef(null)
  const liveOrderRef = useRef({ todos: [], notes: [], links: [] })
  const releaseFlipRef = useRef(null)
  useEffect(() => subscribeOrderHold(held => {
    if (held) { heldOrderRef.current = liveOrderRef.current; setOrderHeld(true) }
    else {
      // Snapshot where every row sits right now, before React reorders them, so
      // the release can be animated rather than snapping into place.
      const scope = cardRef.current
      releaseFlipRef.current = scope
        ? [...scope.querySelectorAll('.swipe-row[data-swipe-id]')].map(el => ({
            el: el.parentElement || el, top: el.getBoundingClientRect().top,
          }))
        : null
      heldOrderRef.current = null
      setOrderHeld(false)
    }
  }), [])

  // FLIP the rows from their held positions to their new ones
  useLayoutEffect(() => {
    const snap = releaseFlipRef.current
    if (!snap) return
    releaseFlipRef.current = null
    const frames = snap
      .map(({ el, top }) => ({ el, dy: top - el.getBoundingClientRect().top }))
      .filter(f => Math.abs(f.dy) > 1)
    if (!frames.length) return
    frames.forEach(({ el, dy }) => {
      el.style.transition = 'none'
      el.style.transform = `translateY(${dy}px)`
    })
    document.body.offsetHeight   // force reflow
    requestAnimationFrame(() => {
      frames.forEach(({ el }) => {
        el.style.transition = 'transform 300ms cubic-bezier(0.4,0,0.2,1)'
        el.style.transform = ''
      })
      setTimeout(() => frames.forEach(({ el }) => { el.style.transition = '' }), 320)
    })
  }, [orderHeld])

  // Re-apply a captured order to a freshly sorted list; anything new goes last.
  const applyHeld = (list, ids) => {
    if (!ids || !ids.length) return list
    const pos = new Map(ids.map((id, i) => [String(id), i]))
    return [...list].sort((a, b) => {
      const ai = pos.has(String(a.id)) ? pos.get(String(a.id)) : Number.MAX_SAFE_INTEGER
      const bi = pos.has(String(b.id)) ? pos.get(String(b.id)) : Number.MAX_SAFE_INTEGER
      return ai - bi
    })
  }

  const sortedTodos = hideCompleted
    ? uncheckedOrdered
    : [...uncheckedOrdered, ...project.todos.filter(t => t.checked)]
  // Notes: active (non-archived) shown normally; archived collected at the bottom,
  // visible only when "Show Archived" is toggled on. Archived count drives the menu item.
  const activeNotesList = groupByActivation(project.notes.filter(n => !n.archived))
  const archivedNotesList = project.notes.filter(n => n.archived)
  const archivedNoteCount = archivedNotesList.length
  const sortedNotes = showArchived ? [...activeNotesList, ...archivedNotesList] : activeNotesList
  const activeLinksList = groupByActivation(project.links.filter(l => !l.archived))
  const archivedLinksList = project.links.filter(l => l.archived)
  const archivedLinkCount = archivedLinksList.length
  const sortedLinks = showArchivedLinks ? [...activeLinksList, ...archivedLinksList] : activeLinksList

  // Snapshot the live order every render so it can be frozen on demand
  liveOrderRef.current = {
    todos: sortedTodos.map(t => t.id),
    notes: sortedNotes.map(n => n.id),
    links: sortedLinks.map(l => l.id),
  }
  const displayTodos = orderHeld ? applyHeld(sortedTodos, heldOrderRef.current?.todos) : sortedTodos
  const displayNotes = orderHeld ? applyHeld(sortedNotes, heldOrderRef.current?.notes) : sortedNotes
  const displayLinks = orderHeld ? applyHeld(sortedLinks, heldOrderRef.current?.links) : sortedLinks
  const uncheckedCount = project.todos.filter(t => !t.checked).length
  const hasChecked = project.todos.some(t => t.checked)
  const checkedCount = project.todos.filter(t => t.checked).length

  // ---- Reorder handlers ----
  const handleTodoReorder = useCallback((newOrder) => {
    reorderProjectTodos(categoryId, project.id, newOrder)
  }, [categoryId, project.id, reorderProjectTodos])

  const handleNoteReorder = useCallback((newOrder) => {
    reorderProjectNotes(categoryId, project.id, newOrder)
  }, [categoryId, project.id, reorderProjectNotes])

  const handleLinkReorder = useCallback((newOrder) => {
    reorderProjectLinks(categoryId, project.id, newOrder)
  }, [categoryId, project.id, reorderProjectLinks])

  // ---- Checkbox press/release animations ----
  const handleCheckboxDown = useCallback((e, id) => {
    e.stopPropagation()
    if (archived) return
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
  }, [archived])

  const handleCheckboxUp = useCallback((e, id) => {
    e.stopPropagation()
    if (archived) return
    if (checkTimers.current[`suppress_${id}`]) {
      checkTimers.current[`suppress_${id}`] = false
      return
    }
    clearTimeout(checkTimers.current[id])
    const checkboxEl = e.currentTarget.querySelector('.checkbox')
    const todoItem = project.todos.find(t => t.id === id)
    const isChecked = todoItem?.checked
    const attachedNoteIds = todoItem?.linkedNoteIds || []
    if (!checkboxEl) {
      if (todoContainerRef.current) {
        sortFlipRef.current = [...todoContainerRef.current.children].map(el => ({ el, top: el.getBoundingClientRect().top }))
      }
      toggleProjectTodo(categoryId, project.id, id)
      if (!isChecked) promptArchiveAttachments(categoryId, project.id, attachedNoteIds)
      return
    }
    checkPopping.current[id] = true
    const popAnim = checkboxEl.animate(
      [
        { transform: 'scale(0.82)' },
        { transform: 'scale(1.25)' },
        { transform: 'scale(1)' },
      ],
      { duration: 320, easing: 'ease', fill: 'forwards' }
    )
    popAnim.onfinish = () => checkboxEl.getAnimations().forEach(a => { if (!(a.animationName || '').includes('orbit')) a.cancel() })
    if (!isChecked) {
      checkboxEl.classList.add('checked')
      e.currentTarget.closest('.todo-row')?.classList.add('checked')
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
      setTimeout(() => {
        if (todoContainerRef.current) {
          sortFlipRef.current = [...todoContainerRef.current.children].map(el => ({ el, top: el.getBoundingClientRect().top }))
        }
        toggleProjectTodo(categoryId, project.id, id)
        promptArchiveAttachments(categoryId, project.id, attachedNoteIds)
      }, 500)
    } else {
      if (todoContainerRef.current) {
        sortFlipRef.current = [...todoContainerRef.current.children].map(el => ({ el, top: el.getBoundingClientRect().top }))
      }
      toggleProjectTodo(categoryId, project.id, id)
    }
  }, [archived, categoryId, project.id, project.todos, toggleProjectTodo, promptArchiveAttachments])

  // ---- Hide/Show Completed ----
  const handleToggleHideCompleted = useCallback(() => {
    if (!hideCompleted) {
      const container = todoContainerRef.current
      const wrappers = project.todos.filter(t => t.checked).map(t =>
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
        try { localStorage.setItem(`hc-project-${project.id}`, 'true') } catch {}
      }, 210)
    } else {
      showingRef.current = true
      setHideCompleted(false)
      try { localStorage.setItem(`hc-project-${project.id}`, 'false') } catch {}
    }
  }, [hideCompleted, project.todos, project.id])

  // ---- Drag reorder ----
  const { onDragPointerDown: onTodoDrag } = useDragReorder(todoContainerRef, sortedTodos, handleTodoReorder, uncheckedCount)
  const { onDragPointerDown: onNoteDrag } = useDragReorder(noteContainerRef, sortedNotes, handleNoteReorder, showArchived ? activeNotesList.length : undefined)
  const { onDragPointerDown: onLinkDrag } = useDragReorder(linkContainerRef, sortedLinks, handleLinkReorder, showArchivedLinks ? activeLinksList.length : undefined)

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

  // Animate checked items back in when "Show Completed" is clicked
  useLayoutEffect(() => {
    if (!showingRef.current) return
    showingRef.current = false
    const container = todoContainerRef.current
    if (!container) return
    const wrappers = project.todos.filter(t => t.checked).map(t =>
      container.querySelector(`[data-swipe-id="${t.id}"]`)?.parentElement
    ).filter(Boolean)
    if (!wrappers.length) return
    wrappers.forEach(el => {
      el.style.overflow = 'hidden'; el.style.maxHeight = '0'
      el.style.opacity = '0'; el.style.transition = 'none'
    })
    document.body.offsetHeight
    requestAnimationFrame(() => {
      wrappers.forEach(el => {
        el.style.transition = 'max-height 220ms ease, opacity 180ms ease'
        el.style.maxHeight = el.scrollHeight + 'px'
        el.style.opacity = '1'
      })
      setTimeout(() => wrappers.forEach(el => {
        el.style.maxHeight = ''; el.style.overflow = ''
        el.style.transition = ''; el.style.opacity = ''
      }), 220)
    })
  }, [hideCompleted, project.todos])

  // ---- Which tabs have content ----
  const typesWithItems = ['list', 'note', 'link'].filter(t =>
    (t === 'list' && project.todos.length > 0) ||
    (t === 'note' && project.notes.length > 0) ||
    (t === 'link' && project.links.length > 0)
  )
  // Tabs normally appear only when there's more than one content type — but a
  // collapsed single-type canvas shows its one icon so you can still tell what
  // it holds.
  const showTabs = typesWithItems.length > 1 || (collapsed && typesWithItems.length === 1)
  const displayType = typesWithItems.length > 1 ? activeTab : (typesWithItems[0] || 'list')
  // Nothing reads as selected while the canvas is collapsed.
  const selectedTab = collapsed ? null : displayType

  // How many items a tab would actually render right now, honouring the
  // hide-completed / show-archived toggles.
  const visibleCount = (t) => {
    if (t === 'list') return hideCompleted ? project.todos.filter(x => !x.checked).length : project.todos.length
    if (t === 'note') return showArchived ? project.notes.length : project.notes.filter(n => !n.archived).length
    return showArchivedLinks ? project.links.length : project.links.filter(l => !l.archived).length
  }

  // ---- Default tab: first type with visible items, else the first type ----
  // Runs once, on the first render where the project actually has content
  // (data loads async, so the very first render can be empty).
  useLayoutEffect(() => {
    if (defaultTabRef.current || typesWithItems.length === 0) return
    defaultTabRef.current = true
    setActiveTab(typesWithItems.find(t => visibleCount(t) > 0) || typesWithItems[0])
  })

  // ---- Slide the tab selector box to the active tab ----
  useLayoutEffect(() => {
    const bar = tabBarRef.current
    const ind = tabIndicatorRef.current
    if (!bar || !ind) return
    const sel = bar.querySelector('.project-tab-btn.selected')
    if (!sel) { ind.style.opacity = '0'; return }
    if (!tabMountedRef.current) ind.style.transition = 'none'
    ind.style.opacity = '1'
    ind.style.left = sel.offsetLeft + 'px'
    ind.style.width = sel.offsetWidth + 'px'
    if (!tabMountedRef.current) {
      // enable transition after the initial position is set
      requestAnimationFrame(() => { ind.style.transition = ''; tabMountedRef.current = true })
    }
  }, [selectedTab, showTabs, collapsed, typesWithItems.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Slide the composer type-selector box to the active add-type ----
  useLayoutEffect(() => {
    const bar = typeBarRef.current
    const ind = typeIndicatorRef.current
    if (!bar || !ind) return
    const sel = bar.querySelector('.project-type-btn.selected')
    if (!sel) { ind.style.opacity = '0'; return }
    if (!typeMountedRef.current) ind.style.transition = 'none'
    ind.style.opacity = '1'
    ind.style.left = sel.offsetLeft + 'px'
    if (!typeMountedRef.current) {
      requestAnimationFrame(() => { ind.style.transition = ''; typeMountedRef.current = true })
    }
  }, [addType, inputFocused])

  // ---- Animate the items area height when switching tabs ----
  useLayoutEffect(() => {
    const el = itemsRef.current
    if (!el) return
    if (collapsedRef.current) { itemsHeightRef.current = el.scrollHeight; return }
    const newH = el.scrollHeight
    const prevH = itemsHeightRef.current
    itemsHeightRef.current = newH
    if (prevH == null || prevH === newH) return
    el.style.height = prevH + 'px'
    el.style.overflow = 'hidden'
    el.offsetHeight // force reflow
    el.style.transition = 'height 250ms ease'
    el.style.height = newH + 'px'
    const done = (e) => {
      if (e && e.propertyName !== 'height') return
      el.style.height = ''
      el.style.overflow = ''
      el.style.transition = ''
      el.removeEventListener('transitionend', done)
    }
    el.addEventListener('transitionend', done)
  }, [displayType])

  // ---- Collapse / expand the card body when the header is tapped ----
  useLayoutEffect(() => {
    const el = itemsRef.current
    if (!el) return
    // First run: apply the persisted collapsed state with no animation.
    if (!collapseMountedRef.current) {
      collapseMountedRef.current = true
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
      itemsHeightRef.current = el.scrollHeight
      el.removeEventListener('transitionend', done)
    }
    el.addEventListener('transitionend', done)
    return () => el.removeEventListener('transitionend', done)
  }, [collapsed])

  // Revealing or re-hiding completed / archived items changes how tall the body
  // should be, but nothing recomputes it — the collapse and tab-switch effects
  // both write an inline height on .project-items and only clear it on their own
  // transitionend. If one of those is still set, the body stays at the old size
  // and the newly shown rows get clipped. Drop the inline sizing and let it lay
  // out naturally whenever visibility changes.
  useLayoutEffect(() => {
    const el = itemsRef.current
    if (!el || collapsedRef.current) return
    el.style.height = ''
    el.style.overflow = ''
    itemsHeightRef.current = el.scrollHeight
  }, [hideCompleted, showArchived, showArchivedLinks])

  const applyCollapsed = useCallback((next) => {
    setCollapsed(next)
    try { localStorage.setItem(`collapsed-project-${project.id}`, next ? 'true' : 'false') } catch {}
  }, [project.id])

  // Tap anywhere on the header that isn't an interactive control to toggle.
  const handleHeaderClick = useCallback((e) => {
    if (renaming) return
    // A tab tap already expanded the card — don't let its click toggle it back.
    if (suppressHeaderToggleRef.current) { suppressHeaderToggleRef.current = false; return }
    if (e.target.closest('button, input, .dots-menu-wrap, .project-tab-bar, .card-context-menu')) return
    applyCollapsed(!collapsedRef.current)
  }, [renaming, applyCollapsed])

  // Capture the current items height before switching tabs so the height
  // animation starts from the right place (even if content changed in between).
  const switchTab = useCallback((type) => {
    // Set the tab first so the card expands straight onto it.
    setActiveTab(type)
    if (collapsedRef.current) {
      // Tapping a tab on a collapsed canvas expands it onto that tab. Null the
      // cached height so the tab-switch animation defers to the expand one.
      itemsHeightRef.current = null
      // Don't touch collapsedRef here — the header's toggle reads it, and
      // flipping it early made that toggle re-collapse the card straight away.
      // Instead, tell the header to skip the click this tap produces.
      suppressHeaderToggleRef.current = true
      applyCollapsed(false)
    } else if (itemsRef.current) {
      itemsHeightRef.current = itemsRef.current.scrollHeight
    }
  }, [applyCollapsed])

  // ---- Card intro animation ----
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    requestAnimationFrame(() => { card.classList.add('visible') })
  }, [])

  // ---- Auto-correct activeTab if its type is empty ----
  useEffect(() => {
    if (typesWithItems.length > 0 && !typesWithItems.includes(activeTab)) {
      setActiveTab(typesWithItems.find(t => visibleCount(t) > 0) || typesWithItems[0])
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
    const run = () => {
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
    }
    // Confirm before deleting any list item (todo), note or link.
    promptDelete(run)
  }, [categoryId, project.id, deleteProjectTodo, deleteProjectNote, deleteProjectLink, promptDelete])

  const handleActivate = useCallback((type, id, row) => {
    // Close swipe row immediately
    if (row) {
      row.classList.remove('swiped-left', 'swiped-right')
      const content = row.querySelector('.swipe-content')
      if (content) { content.style.transition = ''; content.style.transform = '' }
    }

    if (type === 'todo') {
      // Flash, then after it completes snapshot + toggle (triggers FLIP move)
      const wrapper = row?.parentElement
      if (wrapper) {
        const catIdx = categories.findIndex(c => c.id === categoryId)
        const accent = getCategoryAccent(catIdx)
        const hex = accent.light
        const r = parseInt(hex.slice(1, 3), 16)
        const g = parseInt(hex.slice(3, 5), 16)
        const b = parseInt(hex.slice(5, 7), 16)
        wrapper.animate(
          [
            { background: `rgba(${r},${g},${b},0)` },
            { background: `rgba(${r},${g},${b},0.6)`, offset: 0.4 },
            { background: `rgba(${r},${g},${b},0)` },
          ],
          { duration: 280, fill: 'none' }
        )
      }
      setTimeout(() => {
        if (todoContainerRef.current) {
          sortFlipRef.current = [...todoContainerRef.current.children].map(el => ({
            el, top: el.getBoundingClientRect().top,
          }))
        }
        toggleProjectTodoActivated(categoryId, project.id, id)
      }, 280)
    } else if (type === 'note') {
      // Flash immediately for notes (no reorder)
      const wrapper = row?.parentElement
      if (wrapper) {
        const catIdx = categories.findIndex(c => c.id === categoryId)
        const accent = getCategoryAccent(catIdx)
        const hex = accent.light
        const r = parseInt(hex.slice(1, 3), 16)
        const g = parseInt(hex.slice(3, 5), 16)
        const b = parseInt(hex.slice(5, 7), 16)
        wrapper.animate(
          [
            { background: `rgba(${r},${g},${b},0)` },
            { background: `rgba(${r},${g},${b},0.6)`, offset: 0.4 },
            { background: `rgba(${r},${g},${b},0)` },
          ],
          { duration: 280, fill: 'none' }
        )
      }
      toggleProjectNoteActivated(categoryId, project.id, id)
    } else if (type === 'link') {
      // Flash immediately for links (no reorder)
      const wrapper = row?.parentElement
      if (wrapper) {
        const catIdx = categories.findIndex(c => c.id === categoryId)
        const accent = getCategoryAccent(catIdx)
        const hex = accent.light
        const r = parseInt(hex.slice(1, 3), 16)
        const g = parseInt(hex.slice(3, 5), 16)
        const b = parseInt(hex.slice(5, 7), 16)
        wrapper.animate(
          [
            { background: `rgba(${r},${g},${b},0)` },
            { background: `rgba(${r},${g},${b},0.6)`, offset: 0.4 },
            { background: `rgba(${r},${g},${b},0)` },
          ],
          { duration: 280, fill: 'none' }
        )
      }
      toggleProjectLinkActivated(categoryId, project.id, id)
    }
  }, [categoryId, project.id, categories, toggleProjectTodoActivated, toggleProjectNoteActivated, toggleProjectLinkActivated])

  // Accent-color flash on a row wrapper (same highlight used when activating).
  const flashAccent = useCallback((wrapper) => {
    if (!wrapper) return
    const catIdx = categories.findIndex(c => c.id === categoryId)
    const accent = getCategoryAccent(catIdx)
    const hex = accent.light
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    wrapper.animate(
      [
        { background: `rgba(${r},${g},${b},0)` },
        { background: `rgba(${r},${g},${b},0.6)`, offset: 0.4 },
        { background: `rgba(${r},${g},${b},0)` },
      ],
      { duration: 280, fill: 'none' }
    )
  }, [categories, categoryId])

  // Archive a note: flash highlight, collapse the row away (as if activated), then
  // mark it archived. When Archived is being shown, skip the collapse so the row
  // simply re-styles in place / moves to the archived group.
  const handleArchive = useCallback((noteId, row) => {
    closeSwipeRow(row)
    const wrapper = row?.parentElement
    const finish = () => archiveProjectNote(categoryId, project.id, noteId)
    if (!wrapper || showArchived) { flashAccent(wrapper); finish(); return }
    flashAccent(wrapper)
    setTimeout(() => {
      const height = wrapper.getBoundingClientRect().height
      wrapper.style.height = height + 'px'; wrapper.style.overflow = 'hidden'
      requestAnimationFrame(() => requestAnimationFrame(() => {
        wrapper.style.transition = 'height 220ms ease, opacity 180ms ease'
        wrapper.style.height = '0'; wrapper.style.opacity = '0'
      }))
      setTimeout(finish, 250)
    }, 180)
  }, [categoryId, project.id, archiveProjectNote, flashAccent, showArchived])

  // Retrieve (unarchive) a note: flash, then move it back into the active list.
  const handleRetrieve = useCallback((noteId, row) => {
    closeSwipeRow(row)
    flashAccent(row?.parentElement)
    unarchiveProjectNote(categoryId, project.id, noteId)
  }, [categoryId, project.id, unarchiveProjectNote, flashAccent])

  const handleToggleShowArchived = useCallback(() => {
    setShowArchived(v => {
      const next = !v
      try { localStorage.setItem(`arch-project-${project.id}`, next ? 'true' : 'false') } catch {}
      return next
    })
  }, [project.id])

  // ---- Link archive (mirrors note archive) ----
  const handleArchiveLink = useCallback((linkId, row) => {
    closeSwipeRow(row)
    const wrapper = row?.parentElement
    const finish = () => archiveProjectLink(categoryId, project.id, linkId)
    if (!wrapper || showArchivedLinks) { flashAccent(wrapper); finish(); return }
    flashAccent(wrapper)
    setTimeout(() => {
      const height = wrapper.getBoundingClientRect().height
      wrapper.style.height = height + 'px'; wrapper.style.overflow = 'hidden'
      requestAnimationFrame(() => requestAnimationFrame(() => {
        wrapper.style.transition = 'height 220ms ease, opacity 180ms ease'
        wrapper.style.height = '0'; wrapper.style.opacity = '0'
      }))
      setTimeout(finish, 250)
    }, 180)
  }, [categoryId, project.id, archiveProjectLink, flashAccent, showArchivedLinks])

  const handleRetrieveLink = useCallback((linkId, row) => {
    closeSwipeRow(row)
    flashAccent(row?.parentElement)
    unarchiveProjectLink(categoryId, project.id, linkId)
  }, [categoryId, project.id, unarchiveProjectLink, flashAccent])

  const handleToggleShowArchivedLinks = useCallback(() => {
    setShowArchivedLinks(v => {
      const next = !v
      try { localStorage.setItem(`arch-link-project-${project.id}`, next ? 'true' : 'false') } catch {}
      return next
    })
  }, [project.id])

  // ---- Scheduling ----
  const setScheduledByType = useCallback((type, id, dateStr) => {
    if (type === 'todo') setProjectTodoScheduled(categoryId, project.id, id, dateStr)
    else if (type === 'note') setProjectNoteScheduled(categoryId, project.id, id, dateStr)
    else if (type === 'link') setProjectLinkScheduled(categoryId, project.id, id, dateStr)
  }, [categoryId, project.id, setProjectTodoScheduled, setProjectNoteScheduled, setProjectLinkScheduled])

  const handleScheduleClear = useCallback((type, id, row) => {
    closeSwipeRow(row)
    setScheduledByType(type, id, null)
  }, [setScheduledByType])

  const handleScheduleOpen = useCallback((type, item, el) => {
    const anchorRect = toAnchorRect(el)
    closeSwipeRow(el?.closest('.swipe-row'))
    setCalendarFor({ type, id: item.id, current: item.scheduledDate || null, anchorRect })
  }, [])

  // ---- Long-press row menu ----
  // Returns a builder the menu hook calls with the row element once the press
  // completes, so the existing row-anchored animations still work.
  const buildRowItems = useCallback((type, item) => (row) => {
    const noun = type === 'todo' ? 'Item' : type === 'note' ? 'Note' : 'Link'
    if (archived) {
      return [{ label: `Delete ${noun}`, icon: <TrashMenuIcon/>, danger: true, onSelect: () => handleDelete(type, item.id, row) }]
    }
    return [
      {
        label: item.activated ? 'Stop displaying' : 'Display',
        icon: <GalleryMenuIcon/>,
        onSelect: () => handleActivate(type, item.id, row),
      },
      {
        label: item.scheduledDate ? 'Clear Schedule' : 'Schedule',
        icon: <CalendarMenuIcon/>,
        onSelect: () => item.scheduledDate
          ? handleScheduleClear(type, item.id, row)
          : handleScheduleOpen(type, item, row),
      },
      {
        label: `Move ${type === 'todo' ? 'list item' : type}`,
        icon: <FolderMenuIcon/>,
        onSelect: () => { closeSwipeRow(row); setMoveItem({ type, id: item.id }) },
      },
      type === 'note' && {
        label: item.archived ? 'Unarchive Note' : 'Archive Note',
        icon: item.archived ? <RetrieveMenuIcon/> : <ArchiveMenuIcon/>,
        onSelect: () => item.archived ? handleRetrieve(item.id, row) : handleArchive(item.id, row),
      },
      type === 'link' && {
        label: item.archived ? 'Unarchive Link' : 'Archive Link',
        icon: item.archived ? <RetrieveMenuIcon/> : <ArchiveMenuIcon/>,
        onSelect: () => item.archived ? handleRetrieveLink(item.id, row) : handleArchiveLink(item.id, row),
      },
      {
        label: `Delete ${noun}`,
        icon: <TrashMenuIcon/>,
        danger: true,
        onSelect: () => handleDelete(type, item.id, row),
      },
    ]
  }, [archived, handleActivate, handleScheduleClear, handleScheduleOpen, handleRetrieve, handleArchive, handleRetrieveLink, handleArchiveLink, handleDelete])

  const handleCalendarSelect = useCallback((dateStr) => {
    setCalendarFor(prev => {
      if (!prev) return null
      if (prev.type === 'create') setAddScheduledDate(dateStr)
      else setScheduledByType(prev.type, prev.id, dateStr)
      return prev
    })
  }, [setScheduledByType])

  const calAccent = useMemo(() => {
    const idx = categories.findIndex(c => c.id === categoryId)
    return idx === -1 ? null : getCategoryAccent(idx)
  }, [categories, categoryId])

  const addActivePress = useActivatePress({
    onTap: () => { if (addScheduledDate) setAddScheduledDate(null); else setAddAsActive(v => !v) },
    onLongPress: () => {
      setAddAsActive(false)
      setCalendarFor({ type: 'create', anchorRect: toAnchorRect(addBtnRef.current) })
    },
  })

  // Tap a link row to open it; hold for 1s (without dragging) to edit it inline.
  const onLinkPointerDown = useCallback((e, link) => {
    if (e.target.closest('.swipe-action-btn') || e.target.closest('.link-outlink-btn')) return
    const row = e.currentTarget.closest('.swipe-row')
    if (!row) return
    if (row.classList.contains('swiped-left') || row.classList.contains('swiped-right')) return
    // NOTE: long-press used to open the inline link editor; that gesture now
    // belongs to the row action menu.
    const s = { startX: e.clientX, startY: e.clientY, dir: null }
    const onMove = (e2) => {
      const dx = e2.clientX - s.startX, dy = e2.clientY - s.startY
      if (!s.dir && (Math.abs(dx) > 10 || Math.abs(dy) > 8)) {
        s.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : 'scroll'
      }
    }
    const onUp = (e2) => {
      const dx = e2.clientX - s.startX, dy = e2.clientY - s.startY
      if (!s.dir && !isRowMenuOpen() && Math.abs(dx) < 8 && Math.abs(dy) < 8) setOpenLinkId(link.id)
      cleanup()
    }
    const cleanup = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [archived, setOpenLinkId])

  const saveLinkEdit = useCallback((linkId, title, url) => {
    updateProjectLink(categoryId, project.id, linkId, title, url)
    setEditingLinkId(null)
  }, [updateProjectLink, categoryId, project.id])

  const handleNoteSave = useCallback((noteId, html, text) => {
    updateProjectNote(categoryId, project.id, noteId, html, text)
  }, [updateProjectNote, categoryId, project.id])

  const onNotePointerDown = useCallback((e, id) => {
    if (e.target.closest('.swipe-action-btn')) return
    const row = e.currentTarget.closest('.swipe-row')
    if (!row) return
    // If swiped, the swipe hook handles closing; skip note-open logic entirely
    if (row.classList.contains('swiped-left') || row.classList.contains('swiped-right')) return
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
      if (!s.dir && Math.abs(dx) < 8 && !isRowMenuOpen()) setOpenNoteId(id)
      cleanup()
    }
    const cleanup = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [])

  const todoTapState = useRef({})
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
    const onUp = () => {
      if (!todoTapState.current.moved && !isRowMenuOpen()) setOpenTodoId(id)
      cleanup()
    }
    const cleanup = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [])

  const addItem = useCallback(() => {
    if (addType === 'link') {
      const url = linkUrlValue.trim()
      if (!url) return
      const title = inputValue.trim()
      const inputEl = inputRef.current
      if (inputEl) pendingAnim.current = { fromRect: inputEl.getBoundingClientRect(), text: title || displayUrl(url), addType }
      addProjectLink(categoryId, project.id, title, url, addAsActive, addScheduledDate)
      setInputValue('')
      setLinkUrlValue('')
      setAddScheduledDate(null)
      linkUrlRef.current?.blur()
      inputRef.current?.blur()
      return
    }
    const text = inputValue.trim()
    if (!text) return
    const inputEl = inputRef.current
    if (inputEl) pendingAnim.current = { fromRect: inputEl.getBoundingClientRect(), text, addType }
    if (addType === 'list') addProjectTodo(categoryId, project.id, text, addAsActive, addScheduledDate)
    else if (addType === 'note') {
      // After the new note flies into place, auto-open its editor. The id holder
      // tracks the note's id (temp → real) so we open whichever is current.
      const holder = { id: null }
      holder.id = addProjectNote(categoryId, project.id, text, addAsActive, addScheduledDate, (realId) => { holder.id = realId })
      setTimeout(() => { if (holder.id != null) { setAutoEditNoteId(holder.id); setOpenDetail({ type: 'note', id: holder.id }) } }, 650)
    }
    setInputValue('')
    setAddScheduledDate(null)
    inputRef.current?.blur()
  }, [inputValue, linkUrlValue, addType, addAsActive, addScheduledDate, categoryId, project.id, addProjectTodo, addProjectNote, addProjectLink, setOpenDetail, setAutoEditNoteId])

  // Keep the input wrap "focused" while focus moves between the title and URL fields
  const handleInputBlur = useCallback(() => {
    requestAnimationFrame(() => {
      const ae = document.activeElement
      if (ae && inputWrapRef.current && inputWrapRef.current.contains(ae)) return
      setInputFocused(false)
    })
  }, [])

  const placeholder =
    displayType === 'list' ? 'Add a task...' :
    displayType === 'note' ? 'Add a note...' : 'Add a link...'

  const linkMode = addType === 'link'
  const sendVisible = linkMode
    ? (inputFocused || !!inputValue.trim() || !!linkUrlValue.trim())
    : (inputFocused || !!inputValue.trim())
  // Derive the open item from the full data so it survives being moved to another project
  let openNote = null, openNoteCat = categoryId, openNoteProj = project
  if (openNoteId != null) {
    for (const cat of categories) {
      const p = cat.projects.find(pr => pr.notes.some(n => n.id === openNoteId))
      if (p) { openNote = p.notes.find(n => n.id === openNoteId); openNoteCat = cat.id; openNoteProj = p; break }
    }
  }
  let openTodo = null, openTodoCat = categoryId, openTodoProj = project
  if (openTodoId != null) {
    for (const cat of categories) {
      const p = cat.projects.find(pr => pr.todos.some(t => t.id === openTodoId))
      if (p) { openTodo = p.todos.find(t => t.id === openTodoId); openTodoCat = cat.id; openTodoProj = p; break }
    }
  }
  let openLink = null, openLinkCat = categoryId, openLinkProj = project
  if (openLinkId != null) {
    for (const cat of categories) {
      const p = cat.projects.find(pr => pr.links.some(l => l.id === openLinkId))
      if (p) { openLink = p.links.find(l => l.id === openLinkId); openLinkCat = cat.id; openLinkProj = p; break }
    }
  }

  return (
    <>
      {/* NOTE: don't add render-dependent classes to this element — the intro
          animation adds `visible` imperatively, and React rewrites className
          (wiping it) whenever the string changes. Put toggles on the header. */}
      {moveItem && (
        <MoveToCard
          categories={categories}
          currentCategoryId={categoryId}
          currentProjectId={project.id}
          onCancel={() => setMoveItem(null)}
          onSave={(sel) => {
            const { type, id } = moveItem
            setMoveItem(null)
            if (sel.projectId === project.id) return
            if (type === 'todo') moveProjectTodo(categoryId, project.id, sel.categoryId, sel.projectId, id)
            else if (type === 'note') moveProjectNote(categoryId, project.id, sel.categoryId, sel.projectId, id)
            else moveProjectLink(categoryId, project.id, sel.categoryId, sel.projectId, id)
          }}
        />
      )}

      {moveCanvasOpen && (
        <MoveToCard
          mode="pages"
          title="Move to..."
          categories={categories}
          currentCategoryId={categoryId}
          currentProjectId={project.id}
          onCancel={() => setMoveCanvasOpen(false)}
          onSave={(sel) => {
            setMoveCanvasOpen(false)
            moveProject(categoryId, project.id, sel.categoryId)
          }}
        />
      )}

      <div className={`card project-card card-intro${archived ? ' archived' : ''}`} ref={cardRef}>
        {/* Header */}
        <div className={`card-header${collapsed ? ' collapsed' : ''}`} onClick={handleHeaderClick}>
          {renaming ? (
            <div className="card-rename-wrap">
              <div className="project-input-wrap">
                <div className="project-input-row">
                  <input
                    ref={renameInputRef}
                    className="project-input"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); handleRenameSubmit() }
                      if (e.key === 'Escape') setRenaming(false)
                    }}
                    onBlur={() => setRenaming(false)}
                  />
                  {renameValue.trim() ? (
                    <button
                      className="project-send-btn visible"
                      onMouseDown={e => { e.preventDefault(); handleRenameSubmit() }}
                    >
                      <SendIcon/>
                    </button>
                  ) : (
                    <button
                      className="project-cancel-btn"
                      onMouseDown={e => { e.preventDefault(); setRenaming(false) }}
                    >
                      <CancelIcon/>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <span className={`card-title${archived ? ' archived-title' : ''}`}>{project.name}</span>
              {showTabs && (
                <div className="project-tab-bar" ref={tabBarRef}>
                  <div className="project-tab-indicator" ref={tabIndicatorRef}/>
                  {typesWithItems.includes('list') && (
                    <button
                      className={`project-tab-btn${selectedTab === 'list' ? ' selected' : ''}`}
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); switchTab('list') }}
                    >
                      <ListIcon size={20} color={selectedTab === 'list' ? 'var(--accent-dark)' : '#242424'}/>
                      <span className="project-tab-count">{visibleCount('list')}</span>
                    </button>
                  )}
                  {typesWithItems.includes('note') && (
                    <button
                      className={`project-tab-btn${selectedTab === 'note' ? ' selected' : ''}`}
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); switchTab('note') }}
                    >
                      <NoteIcon size={20} color={selectedTab === 'note' ? 'var(--accent-dark)' : '#242424'}/>
                      <span className="project-tab-count">{visibleCount('note')}</span>
                    </button>
                  )}
                  {typesWithItems.includes('link') && (
                    <button
                      className={`project-tab-btn${selectedTab === 'link' ? ' selected' : ''}`}
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); switchTab('link') }}
                    >
                      <LinkIcon size={20} color={selectedTab === 'link' ? 'var(--accent-dark)' : '#242424'}/>
                      <span className="project-tab-count">{visibleCount('link')}</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          <div className="project-header-actions">
          {!archived && (
            <button
              type="button"
              className="project-add-btn"
              onClick={() => requestCompose({ categoryId, projectId: project.id, type: displayType })}
            >
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M16 8 L16 24 M8 16 L24 16" stroke="#242424" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
              </svg>
            </button>
          )}
          <div className="dots-menu-wrap" ref={menuRef}>
            <div
              className="dots-menu dots-menu-btn"
              onMouseDown={e => { e.preventDefault(); setMenuOpen(v => !v) }}
            >
              <span/><span/><span/>
            </div>
              <div className={`card-context-menu${menuOpen ? ' open' : ''}`}>
                {displayType === 'list' && hasChecked && (
                  <button
                    className="card-context-item"
                    onMouseDown={e => { e.preventDefault(); handleToggleHideCompleted(); setMenuOpen(false) }}
                  >
                    {hideCompleted ? <EyeIcon/> : <EyeOffIcon/>}
                    {hideCompleted ? `Show ${checkedCount} Completed` : 'Hide Completed'}
                  </button>
                )}
                {displayType === 'note' && archivedNoteCount > 0 && (
                  <button
                    className="card-context-item"
                    onMouseDown={e => { e.preventDefault(); handleToggleShowArchived(); setMenuOpen(false) }}
                  >
                    {showArchived ? <EyeOffIcon/> : <EyeIcon/>}
                    {showArchived ? 'Hide Archived' : `Show ${archivedNoteCount} Archived`}
                  </button>
                )}
                {displayType === 'link' && archivedLinkCount > 0 && (
                  <button
                    className="card-context-item"
                    onMouseDown={e => { e.preventDefault(); handleToggleShowArchivedLinks(); setMenuOpen(false) }}
                  >
                    {showArchivedLinks ? <EyeOffIcon/> : <EyeIcon/>}
                    {showArchivedLinks ? 'Hide Archived' : `Show ${archivedLinkCount} Archived`}
                  </button>
                )}
                {!archived && (
                  <button
                    className="card-context-item"
                    onMouseDown={e => {
                      e.preventDefault()
                      setMenuOpen(false)
                      setRenameValue(project.name)
                      setRenaming(true)
                    }}
                  >
                    <EditIcon/>
                    Rename Canvas
                  </button>
                )}
                {!archived && (
                  <button
                    className="card-context-item"
                    onMouseDown={e => { e.preventDefault(); setMenuOpen(false); setMoveCanvasOpen(true) }}
                  >
                    <FolderMenuIcon/>
                    Move Canvas
                  </button>
                )}
                {archived ? (
                  <button
                    className="card-context-item"
                    onMouseDown={e => { e.preventDefault(); setMenuOpen(false); unarchiveProject(categoryId, project.id) }}
                  >
                    <RetrieveMenuIcon/>
                    Unarchive Canvas
                  </button>
                ) : (
                  <button
                    className="card-context-item"
                    onMouseDown={e => { e.preventDefault(); handleArchiveProject() }}
                  >
                    <ArchiveMenuIcon/>
                    Archive Canvas
                  </button>
                )}
                <button
                  className="card-context-item danger"
                  onMouseDown={e => { e.preventDefault(); handleDeleteProject() }}
                >
                  <TrashMenuIcon/>
                  Delete Canvas
                </button>
              </div>
          </div>
          </div>
        </div>

        {/* Items */}
        <div className="project-items" ref={itemsRef}>

          {/* ---- List (todos) ---- */}
          {displayType === 'list' && (
            <div ref={todoContainerRef}>
              {displayTodos.map((t, i) => (
                <div key={t.id}>
                  {i > 0 && <div className="divider"/>}
                  <div className={`swipe-row${t.id === openTodoId ? ' row-open' : ''}`} data-swipe-id={t.id}>
                    <div className="swipe-content">
                      <div
                        className={`todo-row${t.checked ? ' checked' : ''}`}
                        data-id={t.id}
                        onPointerDown={e => { rowMenu.press(e, buildRowItems('todo', t)); onTodoTap(e, t.id); if (!archived) onTodoDrag(e, t.id) }}
                        onContextMenu={e => rowMenu.context(e, buildRowItems('todo', t))}
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
                          <div
                            className={`checkbox${t.activated ? ' activated-checkbox' : ''}${t.checked ? ' checked' : ''}`}
                            style={{ '--cb-delay': `-${(String(t.id).split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 80) / 10}s`, '--cb-dir': (String(t.id).split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 2 ? 'reverse' : 'normal') }}
                          >
                            <svg className="checkmark" width="16" height="16" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        </div>
                        <div className="item-content">
                          <span className={`item-text${t.checked ? ' checked-text' : ''}`}>{t.text}</span>
                        </div>
                        {(t.scheduledDate && !t.activated) ? (
                          <span className="row-schedule-indicator"><span className="row-schedule-date">{formatScheduleShort(t.scheduledDate)}</span><CalendarIcon size={20}/></span>
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
          )}

          {/* Nothing visible but there are completed items — offer to reveal them */}
          {displayType === 'list' && hideCompleted && uncheckedCount === 0 && checkedCount > 0 && (
            <button
              className="project-reveal-link"
              onMouseDown={e => { e.preventDefault(); handleToggleHideCompleted() }}
            >
              <span className="project-reveal-icon" aria-hidden="true"><EyeIcon/></span>
              Show {checkedCount} Completed
            </button>
          )}

          {/* ---- Notes ---- */}
          {displayType === 'note' && (
            <div ref={noteContainerRef}>
              {displayNotes.map((n, i) => (
                <div key={n.id}>
                  {i > 0 && <div className="divider"/>}
                  <div className={`swipe-row${n.id === openNoteId ? ' row-open' : ''}`} data-swipe-id={n.id}>
                    <div className="swipe-content">
                      <div
                        className={`note-row${n.archived ? ' archived' : ''}`}
                        data-note-id={n.id}
                        onPointerDown={e => { rowMenu.press(e, buildRowItems('note', n)); onNotePointerDown(e, n.id); if (!archived) onNoteDrag(e, n.id) }}
                        onContextMenu={e => rowMenu.context(e, buildRowItems('note', n))}
                      >
                        <div className="checkbox-wrap" style={{ pointerEvents: 'none' }}>
                          <svg width="24" height="24" viewBox="0 0 20 22" fill="none">
                            {n.activated && (
                              <defs>
                                <filter id={`ni-${n.id}`} x="-50%" y="-50%" width="200%" height="200%">
                                  <feOffset dx="4" dy="8"/>
                                  <feGaussianBlur stdDeviation="4" result="ob"/>
                                  <feComposite operator="out" in="SourceGraphic" in2="ob" result="inv"/>
                                  <feFlood style={{ floodColor: 'var(--accent-light)', floodOpacity: 1 }} result="col"/>
                                  <feComposite operator="in" in="col" in2="inv" result="sh"/>
                                  <feComposite operator="over" in="sh" in2="SourceGraphic"/>
                                </filter>
                              </defs>
                            )}
                            {n.activated && <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" fill="#F7F6F3" filter={`url(#ni-${n.id})`}/>}
                            <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" stroke={n.activated ? 'var(--accent-dark)' : '#7A7A7A'} strokeWidth="1" fill="none"/>
                            <path d="M12 3v5h5" stroke={n.activated ? 'var(--accent-dark)' : '#7A7A7A'} strokeWidth="1" fill="none"/>
                            <line x1="5" y1="13" x2="15" y2="13" stroke={n.activated ? 'var(--accent-dark)' : '#7A7A7A'} strokeWidth="1" strokeLinecap="round"/>
                            <line x1="5" y1="16.5" x2="12" y2="16.5" stroke={n.activated ? 'var(--accent-dark)' : '#7A7A7A'} strokeWidth="1" strokeLinecap="round"/>
                          </svg>
                        </div>
                        <div className="item-content">
                          <NoteRowContent note={n} />
                        </div>
                        {(n.scheduledDate && !n.activated) && (
                          <span className="row-schedule-indicator"><span className="row-schedule-date">{formatScheduleShort(n.scheduledDate)}</span><CalendarIcon size={20}/></span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {displayType === 'note' && !showArchived && activeNotesList.length === 0 && archivedNoteCount > 0 && (
            <button
              className="project-reveal-link"
              onMouseDown={e => { e.preventDefault(); handleToggleShowArchived() }}
            >
              <span className="project-reveal-icon" aria-hidden="true"><EyeIcon/></span>
              Show {archivedNoteCount} Archived
            </button>
          )}

          {/* ---- Links ---- */}
          {displayType === 'link' && (
            <div ref={linkContainerRef}>
              {displayLinks.map((l, i) => (
                <div key={l.id}>
                  {i > 0 && <div className="divider"/>}
                  <div className={`swipe-row${l.id === openLinkId ? ' row-open' : ''}`} data-swipe-id={l.id}>
                    <div className="swipe-content">
                      {editingLinkId === l.id ? (
                        <LinkRowEditor
                          link={l}
                          onSave={(t, u) => saveLinkEdit(l.id, t, u)}
                          onCancel={() => setEditingLinkId(null)}
                        />
                      ) : (
                      <div
                        className={`note-row link-row${l.archived ? ' archived' : ''}`}
                        onPointerDown={e => { rowMenu.press(e, buildRowItems('link', l)); onLinkPointerDown(e, l); if (!archived) onLinkDrag(e, l.id) }}
                        onContextMenu={e => rowMenu.context(e, buildRowItems('link', l))}
                      >
                        <div className="checkbox-wrap" style={{ pointerEvents: 'none' }}>
                          <LinkRowIcon activated={l.activated}/>
                        </div>
                        <div className="item-content">
                          <div className="link-row-text">
                            <span className="note-text">{l.title}</span>
                            <span className="note-preview-text">{displayUrl(l.url)}</span>
                          </div>
                        </div>
                        {(l.scheduledDate && !l.activated) && (
                          <span className="row-schedule-indicator"><span className="row-schedule-date">{formatScheduleShort(l.scheduledDate)}</span><CalendarIcon size={20}/></span>
                        )}
                        <OutlinkButton onOpen={() => openUrl(l.url)} />
                      </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {displayType === 'link' && !showArchivedLinks && activeLinksList.length === 0 && archivedLinkCount > 0 && (
            <button
              className="project-reveal-link"
              onMouseDown={e => { e.preventDefault(); handleToggleShowArchivedLinks() }}
            >
              <span className="project-reveal-icon" aria-hidden="true"><EyeIcon/></span>
              Show {archivedLinkCount} Archived
            </button>
          )}
        </div>

        {/* Input — removed; items are added from the footer text box. Set
            SHOW_PROJECT_INPUT (top of file) to true to restore. Hidden on
            archived (read-only) canvases regardless. */}
        {SHOW_PROJECT_INPUT && !archived && (
        <div className={`project-input-wrap${inputFocused ? ' focused' : ''}${linkMode ? ' link-mode' : ''}`} ref={inputWrapRef}>
          <div className="project-input-row">
            <input
              ref={inputRef}
              className="project-input"
              placeholder={linkMode && inputFocused ? 'Title your link' : placeholder}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={handleInputBlur}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (linkMode) linkUrlRef.current?.focus(); else addItem() } }}
            />
            <button
              className={`project-send-btn${sendVisible ? ' visible' : ''}`}
              onMouseDown={e => { e.preventDefault(); addItem() }}
            >
              <SendIcon/>
            </button>
          </div>
          <div className={`project-link-url-row${linkMode && inputFocused ? ' open' : ''}`}>
            <div className="project-input-divider"/>
            <input
              ref={linkUrlRef}
              className="project-input project-link-url-input"
              placeholder="Add link"
              value={linkUrlValue}
              onChange={e => setLinkUrlValue(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={handleInputBlur}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
              tabIndex={linkMode && inputFocused ? 0 : -1}
            />
          </div>
          <div className="project-input-bottom">
            <div className="project-input-divider"/>
            <div className="project-footer-toolbar">
              <div className="project-toolbar-left">
                <button
                  ref={addBtnRef}
                  className={`project-active-btn${addAsActive ? ' on' : ''}${addScheduledDate ? ' scheduled' : ''}`}
                  {...addActivePress}
                >
                  {addScheduledDate ? <CalendarIcon size={16}/> : <ActivateIcon activated={addAsActive}/>}
                  <span>{addScheduledDate ? formatSchedule(addScheduledDate) : (addAsActive ? 'Displayed' : 'Display')}</span>
                </button>
              </div>
              <div className="project-toolbar-divider"/>
              <div className="project-toolbar-right" ref={typeBarRef}>
                <div className="project-type-indicator" ref={typeIndicatorRef}/>
                <button
                  className={`project-type-btn${addType === 'list' ? ' selected' : ''}`}
                  onMouseDown={e => { e.preventDefault(); setAddType('list') }}
                >
                  <ListIcon size={20} color={addType === 'list' ? 'var(--accent-dark)' : '#242424'}/>
                </button>
                <button
                  className={`project-type-btn${addType === 'note' ? ' selected' : ''}`}
                  onMouseDown={e => { e.preventDefault(); setAddType('note') }}
                >
                  <NoteIcon size={20} color={addType === 'note' ? 'var(--accent-dark)' : '#242424'}/>
                </button>
                <button
                  className={`project-type-btn${addType === 'link' ? ' selected' : ''}`}
                  onMouseDown={e => { e.preventDefault(); setAddType('link') }}
                >
                  <LinkIcon size={20} color={addType === 'link' ? 'var(--accent-dark)' : '#242424'}/>
                </button>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {openNote && createPortal(
        <NoteDetailPage
          note={{ ...openNote, categoryId: openNoteCat }}
          onClose={() => setOpenNoteId(null)}
          onSave={(noteId, html, text) => updateProjectNote(openNoteCat, openNoteProj.id, noteId, html, text)}
          activated={!!openNote.activated}
          onToggleActive={() => toggleProjectNoteActivated(openNoteCat, openNoteProj.id, openNote.id)}
          onSchedule={(date) => setProjectNoteScheduled(openNoteCat, openNoteProj.id, openNote.id, date)}
          onClearSchedule={() => setProjectNoteScheduled(openNoteCat, openNoteProj.id, openNote.id, null)}
          projectName={openNoteProj.name}
          categoryId={openNoteCat}
          projectId={openNoteProj.id}
          archived={!!(openNote.archived || openNoteProj?.archived)}
        />,
        document.getElementById('app')
      )}

      {openTodo && createPortal(
        <TodoDetailPage
          todo={openTodo}
          categoryId={openTodoCat}
          projectId={openTodoProj.id}
          projectNotes={openTodoProj.notes}
          projectLinks={openTodoProj.links}
          onClose={() => setOpenTodoId(null)}
          archived={!!openTodoProj?.archived}
        />,
        document.getElementById('app')
      )}

      {openLink && createPortal(
        <LinkDetailPage
          link={openLink}
          categoryId={openLinkCat}
          projectId={openLinkProj.id}
          onClose={() => setOpenLinkId(null)}
        />,
        document.getElementById('app')
      )}

      {calendarFor && (
        <CalendarPopup
          anchorRect={calendarFor.anchorRect}
          initialDate={calendarFor.type === 'create' ? addScheduledDate : calendarFor.current}
          accent={calAccent}
          onSelect={handleCalendarSelect}
          onClose={() => setCalendarFor(null)}
        />
      )}

      <RowActionMenu state={rowMenu.state} onClose={rowMenu.close} />
    </>
  )
}
