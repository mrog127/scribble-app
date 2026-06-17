import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import UnderlineSvg from '../assets/Underline.svg?react'
import { useAppContext } from '../context/AppContext.jsx'
import { getCategoryAccent } from '../theme.js'
import { NoteDetailPage } from './NoteCard.jsx'
import DetailFooter from './DetailFooter.jsx'
import MoveToCard from './MoveToCard.jsx'

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

function CheckIcon() {
  return (
    <svg className="mc-check" width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 12.5L9.5 18L20 6.5" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ActivateIcon({ activated }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <polygon
        points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
        stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
        style={{ fill: activated ? 'rgba(var(--accent-base-rgb),0.3)' : 'none' }}
      />
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

function LinkRowIcon({ activated }) {
  const stroke = activated ? 'var(--accent-dark)' : '#7A7A7A'
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      {activated && <circle cx="12" cy="12" r="8" fill="var(--accent-light)"/>}
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke={stroke} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke={stroke} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ---- Inline composer (matches the project-card footer input) ----
function NoteComposer({ onAdd }) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(false)
  const inputRef = useRef(null)

  const submit = () => {
    const text = value.trim()
    if (!text) return
    onAdd(text, active)
    setValue('')
    inputRef.current?.blur()
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
          onBlur={() => requestAnimationFrame(() => setFocused(false))}
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
              <span>{active ? 'Active' : 'Inactive'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LinkComposer({ onAdd }) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(false)
  const titleRef = useRef(null)
  const urlRef = useRef(null)
  const wrapRef = useRef(null)

  const submit = () => {
    const u = url.trim()
    if (!u) return
    onAdd(title.trim(), u, active)
    setTitle('')
    setUrl('')
    titleRef.current?.blur()
    urlRef.current?.blur()
  }

  const onBlur = () => requestAnimationFrame(() => {
    const ae = document.activeElement
    if (ae && wrapRef.current && wrapRef.current.contains(ae)) return
    setFocused(false)
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
              <span>{active ? 'Active' : 'Inactive'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function UnattachButton({ onUnattach }) {
  return (
    <button className="todo-unattach-btn" onMouseDown={e => { e.preventDefault(); onUnattach(e.currentTarget) }}>
      <div className="todo-unattach-inner">
        <PaperclipIcon/>
        <span className="todo-unattach-label">Unattach</span>
      </div>
    </button>
  )
}

function AttachedNoteRow({ note, onOpen, onUnattach, onPointerDown }) {
  const preview = useMemo(() => extractNotePreview(note.editorHTML), [note.editorHTML])
  return (
    <div className="todo-swipe-row">
      <UnattachButton onUnattach={onUnattach} />
      <div className="todo-swipe-content" onPointerDown={e => onPointerDown(e, onOpen)}>
        <div className="todo-attached-row">
          <div className="todo-attached-icon"><NoteRowIcon activated={note.activated}/></div>
          <div className="todo-attached-text">
            <span className="todo-attached-note-title">{note.text}</span>
            {preview && <span className="todo-attached-note-preview">{preview}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function AttachedLinkRow({ link, onUnattach, onPointerDown }) {
  return (
    <div className="todo-swipe-row">
      <UnattachButton onUnattach={onUnattach} />
      <div className="todo-swipe-content" onPointerDown={e => onPointerDown(e, () => openUrl(link.url))}>
        <div className="todo-attached-row">
          <div className="todo-attached-icon"><LinkRowIcon activated={link.activated}/></div>
          <div className="todo-attached-text">
            <span className="todo-attached-link-title">{link.title}</span>
            <span className="todo-attached-link-url">{displayUrl(link.url)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TodoDetailPage({ todo, categoryId, projectId, projectNotes, projectLinks, onClose }) {
  const {
    categories,
    toggleProjectTodo,
    toggleProjectTodoActivated,
    toggleProjectNoteActivated,
    setProjectTodoScheduled,
    setProjectNoteScheduled,
    updateProjectTodoText,
    attachNoteToTodo, detachNoteFromTodo,
    attachLinkToTodo, detachLinkFromTodo,
    addTodoNote, addTodoLink,
    moveProjectTodo,
    updateProjectNote,
  } = useAppContext()

  const projectName = useMemo(
    () => categories.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)?.name || '',
    [categories, categoryId, projectId]
  )

  const [isOpen, setIsOpen] = useState(false)
  const [noteAttachOpen, setNoteAttachOpen] = useState(false)
  const [linkAttachOpen, setLinkAttachOpen] = useState(false)
  const [openNoteId, setOpenNoteId] = useState(null)
  const titleRef = useRef(null)
  const completeBtnRef = useRef(null)
  const flashRef = useRef(null)
  const completePressed = useRef(false)
  const scrollRef = useRef(null)
  const scrollTitleRef = useRef(null)
  const pageRef = useRef(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveTop, setMoveTop] = useState(null)
  const [editingTitle, setEditingTitle] = useState(false)

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
    moveProjectTodo(categoryId, projectId, sel.categoryId, sel.projectId, todo.id)
    setMoveOpen(false)
  }, [categoryId, projectId, todo.id, moveProjectTodo])

  // Press down: shrink (subtly) and hold while pressed, drop the shadow
  const completeDown = useCallback(() => {
    const el = completeBtnRef.current
    if (!el) return
    completePressed.current = true
    el.style.boxShadow = 'none'
    el.getAnimations().forEach(a => a.cancel())
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.91)' }], { duration: 100, fill: 'forwards' })
  }, [])

  // Release: spring big -> settle back, toggle, and flash the page on check
  const completeUp = useCallback(() => {
    if (!completePressed.current) return
    completePressed.current = false
    const el = completeBtnRef.current
    if (el) {
      el.style.boxShadow = ''
      el.getAnimations().forEach(a => a.cancel())
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
    toggleProjectTodo(categoryId, projectId, todo.id)
  }, [todo.checked, todo.id, categoryId, projectId, toggleProjectTodo])

  // Pointer left the button before release: restore size, don't toggle
  const completeCancel = useCallback(() => {
    if (!completePressed.current) return
    completePressed.current = false
    const el = completeBtnRef.current
    if (el) {
      el.style.boxShadow = ''
      el.getAnimations().forEach(a => a.cancel())
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
  const attachableNotes = projectNotes.filter(n => !linkedNoteIds.includes(String(n.id)))
  const attachableLinks = projectLinks.filter(l => !linkedLinkIds.includes(String(l.id)))

  const saveTitle = useCallback(() => {
    const text = (titleRef.current?.textContent || '').trim()
    if (text && text !== todo.text) updateProjectTodoText(categoryId, projectId, todo.id, text)
    else if (!text && titleRef.current) titleRef.current.textContent = todo.text
  }, [categoryId, projectId, todo.id, todo.text, updateProjectTodoText])

  const handleDone = () => {
    saveTitle()
    setIsOpen(false)
    setTimeout(onClose, 360)
  }

  // Top-right button: "Save" while editing the title (commits + exits edit), "Done" otherwise (closes).
  // Editing state is only cleared here (not on blur) so a touch that blurs the title first can't trip "Done".
  const handleTopButton = (e) => {
    e.preventDefault()
    if (editingTitle) {
      titleRef.current?.blur()
      saveTitle()
      setEditingTitle(false)
    } else {
      handleDone()
    }
  }

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); titleRef.current?.blur() }
  }

  // Flash highlight + collapse, then detach — mirrors the homescreen "deactivate" animation
  const handleUnattach = useCallback((btnEl, doDetach) => {
    const row = btnEl?.closest('.todo-swipe-row')
    if (!row) { doDetach(); return }
    row.classList.remove('swiped-left')
    const content = row.querySelector('.todo-swipe-content')
    if (content) { content.style.transition = ''; content.style.transform = '' }
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

  // Swipe-left to reveal the Unattach button (and tap to open when closed)
  const onRowPointerDown = useCallback((e, onTap) => {
    if (e.target.closest('.todo-unattach-btn')) return
    const row = e.currentTarget.closest('.todo-swipe-row')
    if (!row) return
    const content = row.querySelector('.todo-swipe-content')
    const wasLeft = row.classList.contains('swiped-left')
    const s = { startX: e.clientX, startY: e.clientY, dir: null, lastX: wasLeft ? -84 : 0 }

    // Snap to open/closed based on current offset, clear inline transform so CSS takes over
    const settle = () => {
      if (content) { content.style.transition = ''; content.style.transform = '' }
      if (s.lastX < -36) {
        // Only one row open at a time — close any other open row first
        document.querySelectorAll('.todo-swipe-row.swiped-left').forEach(r => {
          if (r === row) return
          r.classList.remove('swiped-left')
          const c = r.querySelector('.todo-swipe-content')
          if (c) { c.style.transition = ''; c.style.transform = '' }
        })
        row.classList.add('swiped-left')
      } else {
        row.classList.remove('swiped-left')
      }
      cleanup()
    }

    const onMove = (e2) => {
      const dx = e2.clientX - s.startX, dy = e2.clientY - s.startY
      if (!s.dir) {
        if (Math.abs(dy) > 8) { settle(); return }
        if (Math.abs(dx) > 10) s.dir = dx < 0 ? 'left' : 'right'
        else return
      }
      if (!content) return
      const base = wasLeft ? -84 : 0
      const newX = Math.max(-84, Math.min(0, base + dx))
      s.lastX = newX
      content.style.transition = 'none'
      content.style.transform = `translateX(${newX}px)`
    }

    const onUp = (e2) => {
      const dx = e2.clientX - s.startX, dy = e2.clientY - s.startY
      const isTap = !s.dir && Math.abs(dx) < 8 && Math.abs(dy) < 8
      if (isTap) {
        if (content) content.style.transition = ''
        if (wasLeft) { row.classList.remove('swiped-left'); if (content) content.style.transform = '' }
        else onTap()
        cleanup(); return
      }
      settle()
    }

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', settle)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', settle)
  }, [])

  // Two-finger (trackpad) horizontal swipe over an attached row reveals its Unattach button.
  // Wheel events have no clean "end", so we debounce a settle after the gesture stops.
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const states = new Map()

    const onWheel = (e) => {
      // Only act on predominantly-horizontal gestures (a two-finger sideways swipe)
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      const content = e.target.closest && e.target.closest('.todo-swipe-content')
      if (!content || !scroll.contains(content)) return
      const row = content.closest('.todo-swipe-row')
      if (!row) return
      e.preventDefault()

      let s = states.get(row)
      if (!s) {
        s = { x: row.classList.contains('swiped-left') ? -84 : 0, timer: null }
        states.set(row, s)
      }
      s.x = Math.max(-84, Math.min(0, s.x - e.deltaX))
      content.style.transition = 'none'
      content.style.transform = `translateX(${s.x}px)`
      // Reveal the button live, tracking the swipe — don't wait for the settle class
      const btn = row.querySelector('.todo-unattach-btn')
      if (btn) {
        btn.style.transition = 'none'
        btn.style.opacity = String(Math.min(1, -s.x / 84))
      }

      clearTimeout(s.timer)
      s.timer = setTimeout(() => {
        content.style.transition = ''
        content.style.transform = ''
        if (btn) { btn.style.transition = ''; btn.style.opacity = '' }
        if (s.x < -36) {
          // Only one row open at a time — close any other open row first
          document.querySelectorAll('.todo-swipe-row.swiped-left').forEach(r => {
            if (r === row) return
            r.classList.remove('swiped-left')
            const c = r.querySelector('.todo-swipe-content')
            if (c) { c.style.transition = ''; c.style.transform = '' }
          })
          row.classList.add('swiped-left')
        } else {
          row.classList.remove('swiped-left')
        }
        states.delete(row)
      }, 90)
    }

    scroll.addEventListener('wheel', onWheel, { passive: false })
    return () => scroll.removeEventListener('wheel', onWheel)
  }, [])

  const openNote = attachedNotes.find(n => n.id === openNoteId)

  return (
    <div
      ref={pageRef}
      className={`note-detail-page${isOpen ? ' open' : ''}`}
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
        <span className="note-scroll-title" ref={scrollTitleRef} />
        <button className="note-detail-done" onMouseDown={handleTopButton}>{editingTitle ? 'Save' : 'Done'}</button>
      </div>

      <div className="todo-detail-scroll" ref={scrollRef}>
        <div className="todo-detail-underline">
          <UnderlineSvg style={{ display: 'block', color: 'var(--accent-base)' }} />
        </div>

        <div
          ref={titleRef}
          className="todo-detail-title"
          contentEditable
          suppressContentEditableWarning
          autoCapitalize="sentences"
          onFocus={() => setEditingTitle(true)}
          onKeyDown={handleTitleKeyDown}
          onBlur={saveTitle}
        />

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

        {/* ---- Notes ---- */}
        <div className="todo-section">
          <div className="todo-section-header">
            <span className="todo-section-title">Notes</span>
            {attachableNotes.length > 0 && (
              <button className="todo-attach-btn" onMouseDown={e => { e.preventDefault(); setLinkAttachOpen(false); setNoteAttachOpen(v => !v) }}>
                <PaperclipIcon/><span>Attach</span>
              </button>
            )}
          </div>

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
                    onMouseDown={e => { e.preventDefault(); attachNoteToTodo(categoryId, projectId, todo.id, n.id); setNoteAttachOpen(false) }}
                  >
                    <span className="note-text">{n.text}</span>
                    {preview && <span className="note-preview-text">{preview}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {attachedNotes.map(n => (
            <AttachedNoteRow
              key={n.id}
              note={n}
              onOpen={() => setOpenNoteId(n.id)}
              onUnattach={(btnEl) => handleUnattach(btnEl, () => detachNoteFromTodo(categoryId, projectId, todo.id, n.id))}
              onPointerDown={onRowPointerDown}
            />
          ))}

          <div className="todo-composer">
            <NoteComposer onAdd={(text, active) => addTodoNote(categoryId, projectId, todo.id, text, active)} />
          </div>
        </div>

        {/* ---- Links ---- */}
        <div className="todo-section">
          <div className="todo-section-header">
            <span className="todo-section-title">Links</span>
            {attachableLinks.length > 0 && (
              <button className="todo-attach-btn" onMouseDown={e => { e.preventDefault(); setNoteAttachOpen(false); setLinkAttachOpen(v => !v) }}>
                <PaperclipIcon/><span>Attach</span>
              </button>
            )}
          </div>

          <div className="todo-attach-anchor">
            <div className={`todo-attach-panel${linkAttachOpen ? ' open' : ''}`}>
              {attachableLinks.length === 0 ? (
                <div className="todo-attach-empty">No other links in this project</div>
              ) : attachableLinks.map(l => (
                <button
                  key={l.id}
                  className="todo-attach-item"
                  onMouseDown={e => { e.preventDefault(); attachLinkToTodo(categoryId, projectId, todo.id, l.id); setLinkAttachOpen(false) }}
                >
                  <span className="note-text">{l.title}</span>
                  <span className="note-preview-text">{displayUrl(l.url)}</span>
                </button>
              ))}
            </div>
          </div>

          {attachedLinks.map(l => (
            <AttachedLinkRow
              key={l.id}
              link={l}
              onUnattach={(btnEl) => handleUnattach(btnEl, () => detachLinkFromTodo(categoryId, projectId, todo.id, l.id))}
              onPointerDown={onRowPointerDown}
            />
          ))}

          <div className="todo-composer">
            <LinkComposer onAdd={(title, url, active) => addTodoLink(categoryId, projectId, todo.id, title, url, active)} />
          </div>
        </div>
      </div>

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
        activated={!!todo.activated}
        scheduledDate={todo.scheduledDate}
        onToggleActive={() => toggleProjectTodoActivated(categoryId, projectId, todo.id)}
        onSchedule={(date) => setProjectTodoScheduled(categoryId, projectId, todo.id, date)}
        onClearSchedule={() => setProjectTodoScheduled(categoryId, projectId, todo.id, null)}
        accent={accent}
        projectName={projectName}
        onProjectClick={openMove}
        menuOpen={moveOpen}
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
        />,
        document.getElementById('app')
      )}
    </div>
  )
}
