import { useState, useRef, useEffect, useCallback } from 'react'

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function buildNoteContent(note) {
  if (note.editorHTML) return note.editorHTML
  return `<div class="note-para style-title">${escapeHtml(note.text)}</div><div class="note-para style-body"><br></div>`
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
  const contentRef = useRef(null)
  const styleBarRef = useRef(null)
  const indicatorRef = useRef(null)

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.innerHTML = buildNoteContent(note)
    }
  }, [note])

  const updateStyleIndicator = useCallback((style) => {
    const btn = document.querySelector(`.note-style-btn[data-style="${style}"]`)
    const ind = indicatorRef.current
    const bar = styleBarRef.current
    if (btn && ind && bar) {
      ind.style.transition = 'left 100ms ease, width 100ms ease'
      ind.style.left = btn.offsetLeft + 'px'
      ind.style.width = btn.offsetWidth + 'px'
    }
  }, [])

  const selectStyle = useCallback((style) => {
    setCurrentStyle(style)
    updateStyleIndicator(style)
    const content = contentRef.current
    if (!content || content.contentEditable !== 'true') return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const paras = content.querySelectorAll('.note-para')
    let applied = false
    paras.forEach(p => {
      if (range.intersectsNode(p)) { p.className = 'note-para style-' + style; applied = true }
    })
    if (!applied) {
      let el = sel.anchorNode
      while (el && el !== content) {
        if (el.classList && el.classList.contains('note-para')) {
          el.className = 'note-para style-' + style; break
        }
        el = el.parentElement
      }
    }
  }, [updateStyleIndicator])

  const handleEnterEdit = useCallback(() => {
    setEditing(true)
    setTimeout(() => {
      const content = contentRef.current
      if (content) {
        content.contentEditable = 'true'
        content.focus()
        if (styleBarRef.current) styleBarRef.current.classList.add('visible')
        updateStyleIndicator('body')
      }
    }, 50)
  }, [updateStyleIndicator])

  const handleDone = useCallback(() => {
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
    }
    onClose()
  }, [editing, note, onSave, onClose])

  const handleKeyDown = useCallback((e) => {
    if (e.key !== 'Enter') return
    const content = contentRef.current
    if (!content) return
    e.preventDefault()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    let currentPara = range.startContainer
    while (currentPara && currentPara !== content) {
      if (currentPara.classList && currentPara.classList.contains('note-para')) break
      currentPara = currentPara.parentElement
    }
    let newStyle = currentStyle
    if (currentStyle === 'bullet') newStyle = 'bullet'
    else newStyle = 'body'
    const newPara = document.createElement('div')
    newPara.className = 'note-para style-' + newStyle
    newPara.innerHTML = '<br>'
    if (currentPara && currentPara.parentElement === content) {
      currentPara.after(newPara)
    } else {
      content.appendChild(newPara)
    }
    const newRange = document.createRange()
    newRange.setStart(newPara, 0)
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)
    newPara.focus()
    newPara.scrollIntoView({ block: 'nearest' })
  }, [currentStyle])

  return (
    <div className={`note-detail-page${editing ? ' editing' : ''} open`}>
      <div className="note-detail-header">
        <svg width="24" height="24" viewBox="0 0 20 22" fill="none">
          <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="#595959" strokeWidth="2" strokeLinejoin="round" fill="none"/>
          <path d="M12 3v5h5" stroke="#595959" strokeWidth="2" strokeLinejoin="round"/>
          <line x1="5" y1="13" x2="15" y2="13" stroke="#595959" strokeWidth="2" strokeLinecap="round"/>
          <line x1="5" y1="16.5" x2="12" y2="16.5" stroke="#595959" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <button className="note-detail-done" onClick={handleDone}>Done</button>
      </div>

      <div className="note-editor" id="noteEditor">
        <div
          ref={contentRef}
          id="noteEditorContent"
          style={{ padding: '32px 32px 40px', outline: 'none', minHeight: '100px', cursor: 'text', overflow: 'hidden' }}
          contentEditable={false}
          onKeyDown={handleKeyDown}
          onClick={() => { if (!editing) handleEnterEdit() }}
        />
        <div
          style={{ minHeight: '120px', cursor: 'text' }}
          onClick={handleEnterEdit}
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
            {s === 'bullet' ? '• Bullet' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function NoteCard({ notes, onDelete, onUpdateNote, onReorder }) {
  const [openNoteId, setOpenNoteId] = useState(null)
  const swipeState = useRef({})

  if (notes.length === 0) return null

  const openNote = notes.find(n => n.id === openNoteId)

  const onPointerDown = (e, id) => {
    if (e.target.closest('.swipe-action-btn')) return
    const row = e.currentTarget.closest('.swipe-row')
    if (!row) return
    swipeState.current = { id, startX: e.clientX, startY: e.clientY, row, dir: null, tapTimer: null }
    swipeState.current.tapTimer = setTimeout(() => { swipeState.current.isTap = false }, 200)

    const onMove = (e2) => {
      const s = swipeState.current
      if (!s.row) return
      const dx = e2.clientX - s.startX
      const dy = e2.clientY - s.startY
      if (!s.dir) {
        if (Math.abs(dy) > 8) { cleanup(); return }
        if (Math.abs(dx) > 10) { s.dir = dx < 0 ? 'left' : 'right'; s.isTap = false }
        else return
      }
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
      if (!s.dir && Math.abs(dx) < 8) {
        setOpenNoteId(id)
        cleanup()
        return
      }
      const base = s.row.classList.contains('swiped-left') ? -72 : s.row.classList.contains('swiped-right') ? 72 : 0
      const total = base + dx
      if (total < -36) { s.row.classList.add('swiped-left'); s.row.classList.remove('swiped-right'); content.style.transform = '' }
      else if (total > 36) { s.row.classList.add('swiped-right'); s.row.classList.remove('swiped-left'); content.style.transform = '' }
      else { s.row.classList.remove('swiped-left', 'swiped-right'); content.style.transform = '' }
      cleanup()
    }

    const cleanup = () => {
      clearTimeout(swipeState.current.tapTimer)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  return (
    <>
      <div className="card" id="notesCard">
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

        <div id="notes-container">
          {notes.map((n, i) => (
            <div key={n.id}>
              {i > 0 && <div className="divider"/>}
              <div className="swipe-row" data-swipe-id={n.id} data-swipe-type="note">
                <button className="swipe-action-btn active-tag" onMouseDown={e => e.preventDefault()}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" stroke="#3F5999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                  <span className="swipe-action-label active-tag">Active</span>
                </button>
                <button className="swipe-action-btn delete" onMouseDown={e => { e.preventDefault(); onDelete(n.id) }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <polyline points="3 6 5 6 21 6" stroke="#B24A4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="#B24A4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 11v6M14 11v6" stroke="#B24A4A" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="#B24A4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="swipe-action-label delete">Delete</span>
                </button>
                <div className="swipe-content">
                  <div className="note-row" data-note-id={n.id} onPointerDown={e => onPointerDown(e, n.id)}>
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

      {openNote && (
        <NoteDetailPage
          note={openNote}
          onClose={() => setOpenNoteId(null)}
          onSave={onUpdateNote}
        />
      )}
    </>
  )
}
