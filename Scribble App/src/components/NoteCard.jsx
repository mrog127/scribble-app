import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { lockRowDrag, unlockRowDrag } from '../rowDragLock.js'
import { swappedFrom } from '../noteIdSwap.js'
import { createPortal } from 'react-dom'
import underlineUrl from '../assets/Underline.svg?url'
import { useAppContext } from '../context/AppContext.jsx'
import { getCategoryAccent } from '../theme.js'
import DetailFooter from './DetailFooter.jsx'
import { useScrollable } from '../useScrollable.js'
import MoveToCard from './MoveToCard.jsx'
import { useRowMenu, RowActionMenu, isRowMenuOpen } from './RowMenu.jsx'
import { useTheme } from '../useTheme.js'
import { FileIcon as FeatherFileIcon } from './FeatherIcons.jsx'
import { TrashMenuIcon, ArchiveMenuIcon, RetrieveMenuIcon, CopyMenuIcon } from './MenuIcons.jsx'
import { buildDragCloneShell, dragLiftShadow } from '../dragClone.js'

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
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

function NoteDetailPage({ note, onClose, onSave, activated, onToggleActive, onSchedule, onClearSchedule, projectName, categoryId, projectId, archived = false }) {
  const darkDots = ['dark-dots', 'light-dots'].includes(useTheme())
  // Archived notes (or notes in an archived canvas) are read-only: no editing, no footer.
  const hasFooter = !!projectName && typeof onToggleActive === 'function' && !archived
  const { categories, moveProjectNote, autoEditNoteId, setAutoEditNoteId,
    promptDelete, deleteProjectNote, archiveProjectNote, unarchiveProjectNote } = useAppContext()
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveTop, setMoveTop] = useState(null)
  const noteAccent = useMemo(() => {
    if (!note?.categoryId) return null
    const idx = categories.findIndex(c => c.id === note.categoryId)
    if (idx === -1) return null
    return getCategoryAccent(idx)
  }, [note, categories])

  const [editing, setEditing] = useState(false)
  // Title-only editing (Dots themes): tapping the title edits just the title,
  // like a list item page — the body stays put, and Save / Enter / tapping away
  // saves it. Separate from editing the body (`editing`).
  const [editingTitle, setEditingTitle] = useState(false)
  const editingTitleRef = useRef(false)
  const skipButtonClickRef = useRef(false)
  const editingRef = useRef(false)
  const [currentStyle, setCurrentStyle] = useState('body')
  const [isOpen, setIsOpen] = useState(false)
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
    if (categoryId && projectId) moveProjectNote(categoryId, projectId, sel.categoryId, sel.projectId, note.id)
    setMoveOpen(false)
  }, [categoryId, projectId, note?.id, moveProjectNote])

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
    const html = content.innerHTML
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
        onSave(note.id, contentRef.current.innerHTML, firstPara ? firstPara.textContent.trim() : note.text)
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
    const paras = [...content.querySelectorAll('.note-para')].filter(p => !p.querySelector('.note-para'))
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
    const selected = getSelectedParas().filter(p => p !== first)
    if (selected.length > 1 || (selected.length === 1 && getSelectedParas().length > 1)) {
      selected.forEach(p => { if (!/style-/.test(p.className) || !p.classList.contains('style-' + style)) p.className = 'note-para style-' + style })
      setCurrentStyle(style)
      updateStyleIndicator(style)
      scheduleAutosave()
      return
    }
    const target = getCursorPara() || lastCursorParaRef.current || content.querySelector('.note-para:last-of-type')
    // The title line's style is fixed — the tap does nothing at all.
    if (target && target === first) return
    setCurrentStyle(style)
    updateStyleIndicator(style)
    if (target && content.contains(target)) target.className = 'note-para style-' + style
    scheduleAutosave()
  }, [getCursorPara, getSelectedParas, updateStyleIndicator, scheduleAutosave])

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
      onSave(note.id, content.innerHTML, firstPara ? firstPara.textContent.trim() : note.text)
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
      const own = y >= r.top && y <= r.bottom
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
        }
      }
      t = null
    }

    content.addEventListener('pointerdown', onPointerDown)
    content.addEventListener('wheel', onWheel, { passive: false })
    surface.addEventListener('touchstart', onTouchStart, { passive: false })
    surface.addEventListener('touchmove', onTouchMove, { passive: false })
    surface.addEventListener('touchend', onTouchEnd)
    surface.addEventListener('touchcancel', onTouchEnd)
    return () => {
      content.removeEventListener('pointerdown', onPointerDown)
      content.removeEventListener('wheel', onWheel)
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
        onSave(note.id, content.innerHTML, text)
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
  }, [updateStyleIndicator])

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
    onSave(note.id, content.innerHTML, text)
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
    else contentRef.current?.focus()                             // body editing: on into the body
  }, [])

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
    const push = (style, text) => { const t = clean(text); if (t) out.push({ style, text: t }) }

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
    e.clipboardData.setData('text/plain', lines.map(l => (l.style === 'bullet' ? '• ' : '') + l.text).join('\n'))
    e.preventDefault()
    return true
  }, [])

  const handleSelectionCopy = useCallback((e) => { writeSelectionToClipboard(e) }, [writeSelectionToClipboard])
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
    let blocks = (html && blocksFromNoteHtml(html)) || (html ? blocksFromHtml(html) : [])
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

  const footerMenuItems = [
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
      className={`note-detail-page${editing ? ' editing' : ''}${isOpen ? ' open' : ''}${hasFooter ? ' has-footer' : ''}`}
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
        <button className={`note-detail-done${editingTitle ? ' is-saving' : ''}`} onMouseDown={handleTopButtonDown} onClick={handleButtonClick}>
          {(editing || editingTitle) ? 'Save' : 'Done'}
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
            <span>{s === 'heading' ? 'H1' : s === 'bold' ? 'H2' : s === 'bullet' ? '• Bullet' : s.charAt(0).toUpperCase() + s.slice(1)}</span>
          </button>
        ))}
      </div>

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
          onSchedule={onSchedule}
          onClearSchedule={onClearSchedule}
          accent={noteAccent}
          projectName={projectName}
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

export default // The .note-para holding a node (or null)
function getParaOf(node) {
  let n = node
  while (n && n.nodeType !== 1) n = n.parentNode
  return n && n.closest ? n.closest('.note-para') : null
}

function NoteCard({ notes, onDelete, onUpdateNote, onReorder }) {
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

      {openNote && createPortal(
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
