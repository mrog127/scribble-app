import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import underlineUrl from '../assets/Underline.svg?url'
import { useAppContext } from '../context/AppContext.jsx'
import { getCategoryAccent } from '../theme.js'
import DetailFooter from './DetailFooter.jsx'
import { useScrollable } from '../useScrollable.js'
import MoveToCard from './MoveToCard.jsx'

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
      cloneInner.style.cssText = 'pointer-events:none;background:#F2F0EB;'
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
        'background:#F2F0EB',
        'overflow:hidden',
        'z-index:999',
      ].join(';')
      clone.appendChild(cloneInner)
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
      started = start(clientY)
      if (!started) return
      if (longPress) {
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
      if (longPressTimer && (dx > 8 || dy > 8)) { clearTimeout(longPressTimer); longPressTimer = null; document.removeEventListener('touchmove', preventScroll) }
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
  // Archived notes (or notes in an archived canvas) are read-only: no editing, no footer.
  const hasFooter = !!projectName && typeof onToggleActive === 'function' && !archived
  const { categories, moveProjectNote, autoEditNoteId, setAutoEditNoteId } = useAppContext()
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveTop, setMoveTop] = useState(null)
  const noteAccent = useMemo(() => {
    if (!note?.categoryId) return null
    const idx = categories.findIndex(c => c.id === note.categoryId)
    if (idx === -1) return null
    return getCategoryAccent(idx)
  }, [note, categories])

  const [editing, setEditing] = useState(false)
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

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.innerHTML = buildNoteContent(note)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id])

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
      // Center indicator on the text label, extending 12px on each side
      const textLeft = btn.offsetLeft + span.offsetLeft
      ind.style.transition = 'left 100ms ease, width 100ms ease'
      ind.style.left = (textLeft - 12) + 'px'
      ind.style.width = (span.offsetWidth + 24) + 'px'
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

  const detectCursorStyle = useCallback(() => {
    const para = getCursorPara()
    if (!para) return
    lastCursorParaRef.current = para
    const match = para.className.match(/style-(\w+)/)
    if (match) {
      setCurrentStyle(match[1])
      updateStyleIndicator(match[1])
    }
  }, [getCursorPara, updateStyleIndicator])

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

  const selectStyle = useCallback((style) => {
    setCurrentStyle(style)
    updateStyleIndicator(style)
    const content = contentRef.current
    if (!content || !editingRef.current) return
    const target = getCursorPara() || lastCursorParaRef.current || content.querySelector('.note-para:last-of-type')
    if (target && content.contains(target)) target.className = 'note-para style-' + style
  }, [getCursorPara, updateStyleIndicator])

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

  // Save exits edit mode but keeps note open; Done closes the note
  const handleButtonClick = useCallback(() => {
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
    if (e.key !== 'Enter') return
    const content = contentRef.current
    if (!content) return
    e.preventDefault()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)

    // Delete any selected content first
    if (!range.collapsed) range.deleteContents()

    let currentPara = range.startContainer
    while (currentPara && currentPara !== content) {
      if (currentPara.nodeType === 1 && currentPara.classList && currentPara.classList.contains('note-para')) break
      currentPara = currentPara.parentNode
    }

    // Empty bullet + Enter → revert current paragraph to Body
    if (currentStyle === 'bullet' && currentPara && currentPara.classList?.contains('note-para')) {
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

    const newStyle = currentStyle === 'bullet' ? 'bullet' : 'body'
    const newPara = document.createElement('div')
    newPara.className = 'note-para style-' + newStyle

    if (currentPara && currentPara !== content && currentPara.parentNode === content) {
      // Extract content from cursor to end of currentPara into the new para
      const afterRange = document.createRange()
      afterRange.setStart(range.startContainer, range.startOffset)
      afterRange.setEnd(currentPara, currentPara.childNodes.length)
      const fragment = afterRange.extractContents()

      if (fragment.textContent) {
        newPara.appendChild(fragment)
      } else {
        newPara.innerHTML = '<br>'
      }

      // Ensure currentPara isn't left empty
      if (!currentPara.textContent && !currentPara.querySelector('br')) {
        currentPara.innerHTML = '<br>'
      }

      currentPara.after(newPara)
    } else {
      newPara.innerHTML = '<br>'
      content.appendChild(newPara)
    }

    const newRange = document.createRange()
    newRange.setStart(newPara, 0)
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)
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
  }, [currentStyle, updateStyleIndicator])

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
  const handleEditorInput = useCallback(() => {
    handleInput()
    if (editorRef.current) checkBottomOverflow(editorRef.current)
  }, [handleInput, checkBottomOverflow])

  // Copy the note's text WITH styling so it can be pasted into the iOS Notes app.
  // Builds an HTML payload (h1/h2/h3, <ul><li> for bullets) plus a plain-text
  // fallback. H2 (heading) lines get a blank line above; bullets become bullet points.
  const handleCopy = useCallback(() => {
    const content = contentRef.current
    if (!content) return
    const paras = [...content.querySelectorAll('.note-para')]
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
        <svg width="24" height="24" viewBox="0 0 20 22" fill="none">
          <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="#595959" strokeWidth="1" strokeLinejoin="round" fill="none"/>
          <path d="M12 3v5h5" stroke="#595959" strokeWidth="1" strokeLinejoin="round"/>
          <line x1="5" y1="13" x2="15" y2="13" stroke="#595959" strokeWidth="1" strokeLinecap="round"/>
          <line x1="5" y1="16.5" x2="12" y2="16.5" stroke="#595959" strokeWidth="1" strokeLinecap="round"/>
        </svg>
        {archived && <span className="detail-archived-label">Archived</span>}
        <span ref={scrollTitleRef} className="note-scroll-title" />
        <button className="note-detail-done" onClick={handleButtonClick}>
          {editing ? 'Save' : 'Done'}
        </button>
      </div>

      <div className="note-editor" id="noteEditor" ref={editorRef}>
        <div
          ref={contentRef}
          id="noteEditorContent"
          style={{ padding: '0 32px 40px', outline: 'none', minHeight: '100px', cursor: 'text', overflow: 'hidden' }}
          autoCapitalize="sentences"
          contentEditable={false}
          onKeyDown={handleKeyDown}
          onInput={handleEditorInput}
          onClick={handleContentClick}
        />
        <div
          style={{ minHeight: '120px', cursor: 'text' }}
          onClick={handleEmptyAreaClick}
        />
      </div>

      <div className="note-style-bar" ref={styleBarRef} id="noteStyleBar">
        <div className="note-style-indicator" ref={indicatorRef} id="noteStyleIndicator"/>
        {['title','heading','bold','body','italic','bullet'].map(s => (
          <button
            key={s}
            className={`note-style-btn${currentStyle === s ? ' active' : ''}`}
            data-style={s}
            onTouchStart={e => { e.preventDefault(); selectStyle(s) }}
            onMouseDown={e => { e.preventDefault(); selectStyle(s) }}
          >
            <span>{s === 'title' ? 'H1' : s === 'heading' ? 'H2' : s === 'bold' ? 'H3' : s === 'bullet' ? '• Bullet' : s.charAt(0).toUpperCase() + s.slice(1)}</span>
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

export default function NoteCard({ notes, onDelete, onUpdateNote, onReorder }) {
  const { openDetail, setOpenDetail } = useAppContext()
  // Local active notes use their own type so their ids can't collide with project notes
  const openNoteId = openDetail?.type === 'local-note' ? openDetail.id : null
  const setOpenNoteId = (id) => setOpenDetail(id == null ? null : (prev => (prev?.type === 'local-note' && prev.id === id) ? null : { type: 'local-note', id }))
  const swipeState = useRef({})
  const cardRef = useRef(null)
  const containerRef = useRef(null)
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
  }, [onDelete])

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    requestAnimationFrame(() => { card.classList.add('visible') })
  }, [notes.length > 0])

  if (notes.length === 0) return null

  const openNote = notes.find(n => n.id === openNoteId)

  const onPointerDown = (e, id) => {
    if (e.target.closest('.swipe-action-btn')) return
    const row = e.currentTarget  // handler is on .swipe-row, so this IS the row

    // If a button is exposed, close and swallow — note must not open
    if (row.classList.contains('swiped-left') || row.classList.contains('swiped-right')) {
      row.classList.remove('swiped-left', 'swiped-right')
      const content = row.querySelector('.swipe-content')
      if (content) content.style.transform = ''
      return
    }

    swipeState.current = { id, startX: e.clientX, startY: e.clientY, row, dir: null, wasLeft: false, wasRight: false, lockSign: null }

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
      const isTap = !s.dir && Math.abs(dx) < 8 && Math.abs(dy) < 8
      if (isTap) {
        setOpenNoteId(id)
        cleanup()
        return
      }
      const base = s.wasLeft ? -84 : s.wasRight ? 84 : 0
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
      if (s2.row && s2.dir) {
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
              <div className={`swipe-row${n.id === openNoteId ? ' row-open' : ''}`} data-swipe-id={n.id} data-swipe-type="note" onPointerDown={e => { onPointerDown(e, n.id); onDragPointerDown(e, n.id) }}>
                <button className="swipe-action-btn active-tag" onMouseDown={e => e.preventDefault()}>
                  <div className="swipe-active-inner">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3,6.8 10,2.6 17,6.8" vectorEffect="non-scaling-stroke"/>
                      <line x1="5" y1="7.6" x2="5" y2="14" vectorEffect="non-scaling-stroke"/>
                      <line x1="8.33" y1="7.6" x2="8.33" y2="14" vectorEffect="non-scaling-stroke"/>
                      <line x1="11.67" y1="7.6" x2="11.67" y2="14" vectorEffect="non-scaling-stroke"/>
                      <line x1="15" y1="7.6" x2="15" y2="14" vectorEffect="non-scaling-stroke"/>
                      <line x1="3.5" y1="14" x2="16.5" y2="14" vectorEffect="non-scaling-stroke"/>
                      <line x1="3" y1="17" x2="17" y2="17" vectorEffect="non-scaling-stroke"/>
                    </svg>
                    <span className="swipe-action-label">Displayed</span>
                  </div>
                </button>
                <button className="swipe-action-btn delete" onMouseDown={e => { e.preventDefault(); handleDelete(n.id) }}>
                  <div className="swipe-active-inner">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="swipe-action-label">Delete</span>
                  </div>
                </button>
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
    </>
  )
}
