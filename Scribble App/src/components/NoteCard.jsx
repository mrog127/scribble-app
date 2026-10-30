import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { lockRowDrag, unlockRowDrag } from '../rowDragLock.js'
import { swappedFrom } from '../noteIdSwap.js'
import { moveWithAnimation } from '../moveFx.js'
import { soloItem, DONE_LABEL } from '../soloWindow.js'
import { createPortal } from 'react-dom'
import underlineUrl from '../assets/Underline.svg?url'
import { useAppContext } from '../context/AppContext.jsx'
import { getCategoryAccent, getInboxAccent } from '../theme.js'
import DetailFooter from './DetailFooter.jsx'
import { useScrollable } from '../useScrollable.js'
import MoveToCard from './MoveToCard.jsx'
import { useRowMenu, RowActionMenu, isRowMenuOpen } from './RowMenu.jsx'
import { useTheme } from '../useTheme.js'
import { FileIcon as FeatherFileIcon, LinkIcon as FeatherLinkIcon } from './FeatherIcons.jsx'
import { LinkGridCard, NoteRowContent } from './ProjectCard.jsx'
import { NoteRowIcon } from './TodoDetailPage.jsx'
import { TrashMenuIcon, ArchiveMenuIcon, RetrieveMenuIcon, CopyMenuIcon } from './MenuIcons.jsx'
import { buildDragCloneShell, dragLiftShadow } from '../dragClone.js'
import { useDetailLock, lockPageClass, DetailLockButton } from '../detailLock.jsx'
import { useCardHostsDetail } from '../detailLock.jsx'
import { uploadNoteImage } from '../noteImages.js'
import { functionsUrl, functionsKey } from '../supabaseClient'

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// A note's HTML as it's saved: a photo still uploading (its src a local blob:
// URL) is left out until its upload lands and swaps in the real URL
function serializeNote(content) {
  if (!content.querySelector('img[data-pending], .note-photo-trash, .style-embed')) return content.innerHTML
  const copy = content.cloneNode(true)
  // An attached note or link block is saved as just its shell (which item(s));
  // what it shows is drawn from the live note / link each time
  copy.querySelectorAll('.note-para.style-embed').forEach(b => { b.innerHTML = ''; b.classList.remove('show-x') })
  copy.querySelectorAll('img[data-pending]').forEach(img => (img.closest('.note-para') || img).remove())
  copy.querySelectorAll('.note-photo-trash').forEach(b => b.remove())
  copy.querySelectorAll('.style-image.show-trash').forEach(p => p.classList.remove('show-trash'))
  return copy.innerHTML
}

const TRASH_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'

// The attach button's icon: a paperclip, 2pt
function MediaIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
    </svg>
  )
}
// The Photo row's icon in the attach menu: a photo frame
function PhotoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  )
}
const EMBED_X_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
)

// A note's text, for the note picker: everything after its title, flattened
function notePreviewOf(html) {
  if (!html) return ''
  const d = document.implementation.createHTMLDocument('').createElement('div')
  d.innerHTML = html
  const paras = [...d.querySelectorAll('.note-para')].slice(1)
  return paras.map(p => p.textContent.trim()).filter(Boolean).join(' ').slice(0, 120)
}

// An attached note or link(s) inside a note (drawn into its block, which is
// part of the editable text): a note shows as its row on a light grey card;
// links as link tiles, in columns as in a canvas card. Editing, a hover or tap
// shows the photo's X, which takes it out; otherwise it opens like any row or
// tile does.
function NoteEmbedBlock({ type, ids, project, categoryId, projectId, editing, onRemove, onOpenNote, onOpenLink }) {
  const [xFor, setXFor] = useState(null)   // touch: the item whose X is showing
  useEffect(() => { if (!editing) setXFor(null) }, [editing])
  const item = (id, children, extraClass) => (
    <div
      key={id}
      className={`note-embed-item${extraClass ? ' ' + extraClass : ''}${xFor === id ? ' show-x' : ''}`}
      // Editing, a tap shows its X (a second one hides it) and opens nothing
      onClickCapture={e => {
        if (!editing) return
        if (e.target.closest?.('.note-embed-x')) return
        e.preventDefault(); e.stopPropagation()
        setXFor(v => (v === id ? null : id))
      }}
    >
      {children}
      {editing && (
        <button
          type="button"
          className="note-photo-trash note-embed-x"
          aria-label="Remove"
          onMouseDown={e => e.preventDefault()}
          onClick={e => { e.stopPropagation(); setXFor(null); onRemove(id) }}
        >{EMBED_X_SVG}</button>
      )}
    </div>
  )
  if (type === 'note') {
    const n = project?.notes.find(x => String(x.id) === String(ids[0]))
    if (!n) return null
    return item(ids[0], (
      <div className="note-row note-embed-note" onClick={() => onOpenNote(n.id)}>
        <div className="checkbox-wrap" style={{ pointerEvents: 'none' }}><NoteRowIcon activated={n.activated}/></div>
        <div className="item-content"><NoteRowContent note={n}/></div>
      </div>
    ))
  }
  const links = ids.map(id => project?.links.find(l => String(l.id) === String(id))).filter(Boolean)
  if (!links.length) return null
  return (
    <div className="link-grid note-embed-links">
      {links.map(l => item(l.id, (
        <LinkGridCard link={l} categoryId={categoryId} projectId={projectId} onOpenPage={() => onOpenLink(l.id)}/>
      ), 'link-grid-cell'))}
    </div>
  )
}

// The highlight button's icon: a highlighter, 2pt
function HighlightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 11-6 6v3h9l3-3"/>
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>
    </svg>
  )
}

function buildNoteContent(note) {
  if (note.editorHTML) return note.editorHTML
  return `<div class="note-para style-title">${escapeHtml(note.text)}</div><div class="note-para style-body"><br></div>`
}

