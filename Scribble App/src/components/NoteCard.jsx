import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import UnderlineSvg from '../assets/Underline.svg?react'

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
    const preventScroll = (e) => e.preventDefault()

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
      document.addEventListener('touchmove', preventScroll, { passive: false })
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
      if (longPressTimer && (dx > 8 || dy > 8)) { clearTimeout(longPressTimer); longPressTimer = null }
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
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 1L7.27 4.27L10.85 4.63L8.3 6.9L9.09 10.4L6 8.5L2.91 10.4L3.7 6.9L1.15 4.63L4.73 4.27L6 1Z" fill="rgba(105,147,254,0.2)" stroke="#3F5999" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

function NoteDetailPage({ note, onClose, onSave }) {
  const [editing, setEditing] = useState(false)
  const [currentStyle, setCurrentStyle] = useState('body')
  const [isOpen, setIsOpen] = useState(false)
  const contentRef = useRef(null)
  const styleBarRef = useRef(null)
  const indicatorRef = useRef(null)
  const pageRef = useRef(null)
  const editorRef = useRef(null)
  const scrollTitleRef = useRef(null)
  const underlineRef = useRef(null)

  // Slide in on mount
  useEffect(() => {
    requestAnimationFrame(() => setIsOpen(true))
  }, [])

  // Track keyboard height and push style bar above it (mobile)
  useEffect(() => {
    const vv = window.visualViewport
    const update = () => {
      const page = pageRef.current
      if (!page) return
      const pageBottom = page.getBoundingClientRect().bottom
      const vpBottom = vv ? (vv.offsetTop + vv.height) : window.innerHeight
      const kbh = Math.max(0, pageBottom - vpBottom)
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
  }, [note])

  // Scroll title visibility + underline fade
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const check = () => {
      const content = contentRef.current
      const titleEl = scrollTitleRef.current
      const underlineEl = underlineRef.current
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

      // Underline SVG: fade as it scrolls from natural position to bounding box top
      if (underlineEl) {
        const rect = underlineEl.getBoundingClientRect()
        const bottomRelative = rect.bottom - editorTop
        const opacity = Math.max(0, Math.min(1, (bottomRelative - 32) / rect.height))
        underlineEl.style.opacity = opacity
      }
    }
    editor.addEventListener('scroll', check, { passive: true })
    return () => editor.removeEventListener('scroll', check)
  }, [])

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
  const detectCursorStyle = useCallback(() => {
    const content = contentRef.current
    if (!content) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    let el = sel.anchorNode
    while (el && el !== content) {
      if (el.nodeType === 1 && el.classList && el.classList.contains('note-para')) {
        const match = el.className.match(/style-(\w+)/)
        if (match) {
          setCurrentStyle(match[1])
          updateStyleIndicator(match[1])
        }
        return
      }
      el = el.parentNode
    }
  }, [updateStyleIndicator])

  // Update style indicator whenever selection changes (cursor moves)
  useEffect(() => {
    if (!editing) return
    document.addEventListener('selectionchange', detectCursorStyle)
    return () => document.removeEventListener('selectionchange', detectCursorStyle)
  }, [editing, detectCursorStyle])

  const selectStyle = useCallback((style) => {
    setCurrentStyle(style)
    updateStyleIndicator(style)
    const content = contentRef.current
    if (!content || content.contentEditable !== 'true') return
    const sel = window.getSelection()
    let target = null
    if (sel) {
      let el = sel.anchorNode
      while (el && el !== content) {
        if (el.nodeType === 1 && el.classList?.contains('note-para')) { target = el; break }
        el = el.parentNode
      }
    }
    if (!target) target = content.querySelector('.note-para:last-of-type')
    if (target) target.className = 'note-para style-' + style
  }, [updateStyleIndicator])

  const enterEdit = useCallback((savedRange) => {
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
  }, [detectCursorStyle])

  // Click on the text content — capture caret position then enter edit mode
  const handleContentClick = useCallback((e) => {
    if (editing) return
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
  }, [editing, enterEdit])

  // Click on empty area below text — place cursor at end
  const handleEmptyAreaClick = useCallback(() => {
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
  }, [editing, enterEdit, detectCursorStyle])

  // Save exits edit mode but keeps note open; Done closes the note
  const handleButtonClick = useCallback(() => {
    if (editing) {
      const content = contentRef.current
      if (content) {
        content.contentEditable = 'false'
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
    newPara.scrollIntoView({ block: 'nearest' })
  }, [currentStyle, updateStyleIndicator])

  return (
    <div ref={pageRef} className={`note-detail-page${editing ? ' editing' : ''}${isOpen ? ' open' : ''}`}>
      <div className="note-detail-header">
        <svg width="24" height="24" viewBox="0 0 20 22" fill="none">
          <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="#595959" strokeWidth="2" strokeLinejoin="round" fill="none"/>
          <path d="M12 3v5h5" stroke="#595959" strokeWidth="2" strokeLinejoin="round"/>
          <line x1="5" y1="13" x2="15" y2="13" stroke="#595959" strokeWidth="2" strokeLinecap="round"/>
          <line x1="5" y1="16.5" x2="12" y2="16.5" stroke="#595959" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <span ref={scrollTitleRef} className="note-scroll-title" />
        <button className="note-detail-done" onClick={handleButtonClick}>
          {editing ? 'Save' : 'Done'}
        </button>
      </div>

      <div className="note-editor" id="noteEditor" ref={editorRef}>
        <div ref={underlineRef} style={{ display: 'block', marginTop: '32px', marginLeft: '32px', marginBottom: '32px' }}>
          <UnderlineSvg style={{ display: 'block', color: '#6993FE' }} />
        </div>
        <div
          ref={contentRef}
          id="noteEditorContent"
          style={{ padding: '0 32px 40px', outline: 'none', minHeight: '100px', cursor: 'text', overflow: 'hidden' }}
          contentEditable={false}
          onKeyDown={handleKeyDown}
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
            onMouseDown={e => { e.preventDefault(); selectStyle(s) }}
          >
            <span>{s === 'heading' ? 'Head' : s === 'bullet' ? '• Bullet' : s.charAt(0).toUpperCase() + s.slice(1)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export { NoteDetailPage }

export default function NoteCard({ notes, onDelete, onUpdateNote, onReorder }) {
  const [openNoteId, setOpenNoteId] = useState(null)
  const swipeState = useRef({})
  const cardRef = useRef(null)
  const containerRef = useRef(null)
  const { onDragPointerDown } = useDragReorder(containerRef, notes, onReorder)

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
      const isTap = !s.dir && Math.abs(dx) < 8 && Math.abs(dy) < 8
      if (isTap) {
        if (s.wasLeft || s.wasRight) {
          s.row.classList.remove('swiped-left', 'swiped-right')
          content.style.transform = ''
        } else {
          setOpenNoteId(id)
        }
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
  }

  return (
    <>
      <div className="card card-intro" id="notesCard" ref={cardRef}>
        <div className="card-header">
          <div>
            <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
              <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="#3D3D3D" strokeWidth="1.5" fill="none"/>
              <path d="M12 3v5h5" stroke="#3D3D3D" strokeWidth="1.5"/>
              <line x1="5" y1="13" x2="15" y2="13" stroke="#3D3D3D" strokeWidth="1.3" strokeLinecap="round"/>
              <line x1="5" y1="16.5" x2="12" y2="16.5" stroke="#3D3D3D" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="card-title">Notes</span>
          <div className="dots-menu"><span/><span/><span/></div>
        </div>

        <div id="notes-container" ref={containerRef}>
          {notes.map((n, i) => (
            <div key={n.id}>
              {i > 0 && <div className="divider"/>}
              <div className="swipe-row" data-swipe-id={n.id} data-swipe-type="note">
                <button className="swipe-action-btn active-tag" onMouseDown={e => e.preventDefault()}>
                  <div className="swipe-active-inner">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    </svg>
                    <span className="swipe-action-label">Active</span>
                  </div>
                </button>
                <button className="swipe-action-btn delete" onMouseDown={e => { e.preventDefault(); handleDelete(n.id) }}>
                  <div className="swipe-active-inner">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="swipe-action-label">Delete</span>
                  </div>
                </button>
                <div className="swipe-content">
                  <div className="note-row" data-note-id={n.id} onPointerDown={e => { onPointerDown(e, n.id); onDragPointerDown(e, n.id) }}>
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