function useDragReorder(containerRef, items, onReorder) {
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
    if (e.target.closest('.swipe-action-btn')) return
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
      const dragged = snapshots[dragIdx]
      const appEl = document.getElementById('app')
      const portal = document.getElementById('animation-portal')
      if (!appEl || !portal) return false
      const appRect = appEl.getBoundingClientRect()
      const origTop = dragged.rect.top - appRect.top
      const cloneTop = origTop - 4

      const cloneInner = dragged.el.cloneNode(true)
      const { content: cloneShell, skin: cloneSkin } = buildDragCloneShell(dragged.el, cloneInner)
      const clone = document.createElement('div')
      clone.style.cssText = [
        'position:absolute',
        `left:${dragged.rect.left - appRect.left - 4}px`,
        `top:${cloneTop}px`,
        `width:${dragged.rect.width + 8}px`,
        'padding:4px 0',
        'pointer-events:none',
        ...cloneSkin,
        'overflow:hidden',
        'z-index:999',
      ].join(';')
      clone.appendChild(cloneShell)
      portal.appendChild(clone)
      dragged.wrapper.style.opacity = '0'
      dragRef.current = {
        clone, snapshots, dragIdx, currentIdx: dragIdx,
        cloneTop, startY: clientY, draggedH: dragged.wrapper.getBoundingClientRect().height,
      }
      return true
    }

    const doStart = (clientY, longPress) => {
      if (started) return
      started = start(clientY); if (started) lockRowDrag()
      if (!started) return
      if (longPress) {
        const s = dragRef.current
        if (s) {
          s.clone.style.transition = 'box-shadow 120ms ease'
          s.clone.style.boxShadow = dragLiftShadow()
          setTimeout(() => { if (dragRef.current === s) s.clone.style.transition = '' }, 120)
        }
      }
    }

    longPressTimer = setTimeout(() => { longPressTimer = null; doStart(startY, true) }, 250)
    document.addEventListener('touchmove', preventScroll, { passive: false })

    const applyShifts = (snapshots, dragIdx, newIdx, draggedH) => {
      snapshots.forEach((snap, i) => {
        if (i === dragIdx) return
        let dy = 0
        if (newIdx < dragIdx && i >= newIdx && i < dragIdx) dy = draggedH
        if (newIdx > dragIdx && i > dragIdx && i <= newIdx) dy = -draggedH
        snap.wrapper.style.transition = 'transform 180ms ease'
        snap.wrapper.style.transform = dy ? `translateY(${dy}px)` : ''
      })
    }

    const onMove = (e2) => {
      const dx = Math.abs(e2.clientX - startX), dy = Math.abs(e2.clientY - startY)
      if (longPressTimer && (dx > 8 || dy > 8)) { clearTimeout(longPressTimer); longPressTimer = null; document.removeEventListener('touchmove', preventScroll); unlockRowDrag() }
      if (!started) return
      e2.preventDefault()
      const s = dragRef.current
      if (!s) return
      s.clone.style.top = (s.cloneTop + (e2.clientY - s.startY)) + 'px'
      const nonDragged = s.snapshots.filter((_, i) => i !== s.dragIdx)
      let insertAt = nonDragged.length
      for (let j = 0; j < nonDragged.length; j++) {
        if (e2.clientY < nonDragged[j].rect.top + nonDragged[j].rect.height / 2) { insertAt = j; break }
      }
      const newIdx = Math.min(insertAt, s.snapshots.length - 1)
      if (newIdx !== s.currentIdx) { s.currentIdx = newIdx; applyShifts(s.snapshots, s.dragIdx, s.currentIdx, s.draggedH) }
    }

    const onCancel = () => {
      clearTimeout(longPressTimer); longPressTimer = null
      document.removeEventListener('pointermove', onMove, { passive: false })
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('touchmove', preventScroll); unlockRowDrag()
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
      document.removeEventListener('touchmove', preventScroll); unlockRowDrag()
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

      const visibleIds = s.snapshots.map(sn => sn.id)
      const [movedId] = visibleIds.splice(s.dragIdx, 1)
      visibleIds.splice(s.currentIdx, 0, movedId)
      const allItems = itemsRef.current
      const newOrder = visibleIds.map(sid => allItems.find(it => it.id === sid)).filter(Boolean)
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

function NoteDetailPage({ note, onClose, onSave, activated, onToggleActive, onSchedule, onClearSchedule, projectName, categoryId, projectId, archived = false, instantOpen = false }) {
  const darkDots = ['dark-dots', 'light-dots'].includes(useTheme())
  const darkDotsRef = useRef(darkDots)
  darkDotsRef.current = darkDots
  const noteTitleRef = useRef(note?.text)
  noteTitleRef.current = note?.text
  // Archived notes (or notes in an archived canvas) are read-only: no editing, no footer.
  const hasFooter = !!projectName && typeof onToggleActive === 'function' && !archived
  const { categories, moveProjectNote, autoEditNoteId, setAutoEditNoteId,
    promptDelete, deleteProjectNote, archiveProjectNote, unarchiveProjectNote, isInboxId, setOpenDetail,
    addProjectLink, updateProjectLink } = useAppContext()
  // An Inbox note's page is a reduced one: Delete is its menu's only option
  const inInbox = isInboxId(categoryId)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveTop, setMoveTop] = useState(null)
  const noteAccent = useMemo(() => {
    if (inInbox) return getInboxAccent()
    if (!note?.categoryId) return null
    const idx = categories.findIndex(c => c.id === note.categoryId)
    if (idx === -1) return null
    return getCategoryAccent(idx)
  }, [note, categories, inInbox])

  const [editing, setEditing] = useState(false)
  // Title-only editing (Dots themes): tapping the title edits just the title,
  // like a list item page — the body stays put, and Save / Enter / tapping away
  // saves it. Separate from editing the body (`editing`).
  const [editingTitle, setEditingTitle] = useState(false)
  const editingTitleRef = useRef(false)
  const skipButtonClickRef = useRef(false)
  const editingRef = useRef(false)
  const [currentStyle, setCurrentStyle] = useState('body')
  const [isOpen, setIsOpen] = useState(instantOpen)
  const lock = useDetailLock(projectId ? 'note' : 'local-note', note.id)
  const [copied, setCopied] = useState(false)
  const contentRef = useRef(null)
  const styleBarRef = useRef(null)
  const indicatorRef = useRef(null)
  const pageRef = useRef(null)
  const editorRef = useRef(null)
  const scrollTitleRef = useRef(null)
  // Dark Dots shows the note's title above the body card, in its own field
  const titleFieldRef = useRef(null)
  const lastCursorParaRef = useRef(null)

  // Check whether the last paragraph is below the style bar.
  // Only fires on scroll — not on input — so the fade appears only when the user
  // has manually scrolled up and left content hidden, not while actively typing.
  const checkBottomOverflow = useCallback((editor) => {
    const content = contentRef.current
    const page = pageRef.current
    if (!content || !page) return
    const paras = content.querySelectorAll('.note-para')
    const lastPara = paras[paras.length - 1]
    if (!lastPara) { editor.classList.remove('has-overflow-below'); return }
    const kbh = parseFloat(page.style.getPropertyValue('--kbh') || '0') || 0
    const pageBottom = page.getBoundingClientRect().bottom
    const styleBarTop = pageBottom - kbh - 76  // 56px bar + 20px gap
    editor.classList.toggle('has-overflow-below', lastPara.getBoundingClientRect().bottom > styleBarTop + 4)
  }, [])

  // Slide in on mount
  useEffect(() => {
    requestAnimationFrame(() => setIsOpen(true))
  }, [])

  const openMove = useCallback(() => {
    const titleEl = contentRef.current?.querySelector('.note-para')
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
    if (!categoryId || !projectId || (sel.categoryId === categoryId && sel.projectId === projectId)) return
    moveWithAnimation({
      type: 'note', id: note.id, toCategoryId: sel.categoryId, toProjectId: sel.projectId, title: note.text,
      commit: () => moveProjectNote(categoryId, projectId, sel.categoryId, sel.projectId, note.id),
    })
  }, [categoryId, projectId, note?.id, note?.text, moveProjectNote])

  // Track keyboard height and push style bar above it (mobile)
  useEffect(() => {
    const vv = window.visualViewport
    const update = () => {
      const page = pageRef.current
      if (!page) return
      const pageBottom = page.getBoundingClientRect().bottom
      // Do NOT include vv.offsetTop — iOS scrolls the visual viewport when the caret is
      // near the bottom, increasing offsetTop and shrinking the computed kbh incorrectly.
      // Keyboard height is simply pageBottom minus the (unscrolled) visual viewport height.
      const vvHeight = vv ? vv.height : window.innerHeight
      const kbh = Math.max(0, pageBottom - vvHeight)
      page.style.setProperty('--kbh', kbh + 'px')
    }
    if (vv) {
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
    }
    // Fallback: vv.resize timing is unreliable on some iOS versions —
    // also poll after the contenteditable is focused (keyboard starts opening)
    const onFocusIn = (e) => {
      if (e.target === contentRef.current) {
        setTimeout(update, 100)
        setTimeout(update, 400)
      }
    }
    document.addEventListener('focusin', onFocusIn)
    return () => {
      if (vv) {
        vv.removeEventListener('resize', update)
        vv.removeEventListener('scroll', update)
      }
      document.removeEventListener('focusin', onFocusIn)
      if (pageRef.current) pageRef.current.style.removeProperty('--kbh')
    }
  }, [])

  // Rebuild the editor when a different note is shown — but not when this same
  // note just traded its temporary id for its real one (see noteIdSwap.js), or
  // whatever you've started typing would be wiped.
  const shownNoteIdRef = useRef(null)
  const isIdSwap = () => shownNoteIdRef.current != null && swappedFrom.get(note?.id) === shownNoteIdRef.current

  // Autosave: typing saves as you go (shortly after you pause), and anything not
  // yet saved is written when the note closes, another note replaces it, or the
  // app is hidden / closed — so nothing depends on pressing Save.
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const noteTextRef = useRef(note?.text)
  noteTextRef.current = note?.text
  const autosaveIdRef = useRef(null)      // the note whose content is in the editor
  const savedHtmlRef = useRef(null)       // what was last saved for it
  const autosaveTimerRef = useRef(null)
  // The editor element itself, kept so a save on close still has it after React
  // has detached contentRef
  const autosaveElRef = useRef(null)
  const flushAutosave = useCallback(() => {
    clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = null
    const content = contentRef.current || autosaveElRef.current
    const id = autosaveIdRef.current
    if (!content || id == null) return
    const html = serializeNote(content)
    if (html === savedHtmlRef.current) return
    savedHtmlRef.current = html
    const firstPara = content.querySelector('.note-para')
    onSaveRef.current(id, html, firstPara ? firstPara.textContent.trim() : (noteTextRef.current || ''))
  }, [])
  const scheduleAutosave = useCallback(() => {
    clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(flushAutosave, 700)
  }, [flushAutosave])
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushAutosave() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flushAutosave)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flushAutosave)
      flushAutosave()   // closing the note (or switching to another) saves it
    }
  }, [flushAutosave])

  useEffect(() => {
    const swap = isIdSwap()
    shownNoteIdRef.current = note?.id
    if (swap) { autosaveIdRef.current = note?.id; return }
    // A different note is replacing this one in place: save what was typed first
    flushAutosave()
    if (contentRef.current) {
      contentRef.current.innerHTML = buildNoteContent(note)
      autosaveIdRef.current = note?.id
      autosaveElRef.current = contentRef.current
      // Heal notes saved with stray lines (see enforceTitlePara) as they open
      if (enforceTitlePara()) {
        const firstPara = contentRef.current.querySelector('.note-para')
        onSave(note.id, serializeNote(contentRef.current), firstPara ? firstPara.textContent.trim() : note.text)
      }
      savedHtmlRef.current = contentRef.current.innerHTML
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id])

  // The title field mirrors the first paragraph: it shows that text, and typing
  // in it writes straight back, so saving and the row label are unchanged.
  useEffect(() => {
    if (!darkDots || !titleFieldRef.current) return
    if (titleFieldRef.current.textContent && document.activeElement && pageRef.current?.contains(document.activeElement)) return   // mid-edit (an id swap): leave it
    const first = contentRef.current?.querySelector('.note-para')
    const text = (first?.textContent || '').trim()
    titleFieldRef.current.textContent = text
    if (scrollTitleRef.current) scrollTitleRef.current.textContent = text
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, darkDots])

  // Scroll title visibility + underline fade
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const check = () => {
      const content = contentRef.current
      const titleEl = scrollTitleRef.current
      const editorTop = editor.getBoundingClientRect().top

      // Scroll title: fade + float
      if (content && titleEl) {
        const firstPara = content.querySelector('.note-para')
        if (firstPara) {
          const paraBottom = firstPara.getBoundingClientRect().bottom
          const shouldShow = paraBottom <= editorTop + 32
          titleEl.style.opacity = shouldShow ? '1' : '0'
          titleEl.style.transform = shouldShow ? 'translateY(0)' : 'translateY(8px)'
          if (shouldShow) titleEl.textContent = firstPara.textContent.trim()
        }
      }

      // Bottom overflow: show fade only when the last paragraph is below the style bar,
      // meaning the user has scrolled up and left content hidden. Don't use scroll math —
      // padding-bottom (kbh+144) inflates scrollHeight and makes arithmetic unreliable.
      checkBottomOverflow(editor)
    }
    editor.addEventListener('scroll', check, { passive: true })
    return () => editor.removeEventListener('scroll', check)
  }, [])

  // Initial overflow check when editing state changes (no input listener — scroll-only detection)
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    checkBottomOverflow(editor)
  }, [editing])

  const updateStyleIndicator = useCallback((style) => {
    const btn = document.querySelector(`.note-style-btn[data-style="${style}"]`)
    const span = btn?.querySelector('span')
    const ind = indicatorRef.current
    if (btn && span && ind) {
      ind.style.transition = 'left 100ms ease, width 100ms ease'
      if (['dark-dots', 'light-dots'].includes(document.documentElement.dataset.theme)) {
        // Dark Dots: the tabs split the bar evenly — the pill fills the tab
        ind.style.left = btn.offsetLeft + 'px'
        ind.style.width = btn.offsetWidth + 'px'
      } else {
        // Center indicator on the text label, extending 12px on each side
        const textLeft = btn.offsetLeft + span.offsetLeft
        ind.style.left = (textLeft - 12) + 'px'
        ind.style.width = (span.offsetWidth + 24) + 'px'
      }
      ind.style.opacity = ''
    } else if (ind) {
      // No button for this style — the note title, which has no toolbar entry.
      ind.style.opacity = '0'
    }
  }, [])

  // Detect the paragraph style at the current cursor position
  // Find the note-para the caret is in. Handles the case where the caret is
  // collapsed directly on the content div (e.g. at the end of the note), where
  // anchorNode is the content element rather than a node inside a paragraph.
  const getCursorPara = useCallback(() => {
    const content = contentRef.current
    const sel = window.getSelection()
    if (!content || !sel || sel.rangeCount === 0) return null
    let node = sel.anchorNode
    if (node === content) {
      node = content.childNodes[sel.anchorOffset] || content.childNodes[sel.anchorOffset - 1] || content.lastChild
    }
    while (node && node !== content) {
      if (node.nodeType === 1 && node.classList && node.classList.contains('note-para')) return node
      node = node.parentNode
    }
    return null
  }, [])

  // Every leaf paragraph a (non-collapsed) selection touches, in order
  const getSelectedParas = useCallback(() => {
    const content = contentRef.current
    const sel = window.getSelection()
    if (!content || !sel || sel.rangeCount === 0 || sel.isCollapsed) return []
    const range = sel.getRangeAt(0)
    if (!content.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== content) return []
    return [...content.querySelectorAll('.note-para')]
      .filter(p => !p.querySelector('.note-para') && range.intersectsNode(p))
      // A selection ending at the very start of the next line doesn't count it
      .filter(p => !(range.endContainer && p.contains(range.endContainer) && range.endOffset === 0 && p !== getParaOf(range.startContainer)))
  }, [])

  const detectCursorStyle = useCallback(() => {
    const para = getCursorPara()
    if (!para) return
    lastCursorParaRef.current = para
    // A selection across several lines: their style if they all share one,
    // otherwise no style is lit
    const selected = getSelectedParas()
    if (selected.length > 1) {
      const styles = new Set(selected.map(p => (p.className.match(/style-(\w+)/) || [])[1] || 'body'))
      const only = styles.size === 1 ? [...styles][0] : null
      setCurrentStyle(only)
      updateStyleIndicator(only)
      return
    }
    const match = para.className.match(/style-(\w+)/)
    if (match) {
      setCurrentStyle(match[1])
      updateStyleIndicator(match[1])
    }
  }, [getCursorPara, getSelectedParas, updateStyleIndicator])

  // ---- The title line is off-limits while editing the body (Dots themes) ----
  // In the Dots themes the note's title is edited in its own field above the
  // body; inside the body editor its line is hidden. The caret must never get
  // into it: typing there changed the title unseen, Enter split part of the
  // title down into the body, and Backspace at the start of the first body line
  // merged body text up into the title. So the caret / selection is kept out of
  // it, and edits that would cross into it are stopped.
  const bodyStartPara = useCallback(() => {
    const content = contentRef.current
    if (!content) return null
    const leaves = [...content.querySelectorAll('.note-para')].filter(p => !p.querySelector('.note-para'))
    if (leaves[1]) return leaves[1]
    if (!leaves[0]) return null
    const p = document.createElement('div')
    p.className = 'note-para style-body'
    p.appendChild(document.createElement('br'))
    leaves[0].after(p)
    return p
  }, [])
  useEffect(() => {
    if (!editing || !darkDots) return
    const content = contentRef.current
    if (!content) return
    const titleOf = () => content.querySelector('.note-para')
    const inTitle = (node) => { const t = titleOf(); return !!(t && node && t.contains(node)) }
    const onSelChange = () => {
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount || !content.contains(sel.anchorNode)) return
      const aIn = inTitle(sel.anchorNode) || sel.anchorNode === content && sel.anchorOffset === 0
      const fIn = inTitle(sel.focusNode)
      if (!aIn && !fIn) return
      const body = bodyStartPara()
      if (!body) return
      const r = document.createRange()
      if (sel.isCollapsed || (aIn && fIn)) {
        r.setStart(body, 0); r.collapse(true)
        sel.removeAllRanges(); sel.addRange(r)
      } else {
        // A selection reaching into the title starts at the body instead
        const other = aIn ? { n: sel.focusNode, o: sel.focusOffset } : { n: sel.anchorNode, o: sel.anchorOffset }
        sel.setBaseAndExtent(body, 0, other.n, other.o)
      }
    }
    const onBeforeInput = (e) => {
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount) return
      const range = sel.getRangeAt(0)
      const title = titleOf()
      if (!title) return
      // Anything that would edit the title line from in here: refuse it
      if (range.intersectsNode(title) && (title.contains(range.startContainer) || range.startContainer === content)) {
        if (!sel.isCollapsed) {
          const body = bodyStartPara()
          if (body) range.setStart(body, 0)
          if (range.collapsed) { e.preventDefault(); return }
        } else { e.preventDefault(); return }
      }
      // Backspace at the very start of the first body line would merge it up
      // into the title
      if (sel.isCollapsed && /^delete.*Backward$/.test(e.inputType)) {
        const body = bodyStartPara()
        if (body && (body.contains(range.startContainer) || range.startContainer === body)) {
          const pre = document.createRange()
          pre.selectNodeContents(body)
          pre.setEnd(range.startContainer, range.startOffset)
          if (pre.toString() === '' && !pre.cloneContents().querySelector?.('img')) e.preventDefault()
        }
      }
    }
    document.addEventListener('selectionchange', onSelChange)
    content.addEventListener('beforeinput', onBeforeInput)
    onSelChange()
    return () => {
      document.removeEventListener('selectionchange', onSelChange)
      content.removeEventListener('beforeinput', onBeforeInput)
    }
  }, [editing, darkDots, bodyStartPara])

  // Update style indicator whenever selection changes (cursor moves)
  useEffect(() => {
    if (!editing) return
    document.addEventListener('selectionchange', detectCursorStyle)
    return () => document.removeEventListener('selectionchange', detectCursorStyle)
  }, [editing, detectCursorStyle])

  // Scroll cursor into view while typing — handles text wrapping without Enter
  // Prevent iOS from scrolling the layout viewport when the keyboard opens,
  // which would push the position:fixed note page up and hide the header.
  useEffect(() => {
    if (!editing) return
    const lockScroll = () => { if (window.scrollY !== 0) window.scrollTo(0, 0) }
    window.addEventListener('scroll', lockScroll)
    return () => window.removeEventListener('scroll', lockScroll)
  }, [editing])

  useEffect(() => {
    if (!editing) return
    const content = contentRef.current
    const editor = editorRef.current
    const page = pageRef.current
    if (!content || !editor || !page) return

    const scrollCursorIntoView = () => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      const cursorRect = range.getBoundingClientRect()
      if (!cursorRect.height) return
      const kbh = parseFloat(page.style.getPropertyValue('--kbh') || '0') || 0
      const pageBottom = page.getBoundingClientRect().bottom
      // style bar top = pageBottom - kbh - 20px gap - 56px bar height = pageBottom - kbh - 76
      const visibleBottom = pageBottom - kbh - 76 - 12 // 12px breathing room
      if (cursorRect.bottom > visibleBottom) {
        editor.scrollTop += cursorRect.bottom - visibleBottom
      }
    }

    content.addEventListener('input', scrollCursorIntoView)
    return () => content.removeEventListener('input', scrollCursorIntoView)
  }, [editing])

  // The note's first line IS its title: it always carries style-title, and no
  // other line ever may. Editing (typing, Enter, backspace-merge, paste) can all
  // shuffle paragraphs around, so this runs as a catch-all after every change
  // rather than being guarded at each individual entry point.
  const enforceTitlePara = useCallback(() => {
    const content = contentRef.current
    if (!content) return
    let changed = false
    // Stray content sitting directly in the editor (a plain div or loose text
    // that iOS / paste left without the note-para class) is invisible to the
    // rules below, which let a later line get stuck as the title. Fold every
    // such node into a normal Body paragraph first.
    const sel = window.getSelection()
    const caret = sel && sel.rangeCount && content.contains(sel.anchorNode) ? { node: sel.anchorNode, offset: sel.anchorOffset } : null
    let run = null
    ;[...content.childNodes].forEach(n => {
      const isPara = n.nodeType === 1 && n.classList.contains('note-para')
      if (isPara) { run = null; return }
      const isBlock = n.nodeType === 1 && /^(DIV|P|H[1-6]|BLOCKQUOTE|LI|UL|OL)$/.test(n.tagName)
      if (isBlock && n.tagName === 'DIV') { n.className = 'note-para style-body'; run = null; changed = true; return }
      if (n.nodeType === 3 && !n.textContent.trim() && !run) { n.remove(); return }
      if (n.nodeType !== 1 && n.nodeType !== 3) return
      if (isBlock) {
        const d = document.createElement('div')
        d.className = 'note-para style-body'
        while (n.firstChild) d.appendChild(n.firstChild)
        n.replaceWith(d)
        run = null; changed = true; return
      }
      if (!run) {
        run = document.createElement('div')
        run.className = 'note-para style-body'
        n.before(run)
      }
      run.appendChild(n)
      changed = true
    })
    if (changed && caret && caret.node.isConnected && content.contains(caret.node)) {
      try { const r = document.createRange(); r.setStart(caret.node, caret.offset); r.collapse(true); sel.removeAllRanges(); sel.addRange(r) } catch {}
    }
    let paras = [...content.querySelectorAll('.note-para')].filter(p => !p.querySelector('.note-para'))
    // Dots themes: the title lives in its own field, so if the title line has
    // gone missing from the body it's put back from that field — a body line is
    // never promoted to be the title (that turned body text into the title)
    if (darkDotsRef.current && (!paras[0] || !/style-title/.test(paras[0].className))) {
      const t = document.createElement('div')
      t.className = 'note-para style-title'
      t.textContent = (titleFieldRef.current?.textContent || noteTitleRef.current || 'Untitled note').trim() || 'Untitled note'
      content.insertBefore(t, content.firstChild)
      paras = [t, ...paras]
      changed = true
    }
    paras.forEach((p, i) => {
      const isTitle = /style-title/.test(p.className)
      if (i === 0 && !isTitle) {
        p.className = 'note-para style-title'
        changed = true
      } else if (i > 0 && isTitle) {
        p.className = p.className.replace(/style-title/, 'style-body')
        changed = true
      }
    })
    return changed
  }, [])

  const selectStyle = useCallback((style) => {
    const content = contentRef.current
    if (!content || !editingRef.current) return
    const first = content.querySelector('.note-para')
    // A selection across several lines: every one of them takes the style
    // (all but the title, whose style is fixed)
    const selected = getSelectedParas().filter(p => p !== first && !p.classList.contains('style-image') && !p.classList.contains('style-embed'))
    if (selected.length > 1 || (selected.length === 1 && getSelectedParas().length > 1)) {
      selected.forEach(p => { if (!/style-/.test(p.className) || !p.classList.contains('style-' + style)) p.className = 'note-para style-' + style })
      setCurrentStyle(style)
      updateStyleIndicator(style)
      scheduleAutosave()
      return
    }
    const target = getCursorPara() || lastCursorParaRef.current || content.querySelector('.note-para:last-of-type')
    // The title line's style is fixed — the tap does nothing at all.
    if (target && (target === first || target.classList.contains('style-image') || target.classList.contains('style-embed'))) return
    setCurrentStyle(style)
    updateStyleIndicator(style)
    if (target && content.contains(target)) target.className = 'note-para style-' + style
    scheduleAutosave()
  }, [getCursorPara, getSelectedParas, updateStyleIndicator, scheduleAutosave])

  // ---- Photos: the media button beside the style bar opens the device's own
  // picker (on iOS its Photo Library / Take Photo / Choose File menu; on a
  // computer the file browser); the picked photo goes in at the cursor as its
  // own line, the full width of the text ----
  const mediaRangeRef = useRef(null)     // the caret when the button was pressed
  const libraryInputRef = useRef(null)
  const rememberCaret = useCallback(() => {
    const content = contentRef.current
    const sel = window.getSelection()
    if (content && sel && sel.rangeCount && content.contains(sel.anchorNode)) mediaRangeRef.current = sel.getRangeAt(0).cloneRange()
  }, [])

  // Put a block (a photo, an attached note or links) in at the caret as its own
  // line. Returns the line the caret moves to after it, and any empty line made
  // just to hold the caret.
  const placeBlock = useCallback((photo) => {
    const content = contentRef.current
    const paraOf = (node) => {
      let n = node
      while (n && n !== content && !(n.nodeType === 1 && n.classList?.contains('note-para'))) n = n.parentNode
      return n && n !== content ? n : null
    }
    const first = content.querySelector('.note-para')
    const range = mediaRangeRef.current
    mediaRangeRef.current = null
    let cur = range && content.contains(range.startContainer) ? paraOf(range.startContainer) : null
    if (!cur && lastCursorParaRef.current && content.contains(lastCursorParaRef.current)) cur = lastCursorParaRef.current
    if (!cur) cur = [...content.querySelectorAll('.note-para')].pop() || null
    const isBlock = (p) => p.classList.contains('style-image') || p.classList.contains('style-embed')

    // The line the caret lands on, after the photo
    let after
    let addedLine = null   // an empty line made just to hold the caret
    const bodyLine = () => { const p = document.createElement('div'); p.className = 'note-para style-body'; p.innerHTML = '<br>'; addedLine = p; return p }
    if (!cur) {
      content.appendChild(photo)
      after = bodyLine(); photo.after(after)
    } else if (cur === first || !range || isBlock(cur)) {
      // On the title (or with no caret): the photo goes on the next line
      cur.after(photo)
      after = photo.nextElementSibling?.classList.contains('note-para') && !isBlock(photo.nextElementSibling)
        ? photo.nextElementSibling : null
      if (!after) { after = bodyLine(); photo.after(after) }
    } else {
      // Mid-line: split the line at the caret, like Enter, with the photo between
      const tail = document.createRange()
      tail.setStart(range.startContainer, range.startOffset)
      tail.setEnd(cur, cur.childNodes.length)
      const head = document.createRange()
      head.setStart(cur, 0)
      head.setEnd(range.startContainer, range.startOffset)
      if (!head.toString().trim()) {
        // At the start of the line: the photo goes above it
        cur.before(photo)
        after = cur
      } else {
        const frag = tail.extractContents()
        after = document.createElement('div')
        after.className = cur.className
        if (frag.textContent) after.appendChild(frag)
        else after.innerHTML = '<br>'
        if (!cur.textContent && !cur.querySelector('br')) cur.innerHTML = '<br>'
        cur.after(photo)
        photo.after(after)
      }
    }
    const sel = window.getSelection()
    const r = document.createRange()
    r.setStart(after, 0)
    r.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r)
    lastCursorParaRef.current = after
    requestAnimationFrame(() => photo.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
    return { after, addedLine }
  }, [])

  const insertImage = useCallback((file) => {
    const content = contentRef.current
    if (!content || !file) return
    const blobUrl = URL.createObjectURL(file)
    const photo = document.createElement('div')
    photo.className = 'note-para style-image'
    photo.contentEditable = 'false'
    const img = document.createElement('img')
    img.alt = ''
    img.decoding = 'async'   // decoded off the main thread, and only when scrolled near
    img.loading = 'lazy'
    img.src = blobUrl
    img.dataset.pending = '1'
    photo.appendChild(img)
    const { addedLine } = placeBlock(photo)

    uploadNoteImage(file).then(url => {
      const done = () => {
        img.src = url
        delete img.dataset.pending
        URL.revokeObjectURL(blobUrl)
        if (img.isConnected) flushAutosave()
      }
      // Swap once the uploaded copy has loaded, so the photo doesn't blink
      const pre = new Image()
      pre.onload = done
      pre.onerror = done
      pre.src = url
    }).catch(err => {
      console.error('[note image] upload failed', err)
      photo.remove()
      if (addedLine && addedLine.isConnected && !addedLine.textContent.trim()) addedLine.remove()
      URL.revokeObjectURL(blobUrl)
      window.alert("Couldn't add that photo. Please try again.")
    })
  }, [flushAutosave, placeBlock])

  // ---- Attachments: a note or a link from this note's canvas, put in like a
  // photo. Links put in one after another (no line between) share one block,
  // laid out in columns as in a canvas card. ----
  const project = useMemo(() => (
    categories.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId) || null
  ), [categories, categoryId, projectId])
  const idsOf = (el) => (el?.dataset.ids || '').split(',').filter(Boolean)
  const [embeds, setEmbeds] = useState([])
  const embedSigRef = useRef('')
  const rescanEmbeds = useCallback(() => {
    const content = contentRef.current
    const list = content ? [...content.querySelectorAll('.note-para.style-embed[data-embed]')] : []
    const sig = list.map(el => el.dataset.embed + ':' + el.dataset.ids).join('|')
    // (the same blocks as before — nothing to redraw)
    if (sig === embedSigRef.current && list.every(el => embeds.some(e => e.el === el))) return
    embedSigRef.current = sig
    setEmbeds(list.map((el, i) => ({ el, key: i + ':' + el.dataset.embed, type: el.dataset.embed, ids: idsOf(el) })))
  }, [embeds])
  const rescanRef = useRef(rescanEmbeds)
  rescanRef.current = rescanEmbeds
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    rescanRef.current()
    const isEmbed = (n) => n.nodeType === 1 && (n.classList?.contains('style-embed') || n.querySelector?.('.style-embed'))
    const mo = new MutationObserver(muts => {
      if (muts.some(m => m.type === 'attributes' || [...m.addedNodes, ...m.removedNodes].some(isEmbed))) rescanRef.current()
    })
    mo.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ids'] })
    return () => mo.disconnect()
  }, [note?.id])

  const insertEmbed = useCallback((type, id) => {
    const content = contentRef.current
    if (!content || id == null) return
    const block = document.createElement('div')
    block.className = 'note-para style-embed'
    block.contentEditable = 'false'
    block.dataset.embed = type === 'link' ? 'links' : 'note'
    block.dataset.ids = String(id)
    placeBlock(block)
    // A link right after (or before) a block of links joins it
    if (type === 'link') {
      const prev = block.previousElementSibling
      const next = block.nextElementSibling
      if (prev?.dataset?.embed === 'links') { prev.dataset.ids = [...idsOf(prev), String(id)].join(','); block.remove() }
      else if (next?.dataset?.embed === 'links') { next.dataset.ids = [String(id), ...idsOf(next)].join(','); block.remove() }
    }
    rescanRef.current()
    flushAutosave()
  }, [placeBlock, flushAutosave])

  const removeEmbed = useCallback((el, id) => {
    const left = idsOf(el).filter(x => x !== String(id))
    if (left.length) el.dataset.ids = left.join(',')
    else el.remove()
    rescanRef.current()
    flushAutosave()
  }, [flushAutosave])

  // A pasted link (just a link, nothing else) becomes a link in this canvas and
  // goes in on its own line as its tile — titled, once the page is looked up,
  // with that page's own title
  const pasteLink = useCallback((raw) => {
    if (!project) return false
    const url = /^www\./i.test(raw) ? 'https://' + raw : raw
    const sel = window.getSelection()
    const content = contentRef.current
    if (sel && sel.rangeCount && content?.contains(sel.anchorNode)) mediaRangeRef.current = sel.getRangeAt(0).cloneRange()
    const holder = { realId: null, title: null }
    // (renamed once both the saved link and the page's title are in)
    const finishTitle = () => {
      if (holder.realId != null && holder.title) updateProjectLink(categoryId, projectId, holder.realId, holder.title, url)
    }
    const tempId = addProjectLink(categoryId, projectId, url, url, false, null, (realId) => {
      // the block names the link by its temporary id until the save comes back
      const c = contentRef.current || autosaveElRef.current
      c?.querySelectorAll('.note-para.style-embed[data-embed="links"]').forEach(b => {
        const ids = idsOf(b)
        if (ids.includes(String(tempId))) b.dataset.ids = ids.map(x => (x === String(tempId) ? String(realId) : x)).join(',')
      })
      holder.realId = realId
      flushAutosave()
      finishTitle()
    })
    insertEmbed('link', tempId)
    fetch(`${functionsUrl}/link-preview?url=${encodeURIComponent(url)}`, { headers: { apikey: functionsKey } })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const t = data && typeof data.title === 'string' ? data.title.trim() : ''
        if (!t) return
        holder.title = t
        finishTitle()
      })
      .catch(() => {})
    return true
  }, [project, categoryId, projectId, addProjectLink, updateProjectLink, insertEmbed, flushAutosave])

  const pasteLinkRef = useRef(pasteLink)
  pasteLinkRef.current = pasteLink

  // The attach menu: Photo, Link, Note — Link / Note turn it into the list of
  // this canvas's links / other notes to pick from
  const [attachMenu, setAttachMenu] = useState(null)   // null | 'root' | 'link' | 'note'
  useEffect(() => {
    if (!attachMenu) return
    const onDown = (e) => {
      if (e.target instanceof Element && e.target.closest('.note-attach-menu, .note-attach-btn')) return
      setAttachMenu(null)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [attachMenu])
  useEffect(() => { if (!editing) setAttachMenu(null) }, [editing])
  // The menu never runs up past the page's header: it's capped to the room
  // between the header and the tools (less with the keyboard up), scrolling
  // inside that
  const attachMenuRef = useRef(null)
  useLayoutEffect(() => {
    const menu = attachMenuRef.current
    if (!menu) return
    if (!attachMenu) { menu.style.maxHeight = ''; return }
    const fit = () => {
      const tools = menu.parentElement?.getBoundingClientRect()
      const page = pageRef.current
      const header = page?.querySelector('.note-detail-header')
      const top = Math.max(header ? header.getBoundingClientRect().bottom : 0, window.visualViewport?.offsetTop || 0) + 12
      if (tools) menu.style.maxHeight = Math.max(120, tools.top - 8 - top) + 'px'
    }
    fit()
    window.visualViewport?.addEventListener('resize', fit)
    return () => window.visualViewport?.removeEventListener('resize', fit)
  }, [attachMenu])
  // Anything already in the note isn't offered again
  const inNote = useMemo(() => {
    const out = { note: new Set(), links: new Set() }
    embeds.forEach(e => e.ids.forEach(id => out[e.type === 'note' ? 'note' : 'links'].add(String(id))))
    return out
  }, [embeds])
  const attachableNotes = (project?.notes || []).filter(n => !n.archived && String(n.id) !== String(note?.id) && !inNote.note.has(String(n.id)))
  const attachableLinks = (project?.links || []).filter(l => !l.archived && !inNote.links.has(String(l.id)))

  // A photo shows a trash button in its top-right corner while it's hovered
  // (mouse) or after it's tapped (touch) — the only way to delete it
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    let shown = null
    const hide = () => {
      if (!shown) return
      shown.querySelector('.note-photo-trash')?.remove()
      shown.classList.remove('show-trash')
      shown = null
    }
    const show = (photo) => {
      if (shown === photo) return
      hide()
      if (photo.querySelector('img[data-pending]')) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'note-photo-trash'
      btn.setAttribute('aria-label', 'Remove photo')
      btn.contentEditable = 'false'
      btn.innerHTML = TRASH_SVG
      btn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation() })
      btn.addEventListener('pointerdown', e => e.stopPropagation())
      btn.addEventListener('click', e => {
        e.preventDefault()
        e.stopPropagation()
        const p = shown
        shown = null
        p?.remove()
        flushAutosave()
      })
      photo.appendChild(btn)
      photo.classList.add('show-trash')
      shown = photo
    }
    const photoOf = (t) => (t instanceof Element ? t.closest('.note-para.style-image') : null)
    const onOver = (e) => { if (e.pointerType === 'mouse') { const p = photoOf(e.target); if (p) show(p) } }
    const onOut = (e) => {
      if (e.pointerType !== 'mouse' || !shown) return
      const to = e.relatedTarget
      if (!(to instanceof Node) || !shown.contains(to)) hide()
    }
    // Touch: one tap on a photo turns its pressed state (overlay + trash) on;
    // the next tap — on the photo or anywhere else — turns it off
    const onDown = (e) => {
      if (e.pointerType === 'mouse') return
      if (e.target.closest?.('.note-photo-trash')) return
      const p = photoOf(e.target)
      if (p && p !== shown) show(p)
      else hide()
    }
    // ---- Press and hold a photo to move it: it shrinks to a 72x72 thumbnail
    // (50%, light shadow) under the finger / pointer, and a light grey line
    // between the lines of text shows where it will land ----
    let drag = null          // { photo, ghost, line, target: { before } }
    let holdTimer = null
    let press = null         // { x, y, id, photo }
    const preventScroll = (e) => { if (drag) e.preventDefault() }
    const candidates = (photo) => [...content.querySelectorAll('.note-para')]
      .filter(p => p !== photo && !p.querySelector('.note-para') && p.offsetParent !== null)
    const place = (x, y) => {
      drag.ghost.style.left = (x - 36) + 'px'
      drag.ghost.style.top = (y - 36) + 'px'
      // Keep the editor scrolling when the finger nears its top or bottom edge
      const ed = editorRef.current
      if (ed) {
        const er = ed.getBoundingClientRect()
        if (y < er.top + 56) ed.scrollTop -= 10
        else if (y > er.bottom - 120) ed.scrollTop += 10
      }
      // The landing spot: before the first line whose middle is below the
      // pointer — never above the title
      const paras = candidates(drag.photo)
      const title = paras[0]
      let before = null
      for (const p of paras) {
        if (p === title) continue
        const r = p.getBoundingClientRect()
        if (y < r.top + r.height / 2) { before = p; break }
      }
      drag.target = { before }
      // The line sits midway in the gap above that line (or under the last one)
      const cr = content.getBoundingClientRect()
      const cs = getComputedStyle(content)
      const left = cr.left + parseFloat(cs.paddingLeft)
      const width = cr.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      let lineY
      if (before) {
        const prev = paras[paras.indexOf(before) - 1]
        const br = before.getBoundingClientRect()
        lineY = prev ? (prev.getBoundingClientRect().bottom + br.top) / 2 : br.top - 4
      } else {
        const last = paras[paras.length - 1]
        lineY = (last ? last.getBoundingClientRect().bottom : cr.top) + 6
      }
      drag.line.style.left = left + 'px'
      drag.line.style.width = width + 'px'
      drag.line.style.top = Math.round(lineY) + 'px'
    }
    const begin = () => {
      const { photo, x, y } = press
      hide()
      lockRowDrag()
      const img = photo.querySelector('img')
      const ghost = document.createElement('div')
      ghost.className = 'note-photo-ghost'
      if (img) { const g = document.createElement('img'); g.src = img.src; g.alt = ''; ghost.appendChild(g) }
      const line = document.createElement('div')
      line.className = 'note-photo-drop-line'
      document.body.appendChild(ghost)
      document.body.appendChild(line)
      photo.classList.add('dragging-away')   // the photo leaves its spot while it's carried
      drag = { photo, ghost, line, target: null }
      window.getSelection()?.removeAllRanges()
      place(x, y)
    }
    const finish = (drop) => {
      clearTimeout(holdTimer); holdTimer = null
      press = null
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      if (!drag) return
      const { photo, ghost, line, target } = drag
      drag = null
      ghost.remove()
      line.remove()
      photo.classList.remove('dragging-away')
      unlockRowDrag()
      if (drop && target) {
        if (target.before) { if (target.before !== photo.nextElementSibling) target.before.before(photo) }
        else content.appendChild(photo)
        // A photo always has a line under it to type on
        if (!photo.nextElementSibling) {
          const p = document.createElement('div'); p.className = 'note-para style-body'; p.innerHTML = '<br>'
          photo.after(p)
        }
        flushAutosave()
      }
      // The release mustn't also count as a tap (toggling the X, or a click
      // that opens editing)
      const eat = (ev) => { ev.preventDefault(); ev.stopPropagation() }
      document.addEventListener('click', eat, true)
      setTimeout(() => document.removeEventListener('click', eat, true), 350)
    }
    const onMove = (e) => {
      if (!press || e.pointerId !== press.id) return
      if (!drag) {
        // Moving before the hold completes is a scroll, not a drag
        if (Math.abs(e.clientX - press.x) > 8 || Math.abs(e.clientY - press.y) > 8) finish(false)
        return
      }
      e.preventDefault()
      place(e.clientX, e.clientY)
    }
    const onUp = (e) => { if (press && e.pointerId === press.id) finish(true) }
    const onCancel = (e) => { if (press && e.pointerId === press.id) finish(false) }
    const onPress = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (e.target.closest?.('.note-photo-trash')) return
      const photo = photoOf(e.target)
      if (!photo || photo.querySelector('img[data-pending]')) return
      if (e.pointerType === 'mouse') e.preventDefault()   // no native image drag / text selection
      press = { x: e.clientX, y: e.clientY, id: e.pointerId, photo }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
      document.addEventListener('pointercancel', onCancel)
      holdTimer = setTimeout(() => { holdTimer = null; if (press) begin() }, 400)
    }

    // A held photo mustn't open the long-press menu (Android / desktop)
    const onContext = (e) => { if (photoOf(e.target)) e.preventDefault() }
    content.addEventListener('contextmenu', onContext)
    content.addEventListener('pointerover', onOver)
    content.addEventListener('pointerout', onOut)
    content.addEventListener('pointerdown', onPress)
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('touchmove', preventScroll, { passive: false })
    return () => {
      finish(false)
      hide()
      content.removeEventListener('pointerover', onOver)
      content.removeEventListener('pointerout', onOut)
      content.removeEventListener('pointerdown', onPress)
      content.removeEventListener('contextmenu', onContext)
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('touchmove', preventScroll)
    }
  }, [flushAutosave])

  // ---- Highlight: the button right of the photo button puts a 24% easel-colour
  // highlight behind the text of the line the cursor is in (or every selected
  // line), and takes it off again. The line's words are wrapped in a
  // span.hl-text, so it's saved with the note and text typed on the end of it
  // carries on highlighted. ----
  const [hlOn, setHlOn] = useState(false)
  const hlTouchRef = useRef(0)
  const highlightable = (p) => p && !p.classList.contains('style-title') && !p.classList.contains('style-image') && !p.classList.contains('style-embed')
  const isHl = (p) => !!p?.querySelector('.hl-text')
  const toggleHighlight = useCallback(() => {
    const content = contentRef.current
    if (!content || !editingRef.current) return
    let paras = getSelectedParas().filter(highlightable)
    if (!paras.length) {
      const p = getCursorPara() || lastCursorParaRef.current
      if (p && content.contains(p) && highlightable(p)) paras = [p]
    }
    if (!paras.length) return
    const on = !paras.every(isHl)
    // Moving the text in or out of the span would drop the caret / selection,
    // so it's noted as text offsets in the editor and put back after
    const sel = window.getSelection()
    const offsetOf = (node, off) => {
      const r = document.createRange(); r.selectNodeContents(content); r.setEnd(node, off); return r.toString().length
    }
    let saved = null
    if (sel && sel.rangeCount && content.contains(sel.anchorNode)) {
      const r = sel.getRangeAt(0)
      saved = { start: offsetOf(r.startContainer, r.startOffset), end: offsetOf(r.endContainer, r.endOffset) }
    }
    paras.forEach(p => {
      // Off first (also clears any partial spans), then wrap everything but a
      // trailing <br> in one span
      p.querySelectorAll('.hl-text').forEach(sp => { while (sp.firstChild) sp.before(sp.firstChild); sp.remove() })
      p.normalize()
      if (!on) return
      const kids = [...p.childNodes].filter(n => !(n.nodeType === 1 && n.tagName === 'BR'))
      if (!kids.some(n => n.textContent.length)) return   // an empty line has nothing to highlight
      const span = document.createElement('span')
      span.className = 'hl-text'
      kids[0].before(span)
      kids.forEach(n => span.appendChild(n))
    })
    if (saved) {
      const find = (target) => {
        const w = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
        let n, seen = 0, last = null
        while ((n = w.nextNode())) {
          last = n
          if (seen + n.length >= target) return [n, target - seen]
          seen += n.length
        }
        return last ? [last, last.length] : [content, 0]
      }
      try {
        const r = document.createRange()
        r.setStart(...find(saved.start))
        r.setEnd(...find(saved.end))
        sel.removeAllRanges(); sel.addRange(r)
      } catch { /* leave the caret where it fell */ }
    }
    setHlOn(on)
    scheduleAutosave()
  }, [getSelectedParas, getCursorPara, scheduleAutosave])
  // The button shows whether the cursor's line is highlighted
  useEffect(() => {
    if (!editing) { setHlOn(false); return }
    const onSel = () => {
      const p = getCursorPara()
      if (p) setHlOn(isHl(p))
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [editing, getCursorPara])

  const pickMedia = () => {
    const input = libraryInputRef.current
    if (input) { input.value = ''; input.click() }
  }

  const enterEdit = useCallback((savedRange) => {
    editingRef.current = true
    setEditing(true)
    const content = contentRef.current
    if (!content) return
    content.contentEditable = 'true'
    content.focus()
    if (savedRange) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(savedRange)
    }
    if (styleBarRef.current) styleBarRef.current.classList.add('visible')
    // Detect style at cursor (or init to body if no cursor)
    setTimeout(detectCursorStyle, 0)
    // Check overflow immediately so mask is correct before first scroll
    setTimeout(() => { if (editorRef.current) checkBottomOverflow(editorRef.current) }, 50)
    // Center the cursor line vertically once the keyboard is fully open
    setTimeout(() => {
      const editor = editorRef.current
      const page = pageRef.current
      if (!editor || !page) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      const cursorRect = range.getBoundingClientRect()
      if (!cursorRect.height) return
      const kbh = parseFloat(page.style.getPropertyValue('--kbh') || '0') || 0
      const editorRect = editor.getBoundingClientRect()
      const pageBottom = page.getBoundingClientRect().bottom
      const visibleTop = editorRect.top
      const visibleBottom = pageBottom - kbh - 76 - 12
      const visibleCenter = (visibleTop + visibleBottom) / 2
      const cursorCenter = (cursorRect.top + cursorRect.bottom) / 2
      const targetScrollTop = editor.scrollTop + (cursorCenter - visibleCenter)
      editor.scrollTo({ top: targetScrollTop, behavior: 'smooth' })
    }, 300)
  }, [detectCursorStyle, checkBottomOverflow])

  // A freshly-created note auto-enters edit mode once it opens, with the cursor
  // placed in the Body paragraph beneath the title.
  useEffect(() => {
    if (autoEditNoteId == null || String(autoEditNoteId) !== String(note?.id)) return
    setAutoEditNoteId(null)
    if (archived) return
    const t = setTimeout(() => {
      const content = contentRef.current
      if (!content) return
      const paras = [...content.querySelectorAll('.note-para')]
      const target = paras.find(p => /style-body/.test(p.className)) || paras[paras.length - 1]
      let range = null
      if (target) { range = document.createRange(); range.setStart(target, 0); range.collapse(true) }
      enterEdit(range)
    }, 400)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Click on the text content — capture caret position then enter edit mode
  const handleContentClick = useCallback((e) => {
    if (editing || archived) return
    let savedRange = null
    if (document.caretRangeFromPoint) {
      savedRange = document.caretRangeFromPoint(e.clientX, e.clientY)
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(e.clientX, e.clientY)
      if (pos) {
        savedRange = document.createRange()
        savedRange.setStart(pos.offsetNode, pos.offset)
        savedRange.collapse(true)
      }
    }
    enterEdit(savedRange)
  }, [editing, enterEdit, archived])

  // Click on empty area below text — place cursor at end
  const handleEmptyAreaClick = useCallback(() => {
    if (archived) return
    const content = contentRef.current
    if (!content) return
    if (!editing) {
      enterEdit(null)
    }
    // Move cursor to end of content
    requestAnimationFrame(() => {
      if (!content) return
      content.focus()
      const range = document.createRange()
      range.selectNodeContents(content)
      range.collapse(false)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      detectCursorStyle()
    })
  }, [editing, enterEdit, detectCursorStyle, archived])

  /* ---- Swipe a bullet sideways to indent it (3 levels) ----
     Works with a finger drag on touch and a two-finger horizontal trackpad
     swipe. Right indents, left outdents. */
  const shiftBullet = useCallback((para, dir) => {
    const content = contentRef.current
    if (!content) return
    const levelOf = (el) => Number((el.className.match(/indent-(\d)/) || [])[1] || 0)
    const setLevel = (el, lvl) => {
      el.classList.remove('indent-1', 'indent-2', 'indent-3')
      if (lvl) el.classList.add('indent-' + lvl)
    }

    const paras = [...content.querySelectorAll('.note-para')]
    const idx = paras.indexOf(para)
    if (idx < 0) return
    const cur = levelOf(para)
    const next = Math.max(0, Math.min(3, cur + dir))
    if (next === cur) return
    setLevel(para, next)

    // Bullets below that are deeper than this one are its children: they keep
    // their relationship and move with it (clamped at the ends). A bullet at the
    // same level or shallower starts a new branch and stops the cascade.
    for (let i = idx + 1; i < paras.length; i++) {
      const p = paras[i]
      if (!/style-bullet/.test(p.className)) break
      const lv = levelOf(p)
      if (lv <= cur) break
      setLevel(p, Math.max(0, Math.min(3, lv + dir)))
    }

    // Not in edit mode, so nothing else will commit this — save it now
    if (!editingRef.current) {
      const firstPara = content.querySelector('.note-para')
      onSave(note.id, serializeNote(content), firstPara ? firstPara.textContent.trim() : note.text)
    } else {
      scheduleAutosave()
    }
  }, [note, onSave, scheduleAutosave])

  // The listeners below must attach ONCE: saving updates the `note` prop, which
  // would otherwise re-run this effect mid-gesture and reset its one-per-swipe
  // lock, letting a single sweep fire again.
  const shiftBulletRef = useRef(shiftBullet)
  shiftBulletRef.current = shiftBullet
  const getCursorParaRef = useRef(getCursorPara)
  getCursorParaRef.current = getCursorPara

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const THRESHOLD = 40

    // The gesture indents the line the cursor is on, wherever the swipe lands —
    // so it doesn't have to start on the bullet itself.
    const cursorBullet = () => {
      const para = getCursorParaRef.current() || lastCursorParaRef.current
      if (!para || !content.contains(para)) return null
      return /style-bullet/.test(para.className) ? para : null
    }

    const tryShift = (para, dir) => shiftBulletRef.current(para, dir)
    // A multi-touch drag starts a pointer sequence per finger — only the first
    // one owns the gesture.
    let activePointer = null

    const onPointerDown = (e) => {
      // Touch is handled by the touch listeners below: iOS cancels a pointer
      // sequence as soon as it treats a drag as a scroll or selection, so the
      // swipe never reached the threshold there.
      if (e.pointerType === 'touch') return
      // Read the caret before the browser's own pointerdown handling moves it
      const para = cursorBullet()
      if (!para) return
      if (activePointer !== null) return
      activePointer = e.pointerId
      const startX = e.clientX, startY = e.clientY
      let done = false
      const onMove = (e2) => {
        if (done || e2.pointerId !== activePointer) return
        const dx = e2.clientX - startX, dy = e2.clientY - startY
        if (Math.abs(dy) > 24) { cleanup(); return }
        if (Math.abs(dx) < THRESHOLD) return
        done = true
        tryShift(para, dx > 0 ? 1 : -1)
        cleanup()
      }
      const cleanup = () => {
        activePointer = null
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', cleanup)
        document.removeEventListener('pointercancel', cleanup)
      }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', cleanup)
      document.addEventListener('pointercancel', cleanup)
    }

    // Trackpad: accumulate horizontal deltas until they clear the threshold,
    // then reset once the gesture goes quiet.
    let acc = 0, accPara = null, timer = null, fired = false
    const onWheel = (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      const para = cursorBullet()
      if (!para) return
      e.preventDefault()
      if (para !== accPara) { accPara = para; acc = 0; fired = false }
      acc += -e.deltaX   // two-finger swipe right reports negative deltaX
      // One level per gesture — the lock lifts once the swipe goes quiet
      if (!fired && Math.abs(acc) >= THRESHOLD) {
        fired = true
        tryShift(para, acc > 0 ? 1 : -1)
      }
      clearTimeout(timer)
      timer = setTimeout(() => { acc = 0; accPara = null; fired = false }, 200)
    }

    // Touch (phone): while the body is being edited, a sideways swipe anywhere on
    // the note indents (right) or outdents (left) the bullet the cursor is on.
    // Touch events keep flowing through a scroll, unlike pointer events; once the
    // drag is clearly sideways its default (scroll / selection) is cancelled.
    const surface = editorRef.current || content
    let t = null   // { x, y, para, decided, horizontal, done, own, lastY }
    let lastTap = null
    // A touch that lands on the cursor's own bullet line is iOS's to take over:
    // it starts dragging the caret (or a selection) there and cancels the touch,
    // so the swipe never registers. On that line the touch is claimed up front
    // instead, and the things iOS would have done are done by hand — a tap puts
    // the caret where it landed, a vertical drag scrolls the note.
    const onTouchStart = (e) => {
      if (!editingRef.current || e.touches.length !== 1) { t = null; return }
      const para = cursorBullet()
      if (!para) { t = null; return }
      const x = e.touches[0].clientX, y = e.touches[0].clientY
      const r = para.getBoundingClientRect()
      // A touch right on the caret stays iOS's own: tap for the Paste / Select
      // menu, double tap to select a word, drag to move the caret
      let nearCaret = false
      const sel = window.getSelection()
      if (sel && sel.rangeCount) {
        const rect = sel.getRangeAt(0).getClientRects()[0] || sel.getRangeAt(0).getBoundingClientRect()
        if (rect && (rect.height || rect.width)) {
          nearCaret = Math.abs(x - (sel.isCollapsed ? rect.left : x)) <= 28 && y >= rect.top - 12 && y <= rect.bottom + 12
          // With text selected, any touch on the selection belongs to iOS too
          if (!sel.isCollapsed) nearCaret = [...sel.getRangeAt(0).getClientRects()].some(q => x >= q.left - 12 && x <= q.right + 12 && y >= q.top - 12 && y <= q.bottom + 12)
        }
      }
      const own = y >= r.top && y <= r.bottom && !nearCaret
      if (own) e.preventDefault()
      t = { x, y, para, decided: false, horizontal: false, done: false, own, lastY: y }
    }
    const onTouchMove = (e) => {
      if (!t || t.done) return
      const cx = e.touches[0].clientX, cy = e.touches[0].clientY
      const dx = cx - t.x, dy = cy - t.y
      if (!t.decided) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        t.decided = true
        t.horizontal = Math.abs(dx) > Math.abs(dy) * 1.5
        if (!t.horizontal && !t.own) { t = null; return }   // a scroll — leave it alone
      }
      e.preventDefault()   // sideways: no scrolling, no text selection
      if (!t.horizontal) {
        // Claimed touch going up or down: scroll the note ourselves
        const scroller = editorRef.current
        if (scroller) scroller.scrollTop -= cy - t.lastY
        t.lastY = cy
        return
      }
      if (Math.abs(dx) >= THRESHOLD) {
        t.done = true
        tryShift(t.para, dx > 0 ? 1 : -1)
      }
    }
    const onTouchEnd = (e) => {
      // A plain tap on the claimed line: put the caret where the finger landed
      if (t && t.own && !t.decided && e.type === 'touchend') {
        const range = document.caretRangeFromPoint?.(t.x, t.y)
        if (range && content.contains(range.startContainer)) {
          const sel = window.getSelection()
          sel.removeAllRanges()
          sel.addRange(range)
          // Second tap in the same spot: select the word, as iOS would
          const now = Date.now()
          if (lastTap && now - lastTap.at < 350 && Math.abs(t.x - lastTap.x) < 24 && Math.abs(t.y - lastTap.y) < 24 && sel.modify) {
            sel.modify('move', 'backward', 'word')
            sel.modify('extend', 'forward', 'word')
            lastTap = null
          } else {
            lastTap = { at: now, x: t.x, y: t.y }
          }
        }
      }
      t = null
    }

    // Desktop indents and outdents with Tab / Shift+Tab only — a mouse drag (as
    // when selecting text) or a trackpad swipe no longer moves a bullet
    surface.addEventListener('touchstart', onTouchStart, { passive: false })
    surface.addEventListener('touchmove', onTouchMove, { passive: false })
    surface.addEventListener('touchend', onTouchEnd)
    surface.addEventListener('touchcancel', onTouchEnd)
    return () => {
      surface.removeEventListener('touchstart', onTouchStart)
      surface.removeEventListener('touchmove', onTouchMove)
      surface.removeEventListener('touchend', onTouchEnd)
      surface.removeEventListener('touchcancel', onTouchEnd)
      clearTimeout(timer)
    }
  }, [])

  // Save exits edit mode but keeps note open; Done closes the note
  const handleButtonClick = useCallback(() => {
    if (skipButtonClickRef.current) { skipButtonClickRef.current = false; return }
    if (editing) {
      const content = contentRef.current
      if (content) {
        content.contentEditable = 'false'
        editingRef.current = false
        const firstPara = content.querySelector('.note-para')
        const text = firstPara ? firstPara.textContent.trim() : note.text
        onSave(note.id, serializeNote(content), text)
        if (styleBarRef.current) styleBarRef.current.classList.remove('visible')
      }
      setEditing(false)
    } else {
      setIsOpen(false)
      setTimeout(onClose, 360)
    }
  }, [editing, note, onSave, onClose])

  const handleKeyDown = useCallback((e) => {
    const content = contentRef.current
    if (!content) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)

    // Resolve the .note-para containing a given boundary (handles the case where the
    // boundary is the editor root itself, with an offset into its child paragraphs).
    const findPara = (node, offset) => {
      let n = node
      if (n === content) n = content.childNodes[offset] || content.childNodes[offset - 1] || content.lastChild
      while (n && n !== content && !(n.nodeType === 1 && n.classList?.contains('note-para'))) n = n.parentNode
      return (n && n !== content) ? n : null
    }
    const styleOf = (para) => (para.className.match(/style-(\w+)/) || [null, 'body'])[1]

    // ---- Tab / Shift+Tab on a bullet: indent or outdent it (keyboard mirror of
    // the swipe gesture). ----
    if (e.key === 'Tab') {
      const para = findPara(range.startContainer, range.startOffset)
      if (para && /style-bullet/.test(para.className)) {
        e.preventDefault()
        shiftBulletRef.current(para, e.shiftKey ? -1 : 1)
        return
      }
    }

    // ---- Backspace at the very start of a paragraph: merge it into the previous
    // paragraph, which keeps the previous (upper) paragraph's type style. ----
    if (e.key === 'Backspace' && range.collapsed) {
      const para = findPara(range.startContainer, range.startOffset)
      if (!para) return
      // Cursor is at the start only if there's no text between the para start and it.
      const probe = document.createRange()
      probe.selectNodeContents(para)
      probe.setEnd(range.startContainer, range.startOffset)
      if (probe.toString().length !== 0) return  // not at start → let default backspace run
      const prev = para.previousElementSibling
      if (!prev || !prev.classList?.contains('note-para')) return
      e.preventDefault()
      // A photo just above: Backspace never deletes it (only its trash button
      // does) — the cursor just steps over it, to the end of the line above
      if (prev.matches('.style-image, .style-embed')) {
        let above = prev
        while (above && above.matches?.('.style-image, .style-embed')) above = above.previousElementSibling
        if (above && above.classList?.contains('note-para')) {
          const r = document.createRange()
          r.selectNodeContents(above)
          r.collapse(false)
          sel.removeAllRanges()
          sel.addRange(r)
          lastCursorParaRef.current = above
          const st = styleOf(above)
          setCurrentStyle(st)
          updateStyleIndicator(st)
        }
        return
      }
      if (prev.innerHTML.trim() === '<br>') prev.innerHTML = ''
      // Cursor lands at the junction (end of prev's original content).
      const junction = document.createRange()
      junction.selectNodeContents(prev)
      junction.collapse(false)
      const paraEmpty = para.textContent.trim() === '' && /^(<br>)?$/.test(para.innerHTML.trim())
      if (!paraEmpty) { while (para.firstChild) prev.appendChild(para.firstChild) }
      if (!prev.textContent && !prev.querySelector('br')) prev.innerHTML = '<br>'
      para.remove()
      sel.removeAllRanges()
      sel.addRange(junction)
      const ps = styleOf(prev)
      setCurrentStyle(ps)
      updateStyleIndicator(ps)
      return
    }

    // ---- Delete at the very end of a paragraph with a photo just below: the
    // cursor steps over the photo to the start of the line beneath it ----
    if (e.key === 'Delete' && range.collapsed) {
      const para = findPara(range.startContainer, range.startOffset)
      const next = para?.nextElementSibling
      if (para && next?.matches?.('.style-image, .style-embed')) {
        const probe = document.createRange()
        probe.selectNodeContents(para)
        probe.setStart(range.startContainer, range.startOffset)
        if (probe.toString().length === 0) {
          e.preventDefault()
          let below = next
          while (below && below.matches?.('.style-image, .style-embed')) below = below.nextElementSibling
          if (below && below.classList?.contains('note-para')) {
            const r = document.createRange()
            r.setStart(below, 0)
            r.collapse(true)
            sel.removeAllRanges()
            sel.addRange(r)
            lastCursorParaRef.current = below
          }
          return
        }
      }
    }

    if (e.key !== 'Enter') return
    e.preventDefault()
    if (!range.collapsed) range.deleteContents()

    const currentPara = findPara(range.startContainer, range.startOffset)
    if (!currentPara) {
      const p = document.createElement('div')
      p.className = 'note-para style-body'
      p.innerHTML = '<br>'
      content.appendChild(p)
      const r = document.createRange(); r.setStart(p, 0); r.collapse(true)
      sel.removeAllRanges(); sel.addRange(r)
      return
    }
    const paraStyle = styleOf(currentPara)

    // Empty bullet + Enter → revert current paragraph to Body
    if (paraStyle === 'bullet') {
      const isEmpty = currentPara.textContent.trim() === '' || currentPara.innerHTML.trim() === '<br>'
      if (isEmpty) {
        currentPara.className = 'note-para style-body'
        setCurrentStyle('body')
        updateStyleIndicator('body')
        const newRange = document.createRange()
        newRange.setStart(currentPara, 0)
        newRange.collapse(true)
        sel.removeAllRanges()
        sel.addRange(newRange)
        return
      }
    }

    // Split at the cursor into a new paragraph that keeps the same type style —
    // and, for a bullet, the same indent depth as the line it came from.
    const newPara = document.createElement('div')
    const indent = (currentPara.className.match(/indent-\d/) || [])[0]
    // Splitting the title line gives a Body line — there's only ever one title.
    const nextStyle = paraStyle === 'title' ? 'body' : paraStyle
    newPara.className = 'note-para style-' + nextStyle + (nextStyle === 'bullet' && indent ? ' ' + indent : '')
    const afterRange = document.createRange()
    afterRange.setStart(range.startContainer, range.startOffset)
    afterRange.setEnd(currentPara, currentPara.childNodes.length)
    const fragment = afterRange.extractContents()
    if (fragment.textContent || (fragment.querySelector && fragment.querySelector('br'))) {
      newPara.appendChild(fragment)
    } else {
      newPara.innerHTML = '<br>'
    }
    if (!currentPara.textContent && !currentPara.querySelector('br')) currentPara.innerHTML = '<br>'
    currentPara.after(newPara)

    const newRange = document.createRange()
    newRange.setStart(newPara, 0)
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)
    setCurrentStyle(paraStyle)
    updateStyleIndicator(paraStyle)
    // Scroll editor so new paragraph is visible above the style bar
    requestAnimationFrame(() => {
      const editor = editorRef.current
      const page = pageRef.current
      if (!editor || !page) return
      const kbh = parseFloat(page.style.getPropertyValue('--kbh') || '0') || 0
      const pageBottom = page.getBoundingClientRect().bottom
      const visibleBottom = pageBottom - kbh - 76 - 12
      const paraRect = newPara.getBoundingClientRect()
      if (paraRect.bottom > visibleBottom) {
        editor.scrollTop += paraRect.bottom - visibleBottom
      }
    })
  }, [updateStyleIndicator, scheduleAutosave])

  // Auto-capitalize the first letter of each line/paragraph as it's typed.
  // (iOS contenteditable autocapitalize doesn't reliably fire after a newline.)
  const handleInput = useCallback(() => {
    const content = contentRef.current
    if (!content) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    let para = range.startContainer
    while (para && para !== content && !(para.nodeType === 1 && para.classList && para.classList.contains('note-para'))) {
      para = para.parentNode
    }
    if (!para || para === content || !para.classList?.contains('note-para')) return
    // Only act when the paragraph holds exactly its first character and it's a lowercase letter
    if (para.textContent.length !== 1 || !/[a-z]/.test(para.textContent)) return
    const walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT)
    const tn = walker.nextNode()
    if (!tn || !tn.textContent) return
    tn.textContent = tn.textContent[0].toUpperCase() + tn.textContent.slice(1)
    const r = document.createRange()
    r.setStart(tn, 1)
    r.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r)
  }, [])

  // Keep the bottom fade in sync while typing (clear it when the last line is the end)
  const handleEditorInput = useCallback((e) => {
    // Typing "- " at the start of a line turns it into a bullet
    const ne = e && e.nativeEvent
    if (ne && ne.inputType === 'insertText' && ne.data === ' ') {
      const content = contentRef.current
      const para = getCursorPara()
      const first = content && content.querySelector('.note-para')
      const sel = window.getSelection()
      if (para && para !== first && !para.classList.contains('style-bullet') && sel && sel.rangeCount && sel.isCollapsed) {
        const caret = sel.getRangeAt(0)
        const before = document.createRange()
        before.selectNodeContents(para)
        before.setEnd(caret.startContainer, caret.startOffset)
        if (/^-[ \u00a0]$/.test(before.toString())) {
          before.deleteContents()
          para.className = 'note-para style-bullet'
          if (!para.textContent) { para.innerHTML = ''; para.appendChild(document.createElement('br')) }
          const r = document.createRange()
          r.setStart(para, 0)
          r.collapse(true)
          sel.removeAllRanges()
          sel.addRange(r)
          lastCursorParaRef.current = para
          setCurrentStyle('bullet')
          updateStyleIndicator('bullet')
        }
      }
    }
    enforceTitlePara()
    handleInput()
    if (editorRef.current) checkBottomOverflow(editorRef.current)
    scheduleAutosave()
  }, [enforceTitlePara, handleInput, checkBottomOverflow, scheduleAutosave, getCursorPara, updateStyleIndicator])

  const saveTitleEdit = useCallback(() => {
    if (!editingTitleRef.current) return
    editingTitleRef.current = false
    setEditingTitle(false)
    const content = contentRef.current
    if (!content) return
    const firstPara = content.querySelector('.note-para')
    const text = firstPara ? firstPara.textContent.trim() : note.text
    onSave(note.id, serializeNote(content), text)
  }, [note, onSave])

  const handleTitleFocus = useCallback(() => {
    if (editing || archived) return
    editingTitleRef.current = true
    setEditingTitle(true)
  }, [editing, archived])

  const handleTitleKeyDown = useCallback((e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (editingTitleRef.current) titleFieldRef.current?.blur()   // blur saves
    else {                                                       // body editing: on into the body
      contentRef.current?.focus()
      const body = bodyStartPara()
      if (body) { const r = document.createRange(); r.setStart(body, 0); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r) }
    }
  }, [bodyStartPara])

  // The top button while editing the title: Save (keep the note open). Held on
  // mousedown so the title doesn't blur first and the click read as "Done".
  const handleTopButtonDown = useCallback((e) => {
    if (!editingTitleRef.current) return
    e.preventDefault()
    skipButtonClickRef.current = true
    titleFieldRef.current?.blur()
  }, [])

  const handleTitleFieldInput = useCallback(() => {
    const text = titleFieldRef.current?.textContent ?? ''
    const first = contentRef.current?.querySelector('.note-para')
    if (!first) return
    first.textContent = text
    if (scrollTitleRef.current) scrollTitleRef.current.textContent = text
    handleEditorInput()
  }, [handleEditorInput])


  // ---- Paste: everything lands in the note's own type styles ----
  // Pasted markup is read for structure only (h1/h2 → H1, h3-h6 and
  // all-bold lines → H3, list items → Bullet, everything else → Body); no foreign
  // fonts, colours or spacing survive.
  const blocksFromHtml = useCallback((html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const out = []
    const clean = (t) => (t || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
    const push = (style, text, indent = 0) => { const t = clean(text); if (t) out.push({ style, text: t, indent }) }

    // A block whose whole text sits inside a <b>/<strong> (or <i>/<em>) reads as
    // that style; an inline font-weight/style says the same thing.
    const inlineStyleOf = (el) => {
      const t = clean(el.textContent)
      if (!t) return null
      const b = el.querySelector('b, strong')
      if (b && clean(b.textContent) === t) return 'bold'
      const i = el.querySelector('i, em')
      if (i && clean(i.textContent) === t) return 'italic'
      const fw = el.style?.fontWeight
      if (fw && (fw === 'bold' || parseInt(fw, 10) >= 600)) return 'bold'
      if (el.style?.fontStyle === 'italic') return 'italic'
      return null
    }

    const BLOCK = /^(p|div|section|article|main|aside|header|footer|blockquote|pre|figure|figcaption|table|tbody|tr|td|th|h[1-6]|ul|ol|li|dl|dt|dd)$/

    const walk = (node) => {
      let buffer = ''
      const flush = () => { push('body', buffer); buffer = '' }
      for (const child of node.childNodes) {
        if (child.nodeType === 3) { buffer += child.nodeValue; continue }
        if (child.nodeType !== 1) continue
        const tag = child.tagName.toLowerCase()
        if (tag === 'br') { flush(); continue }
        if (tag === 'style' || tag === 'script' || tag === 'meta') continue
        // A line copied straight out of a note (the browser's own copy, when the
        // app's copy handler didn't get the event) still carries its style class
        const cls = child.getAttribute('class') || ''
        const own = /\bnote-para\b/.test(cls) && cls.match(/style-(\w+)/)
        if (own && !child.querySelector('.note-para')) {
          flush()
          const st = own[1] === 'title' ? 'heading' : own[1]
          push(st, child.textContent, Number((cls.match(/indent-(\d)/) || [])[1] || 0))
          continue
        }
        if (!BLOCK.test(tag)) { buffer += child.textContent; continue }
        flush()
        // h1 maps to the toolbar's H1 (the 'heading' style) — the note's own
        // 'title' style is reserved and can't be applied to body text.
        if (tag === 'h1' || tag === 'h2') { push('heading', child.textContent); continue }
        if (/^h[3-6]$/.test(tag)) { push('bold', child.textContent); continue }
        if (tag === 'li') {
          // Nested lists inside the item become their own bullets
          const nested = [...child.children].filter(c => /^(ul|ol)$/i.test(c.tagName))
          const own = clean([...child.childNodes].filter(c => !nested.includes(c)).map(c => c.textContent).join(' '))
          push('bullet', own)
          nested.forEach(walk)
          continue
        }
        if (tag === 'ul' || tag === 'ol' || tag === 'table' || tag === 'tbody' || tag === 'tr' || tag === 'dl') { walk(child); continue }
        // A container with blocks inside is recursed; a leaf paragraph is emitted
        if ([...child.children].some(c => BLOCK.test(c.tagName.toLowerCase()))) { walk(child); continue }
        push(inlineStyleOf(child) || 'body', child.textContent)
      }
      flush()
    }

    walk(doc.body)
    return out
  }, [])

  const blocksFromText = useCallback((text) => (
    text.split(/\r\n|\r|\n/).map(line => {
      const t = line.replace(/ /g, ' ').trim()
      if (!t) return null
      const bullet = /^([•▪◦*-]|\d+[.)])\s+/.test(t)
      return { style: bullet ? 'bullet' : 'body', text: bullet ? t.replace(/^([•▪◦*-]|\d+[.)])\s+/, '') : t }
    }).filter(Boolean)
  ), [])

  // Copy / cut a selection: besides plain text and ordinary HTML (headings,
  // bullets, bold, italic) for other apps, each line carries its exact note
  // style and indent so pasting into a note brings them back as they were.
  const writeSelectionToClipboard = useCallback((e) => {
    const content = contentRef.current
    const sel = window.getSelection()
    if (!content || !sel || sel.rangeCount === 0 || sel.isCollapsed || !e.clipboardData) return false
    const range = sel.getRangeAt(0)
    const paras = [...content.querySelectorAll('.note-para')].filter(p => !p.querySelector('.note-para') && range.intersectsNode(p))
    if (!paras.length) return false
    const lines = paras.map(p => {
      const r = document.createRange()
      r.selectNodeContents(p)
      if (p.contains(range.startContainer)) r.setStart(range.startContainer, range.startOffset)
      if (p.contains(range.endContainer)) r.setEnd(range.endContainer, range.endOffset)
      return {
        style: (p.className.match(/style-(\w+)/) || [])[1] || 'body',
        indent: Number((p.className.match(/indent-(\d)/) || [])[1] || 0),
        text: r.toString().replace(/\u00a0/g, ' '),
      }
    })
    // A selection that ends at the very start of a line doesn't take that line
    if (lines.length > 1 && !lines[lines.length - 1].text) lines.pop()
    const tag = (l) => {
      const t = escapeHtml(l.text)
      const attrs = `data-easels-style="${l.style}" data-easels-indent="${l.indent}"`
      if (l.style === 'title' || l.style === 'heading') return `<h2 ${attrs}>${t}</h2>`
      if (l.style === 'bold') return `<div ${attrs}><b>${t}</b></div>`
      if (l.style === 'italic') return `<div ${attrs}><i>${t}</i></div>`
      if (l.style === 'bullet') return `<ul><li ${attrs}>${t}</li></ul>`
      return `<div ${attrs}>${t || '<br>'}</div>`
    }
    e.clipboardData.setData('text/html', `<meta charset="utf-8">${lines.map(tag).join('')}`)
    const plain = lines.map(l => (l.style === 'bullet' ? '• ' : '') + l.text).join('\n')
    e.clipboardData.setData('text/plain', plain)
    lastNoteCopy = { text: normClip(plain), lines: lines.map(l => ({ ...l, style: l.style === 'title' ? 'heading' : l.style })) }
    e.preventDefault()
    return true
  }, [])

  // Copy is caught at the document, not only on the editor: when the note isn't
  // being edited (or in Safari), the copy event can be aimed at the page rather
  // than the editor, and the note's styles were lost to the browser's plain copy.
  useEffect(() => {
    const onDocCopy = (e) => {
      const content = contentRef.current
      const sel = window.getSelection()
      if (!content || !sel || !sel.rangeCount || sel.isCollapsed) return
      const range = sel.getRangeAt(0)
      if (!content.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== content) return
      writeSelectionToClipboard(e)
    }
    document.addEventListener('copy', onDocCopy, true)
    return () => document.removeEventListener('copy', onDocCopy, true)
  }, [writeSelectionToClipboard])
  const handleSelectionCopy = useCallback(() => {}, [])
  const handleSelectionCut = useCallback((e) => {
    if (!editingRef.current) return
    if (!writeSelectionToClipboard(e)) return
    const sel = window.getSelection()
    sel.getRangeAt(0).deleteContents()
    handleEditorInput()
  }, [writeSelectionToClipboard, handleEditorInput])

  // Lines copied from a note, with their exact styles (see above)
  const blocksFromNoteHtml = useCallback((html) => {
    if (!/data-easels-style/.test(html)) return null
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return [...doc.querySelectorAll('[data-easels-style]')].map(el => ({
      // The title style belongs to a note's first line only
      style: el.getAttribute('data-easels-style') === 'title' ? 'heading' : el.getAttribute('data-easels-style'),
      indent: Number(el.getAttribute('data-easels-indent') || 0),
      text: (el.textContent || '').replace(/\u00a0/g, ' '),
    }))
  }, [])

  const handlePaste = useCallback((e) => {
    if (!editingRef.current) return
    const dt = e.clipboardData
    if (!dt) return
    e.preventDefault()
    const html = dt.getData('text/html')
    const plain = dt.getData('text/plain') || ''
    // Just a link: it goes in as a link tile on its own line
    const only = plain.trim()
    if (/^(https?:\/\/|www\.)[^\s]+$/i.test(only) && pasteLinkRef.current?.(only)) return
    let blocks = (html && blocksFromNoteHtml(html)) ||
      (lastNoteCopy && normClip(plain) === lastNoteCopy.text ? lastNoteCopy.lines.map(l => ({ ...l })) : null) ||
      (html ? blocksFromHtml(html) : [])
    if (!blocks.length) blocks = blocksFromText(plain)
    if (!blocks.length) return

    const content = contentRef.current
    const sel = window.getSelection()
    if (!content || !sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    range.deleteContents()

    let para = getCursorPara() || lastCursorParaRef.current
    if (!para || !content.contains(para)) para = content.querySelector('.note-para:last-of-type')
    if (!para) {
      para = document.createElement('div')
      para.className = 'note-para style-body'
      content.appendChild(para)
    }

    const made = []
    blocks.forEach((b, i) => {
      if (i === 0) {
        // The paragraph the caret is in takes the first block: an empty one adopts
        // its style outright, otherwise the text just joins the line.
        const first = contentRef.current?.querySelector('.note-para')
        if (!(para.textContent || '').trim() && para !== first) {
          para.className = 'note-para style-' + b.style + (b.indent ? ' indent-' + b.indent : '')
          para.textContent = b.text
        } else {
          range.insertNode(document.createTextNode(b.text))
          para.normalize()
        }
        made.push(para)
        return
      }
      const div = document.createElement('div')
      div.className = 'note-para style-' + b.style + (b.indent ? ' indent-' + b.indent : '')
      if (b.text) div.textContent = b.text
      else div.appendChild(document.createElement('br'))
      const prev = made[made.length - 1]
      prev.parentNode.insertBefore(div, prev.nextSibling)
      made.push(div)
    })

    const last = made[made.length - 1]
    const r = document.createRange()
    r.selectNodeContents(last)
    r.collapse(false)
    sel.removeAllRanges()
    sel.addRange(r)

    const m = last.className.match(/style-(\w+)/)
    if (m) { setCurrentStyle(m[1]); updateStyleIndicator(m[1]) }
    lastCursorParaRef.current = last
    handleEditorInput()
  }, [blocksFromHtml, blocksFromNoteHtml, blocksFromText, getCursorPara, updateStyleIndicator, handleEditorInput])

  // Copy the note's text WITH styling so it can be pasted into the iOS Notes app.
  // Builds an HTML payload (h1/h2/h3, <ul><li> for bullets) plus a plain-text
  // fallback. H2 (heading) lines get a blank line above; bullets become bullet points.
  const handleCopy = useCallback(() => {
    const content = contentRef.current
    if (!content) return
    // Only leaf paragraphs: if the content ever ends up with a paragraph nested inside
    // another (e.g. from a contenteditable quirk), the outer wrapper's textContent would
    // otherwise be emitted as one unformatted block in addition to the formatted leaves.
    const paras = [...content.querySelectorAll('.note-para')].filter(p => !p.querySelector('.note-para'))
    const htmlParts = []
    const textParts = []
    let i = 0
    while (i < paras.length) {
      const m = paras[i].className.match(/style-(\w+)/)
      const style = m ? m[1] : 'body'
      const txt = (paras[i].textContent || '').replace(/ /g, ' ').trim()

      if (style === 'bullet') {
        const items = []
        while (i < paras.length && /style-bullet/.test(paras[i].className)) {
          items.push((paras[i].textContent || '').replace(/ /g, ' ').trim())
          i++
        }
        htmlParts.push('<ul>' + items.map(t => `<li>${escapeHtml(t)}</li>`).join('') + '</ul>')
        items.forEach(t => textParts.push('• ' + t))
        continue
      }

      if (style === 'title') {
        htmlParts.push(`<h1>${escapeHtml(txt)}</h1>`)
        textParts.push(txt)
      } else if (style === 'heading') {
        htmlParts.push('<br>')                 // line break above H2
        htmlParts.push(`<h2>${escapeHtml(txt)}</h2>`)
        textParts.push('')                     // blank line above
        textParts.push(txt)
      } else if (style === 'bold') {
        htmlParts.push(`<div><b>${escapeHtml(txt)}</b></div>`)   // paste as bold body text
        textParts.push(txt)
      } else if (style === 'italic') {
        htmlParts.push(`<div><i>${escapeHtml(txt)}</i></div>`)
        textParts.push(txt)
      } else {
        htmlParts.push(txt ? `<div>${escapeHtml(txt)}</div>` : '<div><br></div>')
        textParts.push(txt)
      }
      i++
    }

    const html = `<meta charset="utf-8">${htmlParts.join('')}`
    const text = textParts.join('\n')
    const flash = () => { setCopied(true); setTimeout(() => setCopied(false), 1200) }

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new window.ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })
        navigator.clipboard.write([item]).then(flash).catch(() => {
          navigator.clipboard.writeText(text).then(flash).catch(() => {})
        })
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(flash).catch(() => {})
      }
    } catch {
      navigator.clipboard?.writeText(text).then(flash).catch(() => {})
    }
  }, [])

  // Footer drop shadow only when the note content can scroll
  const contentScrollable = useScrollable(editorRef, [editing, isOpen, note])

  const footerMenuItems = inInbox ? [
    {
      label: 'Delete Note',
      icon: <TrashMenuIcon/>,
      danger: true,
      onSelect: () => promptDelete(() => { deleteProjectNote(categoryId, projectId, note.id); onClose() }),
    },
  ] : [
    { label: 'Copy Note', icon: <CopyMenuIcon/>, onSelect: handleCopy },
    categoryId != null && projectId != null && {
      label: note.archived ? 'Unarchive Note' : 'Archive Note',
      icon: note.archived ? <RetrieveMenuIcon/> : <ArchiveMenuIcon/>,
      onSelect: () => {
        note.archived
          ? unarchiveProjectNote(categoryId, projectId, note.id)
          : archiveProjectNote(categoryId, projectId, note.id)
        onClose()
      },
    },
    categoryId != null && projectId != null && {
      label: 'Delete Note',
      icon: <TrashMenuIcon/>,
      danger: true,
      onSelect: () => promptDelete(() => { deleteProjectNote(categoryId, projectId, note.id); onClose() }),
    },
  ]

  return (
    <div
      ref={pageRef}
      className={`note-detail-page${editing ? ' editing' : ''}${isOpen ? ' open' : ''}${hasFooter ? ' has-footer' : ''}${inInbox ? ' inbox-page' : ''}${lockPageClass(lock)}`}
      style={{
        '--underline-url': `url(${underlineUrl})`,
        ...(noteAccent ? {
          '--accent-base': noteAccent.base,
          '--accent-dark': noteAccent.dark,
          '--accent-light': noteAccent.light,
          '--accent-base-rgb': noteAccent.baseRgb,
        } : {}),
      }}
    >
      <div className="note-detail-header">
        {darkDots ? (
          <FeatherFileIcon size={24} color="var(--accent-base)"/>
        ) : (
          <svg width="24" height="24" viewBox="0 0 20 22" fill="none">
            <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="#595959" strokeWidth="1" strokeLinejoin="round" fill="none"/>
            <path d="M12 3v5h5" stroke="#595959" strokeWidth="1" strokeLinejoin="round"/>
            <line x1="5" y1="13" x2="15" y2="13" stroke="#595959" strokeWidth="1" strokeLinecap="round"/>
            <line x1="5" y1="16.5" x2="12" y2="16.5" stroke="#595959" strokeWidth="1" strokeLinecap="round"/>
          </svg>
        )}
        {archived && <span className="detail-archived-label">Archived</span>}
        <span ref={scrollTitleRef} className="note-scroll-title" />
        {!soloItem && <DetailLockButton lock={lock} beforeLock={() => { flushAutosave(); if (editingTitleRef.current) saveTitleEdit() }} />}
        <button className={`note-detail-done${editingTitle ? ' is-saving' : ''}${lock.locked && !(editing || editingTitle) ? ' lock-hidden' : ''}`} onMouseDown={handleTopButtonDown} onClick={handleButtonClick}>
          {(editing || editingTitle) ? 'Save' : DONE_LABEL}
        </button>
      </div>

      {darkDots && (
        <div
          ref={titleFieldRef}
          className="note-detail-title"
          contentEditable={!archived}
          suppressContentEditableWarning
          spellCheck="false"
          autoCapitalize="sentences"
          onInput={handleTitleFieldInput}
          onFocus={handleTitleFocus}
          onBlur={saveTitleEdit}
          onKeyDown={handleTitleKeyDown}
        />
      )}

      <div className="note-editor" id="noteEditor" ref={editorRef}>
        <div
          ref={contentRef}
          id="noteEditorContent"
          style={{ padding: darkDots ? '16px 24px 40px' : '0 32px 40px', outline: 'none', minHeight: '100px', cursor: 'text', overflow: 'hidden' }}
          autoCapitalize="sentences"
          contentEditable={false}
          onKeyDown={handleKeyDown}
          onInput={handleEditorInput}
          onPaste={handlePaste}
          onCopy={handleSelectionCopy}
          onCut={handleSelectionCut}
          onClick={handleContentClick}
        />
        <div
          style={{ minHeight: '120px', cursor: 'text' }}
          onClick={handleEmptyAreaClick}
        />
      </div>

      <div className="note-style-bar" ref={styleBarRef} id="noteStyleBar">
        <div className="note-style-indicator" ref={indicatorRef} id="noteStyleIndicator"/>
        {/* 'title' is the note's own heading style — it isn't offered here, so it
            can't be applied to body text (or taken off the title). What used to
            be H2 / H3 are now labelled H1 / H2. */}
        {['heading','bold','body','italic','bullet'].map(s => (
          <button
            key={s}
            className={`note-style-btn${currentStyle === s ? ' active' : ''}`}
            data-style={s}
            onTouchStart={e => { e.preventDefault(); selectStyle(s) }}
            onMouseDown={e => { e.preventDefault(); selectStyle(s) }}
          >
            <span>{s === 'heading' ? 'H1' : s === 'bold' ? 'H2' : s === 'bullet' ? '• List' : s.charAt(0).toUpperCase() + s.slice(1)}</span>
          </button>
        ))}
      </div>

      {/* Highlight and Add photo share one pill to the right of the style bar */}
      <div className={`note-tools${editing ? ' visible' : ''}`}>
        <button
          type="button"
          className={`note-tool-btn note-highlight-btn${hlOn ? ' on' : ''}`}
          aria-label="Highlight"
          aria-pressed={hlOn}
          // A tap fires touchstart and then (React's touch listeners being
          // passive, so preventDefault can't stop it) an emulated mousedown —
          // toggling twice, so the line ended up as it started. The mousedown
          // that follows a touch is ignored.
          onTouchStart={() => { hlTouchRef.current = Date.now(); toggleHighlight() }}
          onMouseDown={e => { e.preventDefault(); if (Date.now() - hlTouchRef.current < 1000) return; toggleHighlight() }}
        >
          <HighlightIcon/>
        </button>
        <button
          type="button"
          className={`note-tool-btn note-attach-btn${attachMenu ? ' open' : ''}`}
          aria-label="Attach"
          onMouseDown={e => { e.preventDefault(); rememberCaret() }}
          onTouchStart={() => rememberCaret()}
          onClick={() => setAttachMenu(m => (m ? null : 'root'))}
        >
          <MediaIcon/>
        </button>
        <input ref={libraryInputRef} type="file" accept="image/*" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) insertImage(f) }}/>

        {/* Attach: Photo (the device's own camera / library menu), Link or
            Note — those two turn the menu into this canvas's links / notes */}
        <div ref={attachMenuRef} className={`card-context-menu note-media-menu note-attach-menu${attachMenu ? ' open' : ''}${attachMenu && attachMenu !== 'root' ? ' picking' : ''}`}>
          {attachMenu === 'root' && (<>
            <button type="button" className="card-context-item" onMouseDown={e => e.preventDefault()}
              onClick={() => { setAttachMenu(null); pickMedia() }}>
              <PhotoIcon/>Photo
            </button>
            <button type="button" className="card-context-item" onMouseDown={e => e.preventDefault()}
              onClick={() => setAttachMenu('link')}>
              <FeatherLinkIcon size={20} color="currentColor" strokeWidth={2}/>Link
            </button>
            <button type="button" className="card-context-item" onMouseDown={e => e.preventDefault()}
              onClick={() => setAttachMenu('note')}>
              <FeatherFileIcon size={20} color="currentColor" strokeWidth={2}/>Note
            </button>
          </>)}
          {attachMenu === 'note' && (attachableNotes.length === 0
            ? <div className="todo-attach-empty">No other notes to attach</div>
            : attachableNotes.map(n => {
              const preview = notePreviewOf(n.editorHTML)
              return (
                <button key={n.id} type="button" className="todo-attach-item" onMouseDown={e => e.preventDefault()}
                  onClick={() => { setAttachMenu(null); insertEmbed('note', n.id) }}>
                  <span className="note-text">{n.text}</span>
                  {preview && <span className="note-preview-text">{preview}</span>}
                </button>
              )
            }))}
          {attachMenu === 'link' && (attachableLinks.length === 0
            ? <div className="todo-attach-empty">No other links to attach</div>
            : attachableLinks.map(l => (
              <button key={l.id} type="button" className="todo-attach-item" onMouseDown={e => e.preventDefault()}
                onClick={() => { setAttachMenu(null); insertEmbed('link', l.id) }}>
                <span className="note-text">{l.title || l.url}</span>
                <span className="note-preview-text">{(l.url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
              </button>
            )))}
        </div>
      </div>

      {/* Attached notes and links, drawn into their blocks in the text */}
      {embeds.filter(e => e.el.isConnected).map(e => createPortal(
        <NoteEmbedBlock
          type={e.type}
          ids={e.ids}
          project={project}
          categoryId={categoryId}
          projectId={projectId}
          editing={editing}
          onRemove={(id) => removeEmbed(e.el, id)}
          onOpenNote={(id) => setOpenDetail({ type: 'note', id })}
          onOpenLink={(id) => setOpenDetail({ type: 'link', id })}
        />,
        e.el,
        e.key,
      ))}

      {hasFooter && !editing && moveOpen && (
        <MoveToCard
          categories={categories}
          currentCategoryId={categoryId}
          currentProjectId={projectId}
          topPx={moveTop}
          onCancel={() => setMoveOpen(false)}
          onSave={saveMove}
        />
      )}

      {hasFooter && !editing && (
        <DetailFooter
          menuItems={footerMenuItems}
          activated={!!activated}
          scheduledDate={note.scheduledDate}
          onToggleActive={onToggleActive}
          onSchedule={inInbox ? undefined : onSchedule}
          onClearSchedule={onClearSchedule}
          accent={noteAccent}
          projectName={projectName}
          inbox={inInbox}
          onProjectClick={openMove}
          menuOpen={moveOpen}
          onCopy={handleCopy}
          copied={copied}
          scrollable={contentScrollable}
        />
      )}
    </div>
  )
}

export { NoteDetailPage }

// The lines last copied from a note, kept in memory as well as on the
// clipboard: some browsers (Safari above all) clean the copied HTML on paste
// and drop the attributes that carry each line's style. When the pasted plain
// text matches what was copied here, these lines are used instead.
let lastNoteCopy = null   // { text, lines }
const normClip = (t) => (t || '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').replace(/\s+$/, '')

// The .note-para holding a node (or null)
function getParaOf(node) {
  let n = node
  while (n && n.nodeType !== 1) n = n.parentNode
  return n && n.closest ? n.closest('.note-para') : null
}

export default function NoteCard({ notes, onDelete, onUpdateNote, onReorder }) {
  const { openDetail, setOpenDetail, promptDelete } = useAppContext()
  // Local active notes use their own type so their ids can't collide with project notes
  const openNoteId = openDetail?.type === 'local-note' ? openDetail.id : null
  const setOpenNoteId = (id) => setOpenDetail(id == null ? null : (prev => (prev?.type === 'local-note' && prev.id === id) ? null : { type: 'local-note', id }))
  const cardRef = useRef(null)
  const containerRef = useRef(null)
  const rowMenu = useRowMenu()
  const { onDragPointerDown } = useDragReorder(containerRef, notes, onReorder)

  // Three-dot header menu (mirrors the Lists card / project cards).
  // Notes has no menu actions yet, so the menu stays hidden until menuItems has entries.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const menuItems = []
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [menuOpen])

  useEffect(() => {
    const themeTag = document.querySelector('meta[name="theme-color"]')
    if (openNoteId) {
      document.documentElement.style.backgroundColor = '#F2F0EB'
      document.body.style.backgroundColor = '#F2F0EB'
      if (themeTag) themeTag.setAttribute('content', '#F2F0EB')
    } else {
      document.documentElement.style.backgroundColor = ''
      document.body.style.backgroundColor = ''
      if (themeTag) themeTag.setAttribute('content', '#F2F0EB')
    }
    return () => {
      document.documentElement.style.backgroundColor = ''
      document.body.style.backgroundColor = ''
      if (themeTag) themeTag.setAttribute('content', '#F2F0EB')
    }
  }, [openNoteId])

  const handleDelete = useCallback((id) => {
    promptDelete(() => {
      const swipeRow = containerRef.current?.querySelector(`[data-swipe-id="${id}"]`)
      const wrapper = swipeRow?.parentElement
      if (!wrapper) { onDelete(id); return }
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

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    requestAnimationFrame(() => { card.classList.add('visible') })
  }, [notes.length > 0])

  if (notes.length === 0) return null

  const openNote = notes.find(n => n.id === openNoteId)

  const buildRowItems = (n) => () => ([
    { label: 'Delete Note', icon: <TrashMenuIcon/>, danger: true, onSelect: () => handleDelete(n.id) },
  ])

  // Tap (no drag, no long-press menu) opens the note editor
  const onRowTap = (e, id) => {
    const startX = e.clientX, startY = e.clientY
    let moved = false
    const onMove = (e2) => {
      if (Math.abs(e2.clientX - startX) > 8 || Math.abs(e2.clientY - startY) > 8) moved = true
    }
    const onUp = () => {
      if (!moved && !isRowMenuOpen()) setOpenNoteId(id)
      cleanup()
    }
    const cleanup = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', cleanup)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', cleanup)
  }

  return (
    <>
      <div className="card card-intro" id="notesCard" ref={cardRef}>
        <div className="card-header">
          <span className="card-title">Notes</span>
          {menuItems.length > 0 && (
            <div className="dots-menu-wrap" ref={menuRef}>
              <div
                className="dots-menu dots-menu-btn"
                onMouseDown={e => { e.preventDefault(); setMenuOpen(v => !v) }}
              >
                <span/><span/><span/>
              </div>
              <div className={`card-context-menu${menuOpen ? ' open' : ''}`}>
                {menuItems.map(item => (
                  <button
                    key={item.label}
                    className={`card-context-item${item.danger ? ' danger' : ''}`}
                    onMouseDown={e => { e.preventDefault(); item.onSelect(); setMenuOpen(false) }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div id="notes-container" ref={containerRef}>
          {notes.map((n, i) => (
            <div key={n.id}>
              {i > 0 && <div className="divider"/>}
              <div className={`swipe-row${n.id === openNoteId ? ' row-open' : ''}`} data-swipe-id={n.id} data-swipe-type="note" onPointerDown={e => { rowMenu.press(e, buildRowItems(n)); onRowTap(e, n.id); onDragPointerDown(e, n.id) }}
                        onContextMenu={e => rowMenu.context(e, buildRowItems(n))}>
                <div className="swipe-content">
                  <div className="note-row" data-note-id={n.id}>
                    <div className="checkbox-wrap" style={{ pointerEvents: 'none' }}>
                      <svg width="24" height="24" viewBox="0 0 20 22" fill="none">
                        <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="var(--accent-dark)" strokeWidth="1" fill="var(--accent-light)"/>
                        <path d="M12 3v5h5" stroke="var(--accent-dark)" strokeWidth="1" fill="none"/>
                        <line x1="5" y1="13" x2="15" y2="13" stroke="var(--accent-dark)" strokeWidth="1" strokeLinecap="round"/>
                        <line x1="5" y1="16.5" x2="12" y2="16.5" stroke="var(--accent-dark)" strokeWidth="1" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div className="item-content">
                      <span className={`note-text${n.accent ? ' accent' : ''}`}>{n.text}</span>
                      <div className="source-label">
                        <StarIcon/>
                        <span className="source-label-text">{n.source}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {useCardHostsDetail() && openNote && createPortal(
        <NoteDetailPage
          note={openNote}
          onClose={() => setOpenNoteId(null)}
          onSave={onUpdateNote}
        />,
        document.getElementById('app')
      )}

      <RowActionMenu state={rowMenu.state} onClose={rowMenu.close} />
    </>
  )
}
