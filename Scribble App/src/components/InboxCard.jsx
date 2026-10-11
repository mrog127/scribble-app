import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAppContext } from '../context/AppContext.jsx'
import { getInboxAccent } from '../theme.js'
import { useTheme } from '../useTheme.js'
import { moveWithAnimation } from '../moveFx.js'
import { isRowMenuOpen, useRowMenu, RowActionMenu } from './RowMenu.jsx'
import { FolderMenuIcon, TrashMenuIcon } from './MenuIcons.jsx'
import { ListIcon as FeatherListIcon, FileIcon as FeatherFileIcon, LinkIcon as FeatherLinkIcon } from './FeatherIcons.jsx'
import { InboxIcon } from './DestinationPicker.jsx'
import MoveToCard from './MoveToCard.jsx'
import TodoDetailPage from './TodoDetailPage.jsx'
import { NoteDetailPage } from './NoteCard.jsx'
import LinkDetailPage from './LinkDetailPage.jsx'
import { NoteRowContent } from './ProjectCard.jsx'

// The Inbox card: locked to the top of the Gallery, shown only while the Inbox
// has something in it. List items, notes and links share one list, newest at
// the top, in arrival order (they can't be rearranged). Each row's up arrow
// opens Move to, to file it into a canvas; tapping a row opens its page — a
// reduced one, since it hasn't been filed yet.

// Paintbrush row icons, in the same drawings as the Gallery card's tabs
function PbListIcon({ color }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="5" cy="7" r="1.6" style={{ fill: color }}/>
      <line x1="9" y1="7" x2="21" y2="7" style={{ stroke: color }} strokeWidth="1" strokeLinecap="round"/>
      <circle cx="5" cy="13" r="1.6" style={{ fill: color }}/>
      <line x1="9" y1="13" x2="21" y2="13" style={{ stroke: color }} strokeWidth="1" strokeLinecap="round"/>
      <circle cx="5" cy="19" r="1.6" style={{ fill: color }}/>
      <line x1="9" y1="19" x2="15" y2="19" style={{ stroke: color }} strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}
function PbNoteIcon({ id, accent }) {
  return (
    <svg width="24" height="24" viewBox="0 0 20 22" fill="none">
      <defs>
        <filter id={`ini-${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feOffset dx="4" dy="8"/>
          <feGaussianBlur stdDeviation="4" result="ob"/>
          <feComposite operator="out" in="SourceGraphic" in2="ob" result="inv"/>
          <feFlood floodColor={accent.light} floodOpacity="1" result="col"/>
          <feComposite operator="in" in="col" in2="inv" result="sh"/>
          <feComposite operator="over" in="sh" in2="SourceGraphic"/>
        </filter>
      </defs>
      <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" fill="#F7F6F3" filter={`url(#ini-${id})`}/>
      <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" stroke={accent.dark} strokeWidth="1" fill="none"/>
      <path d="M12 3v5h5" stroke={accent.dark} strokeWidth="1" fill="none"/>
      <line x1="5" y1="13" x2="15" y2="13" stroke={accent.dark} strokeWidth="1" strokeLinecap="round"/>
      <line x1="5" y1="16.5" x2="12" y2="16.5" stroke={accent.dark} strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}
function PbLinkIcon({ color }) {
  const s = { stroke: color }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" style={s} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" style={s} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// The link tiles' Edit icon (a pencil over a square)
function EditPencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="#242424" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#242424" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// Strip the scheme for a cleaner one-line preview
function displayUrl(url) {
  if (!url) return ''
  return url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/$/, '')
}

const DETAIL_TYPE = { list: 'todo', note: 'note', link: 'link' }

export default function InboxCard() {
  const theme = useTheme()
  const dots = ['dark-dots', 'light-dots'].includes(theme)
  // Row icons wear the grey of a row's markers (attachment / date / recurring)
  const iconGray = theme === 'light-dots' ? '#A3A3A3' : '#7A7A7A'
  const {
    categories, inbox, inboxIds, openDetail, setOpenDetail,
    moveProjectTodo, moveProjectNote, moveProjectLink,
    updateProjectNote, toggleProjectNoteActivated,
    deleteProjectTodo, deleteProjectNote, deleteProjectLink, promptDelete,
  } = useAppContext()
  const cardRef = useRef(null)
  const listRef = useRef(null)
  const [moveFor, setMoveFor] = useState(null)   // { type, id, title }
  const accent = getInboxAccent()

  // One list, newest first. An Inbox item's sort order is minus the second it
  // arrived; ties (same second) fall back to the newer row.
  const items = inbox ? [
    ...inbox.todos.map(t => ({ type: 'list', id: t.id, title: t.text, item: t })),
    ...inbox.notes.map(n => ({ type: 'note', id: n.id, title: n.text, item: n })),
    ...inbox.links.map(l => ({ type: 'link', id: l.id, title: l.title || displayUrl(l.url), url: l.url, item: l })),
  ].sort((a, b) =>
    (a.item.sortOrder ?? 0) - (b.item.sortOrder ?? 0) ||
    String(b.item.createdAt || '').localeCompare(String(a.item.createdAt || '')) ||
    (Number(b.id) || 0) - (Number(a.id) || 0)
  ) : []

  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    requestAnimationFrame(() => card.classList.add('visible'))
  }, [items.length > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Leaving: the last item went ----
  // The card shrinks to its header, then fades up and out while its space
  // closes, so everything below slides up. An item arriving mid-way stops it.
  const wrapRef = useRef(null)
  const cardHRef = useRef(0)          // the card's height as last drawn with items
  const [leaving, setLeaving] = useState(false)
  const leaveAnimsRef = useRef([])
  const hasItems = items.length > 0
  // (kept live, so a last row that collapses away first is already counted)
  const hasItemsRef = useRef(hasItems)
  hasItemsRef.current = hasItems
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!hasItems || !card) return
    cardHRef.current = card.getBoundingClientRect().height
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { if (hasItemsRef.current) cardHRef.current = card.getBoundingClientRect().height })
    ro.observe(card)
    return () => ro.disconnect()
  }, [hasItems])
  useLayoutEffect(() => {
    if (hasItems) {
      if (leaving) {
        leaveAnimsRef.current.forEach(a => { try { a.cancel() } catch {} })
        leaveAnimsRef.current = []
        setLeaving(false)
      }
      return
    }
    if (cardHRef.current > 0 && !leaving) setLeaving(true)
  }, [hasItems]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!leaving) return
    const card = cardRef.current, wrap = wrapRef.current
    if (!card || !wrap) { setLeaving(false); return }
    const anims = leaveAnimsRef.current
    const fromH = cardHRef.current
    const toH = card.getBoundingClientRect().height
    let cancelled = false
    const done = () => { if (cancelled) return; cardHRef.current = 0; leaveAnimsRef.current = []; setLeaving(false) }
    const close = () => {
      // fade up and out, its space closing at the same time
      const r = wrap.getBoundingClientRect()
      const mb = parseFloat(getComputedStyle(card).marginBottom) || 0
      anims.push(card.animate(
        [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-12px)' }],
        { duration: 220, easing: 'ease-out', fill: 'forwards' }
      ))
      wrap.style.overflow = 'hidden'
      const shut = wrap.animate(
        [{ height: (r.height + mb) + 'px' }, { height: '0px' }],
        { duration: 280, easing: 'ease', fill: 'forwards' }
      )
      anims.push(card.animate([{ marginBottom: mb + 'px' }, { marginBottom: '0px' }], { duration: 280, easing: 'ease', fill: 'forwards' }))
      anims.push(shut)
      shut.onfinish = done
    }
    if (fromH - toH > 1) {
      // shrink to the header first
      card.style.overflow = 'hidden'
      const shrink = card.animate([{ height: fromH + 'px' }, { height: toH + 'px' }], { duration: 200, easing: 'ease' })
      anims.push(shrink)
      shrink.onfinish = () => { card.style.overflow = ''; if (!cancelled) close() }
    } else close()
    return () => { cancelled = true }
  }, [leaving]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = useCallback((type, id) => {
    setOpenDetail(prev => (prev?.type === DETAIL_TYPE[type] && prev.id === id) ? null : { type: DETAIL_TYPE[type], id })
  }, [setOpenDetail])

  // A clean tap opens the row's page (a drag or scroll doesn't)
  // A tap on the row opens Move to (the pencil button opens the page)
  const onRowPointerDown = useCallback((e, r) => {
    if (e.target.closest('.inbox-move-btn')) return
    const startX = e.clientX, startY = e.clientY
    let moved = false
    const onMove = (e2) => { if (Math.abs(e2.clientX - startX) > 8 || Math.abs(e2.clientY - startY) > 8) moved = true }
    const cleanup = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', cleanup)
    }
    const onUp = () => { if (!moved && !isRowMenuOpen()) setMoveFor({ type: r.type, id: r.id, title: r.title }); cleanup() }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', cleanup)
  }, [])

  // Filed: the row closes up, then the item moves (with the "Moved to …" toast)
  const fileItem = useCallback((target, sel) => {
    if (!inboxIds) return
    const { categoryId: fromCat, projectId: fromProj } = inboxIds
    const commit = () => {
      if (target.type === 'list') moveProjectTodo(fromCat, fromProj, sel.categoryId, sel.projectId, target.id)
      else if (target.type === 'note') moveProjectNote(fromCat, fromProj, sel.categoryId, sel.projectId, target.id)
      else moveProjectLink(fromCat, fromProj, sel.categoryId, sel.projectId, target.id)
    }
    const go = () => moveWithAnimation({
      type: target.type === 'list' ? 'todo' : target.type, id: target.id,
      toCategoryId: sel.categoryId, toProjectId: sel.projectId, title: target.title || '', commit,
    })
    const wrap = listRef.current?.querySelector(`[data-inbox-key="${target.type}-${target.id}"]`)
    if (!wrap) { go(); return }
    wrap.style.transition = 'opacity 180ms ease'
    wrap.style.opacity = '0'
    setTimeout(() => {
      wrap.style.height = wrap.getBoundingClientRect().height + 'px'
      wrap.style.overflow = 'hidden'
      requestAnimationFrame(() => requestAnimationFrame(() => {
        wrap.style.transition = 'height 220ms ease'
        wrap.style.height = '0px'
      }))
      setTimeout(go, 240)
    }, 180)
  }, [inboxIds, moveProjectTodo, moveProjectNote, moveProjectLink])

  // Long-press / right-click on a row: Move it, or Delete it
  const rowMenu = useRowMenu()
  const NOUN = { list: 'List Item', note: 'Note', link: 'Link' }
  const deleteItem = useCallback((target) => {
    if (!inboxIds) return
    const { categoryId: c, projectId: pj } = inboxIds
    promptDelete(() => {
      const del = () => {
        if (target.type === 'list') deleteProjectTodo(c, pj, target.id)
        else if (target.type === 'note') deleteProjectNote(c, pj, target.id)
        else deleteProjectLink(c, pj, target.id)
      }
      const wrap = listRef.current?.querySelector(`[data-inbox-key="${target.type}-${target.id}"]`)
      if (!wrap) { del(); return }
      wrap.animate([{ background: 'rgba(178,74,74,0)' }, { background: 'rgba(178,74,74,0.20)', offset: 0.4 }, { background: 'rgba(178,74,74,0)' }], { duration: 280, fill: 'none' })
      setTimeout(() => {
        wrap.style.height = wrap.getBoundingClientRect().height + 'px'
        wrap.style.overflow = 'hidden'
        requestAnimationFrame(() => requestAnimationFrame(() => {
          wrap.style.transition = 'height 220ms ease, opacity 180ms ease'
          wrap.style.height = '0'
          wrap.style.opacity = '0'
        }))
        setTimeout(del, 250)
      }, 180)
    })
  }, [inboxIds, promptDelete, deleteProjectTodo, deleteProjectNote, deleteProjectLink])
  const buildRowItems = (r) => () => ([
    { label: `Move ${NOUN[r.type]}`, icon: <FolderMenuIcon/>, onSelect: () => setMoveFor({ type: r.type, id: r.id, title: r.title }) },
    { label: `Delete ${NOUN[r.type]}`, icon: <TrashMenuIcon/>, danger: true, onSelect: () => deleteItem({ type: r.type, id: r.id }) },
  ])

  // The open page, if it's one of the Inbox's
  const openType = openDetail?.type
  const openId = openDetail?.id
  const openTodo = inbox && openType === 'todo' ? inbox.todos.find(t => t.id === openId) : null
  const openNote = inbox && openType === 'note' ? inbox.notes.find(n => n.id === openId) : null
  const openLink = inbox && openType === 'link' ? inbox.links.find(l => l.id === openId) : null

  if (!inbox || !inboxIds || (items.length === 0 && !leaving)) return null
  const { categoryId, projectId } = inboxIds

  const rowIcon = (r) => {
    if (dots) {
      const F = r.type === 'list' ? FeatherListIcon : r.type === 'note' ? FeatherFileIcon : FeatherLinkIcon
      return <F size={20} strokeWidth={2} color={iconGray}/>
    }
    if (r.type === 'note') return <PbNoteIcon id={r.id} accent={{ ...accent, dark: iconGray }}/>
    if (r.type === 'link') return <PbLinkIcon color={iconGray}/>
    return <PbListIcon color={iconGray}/>
  }

  const isOpen = (r) => openDetail && openType === DETAIL_TYPE[r.type] && openId === r.id

  return (
    <div
      ref={wrapRef}
      className="inbox-card-wrap"
      data-project-id={projectId}
      style={{
        '--accent-base': accent.base,
        '--accent-dark': accent.dark,
        '--accent-light': accent.light,
        '--accent-base-rgb': accent.baseRgb,
      }}
    >
      <div className="card inbox-card card-intro" ref={cardRef}>
        {/* Paintbrush: the Gallery card's orbiting stroke and glow, uncoloured */}
        <span className="inbox-card-stroke" aria-hidden="true"/>
        <span className="inbox-card-glow" aria-hidden="true"/>

        <div className="card-header">
          <div className="card-title-wrap">
            <div className="card-title-row">
              <InboxIcon className="inbox-title-icon" size={18} color="currentColor"/>
              <span className="card-title">Inbox</span>
            </div>
          </div>
        </div>

        <div className="inbox-items" ref={listRef}>
          {items.map((r, i) => {
            const key = `${r.type}-${r.id}`
            const rowClass = r.type === 'list' ? 'todo-row' : 'note-row'
            return (
              <div key={key} data-inbox-key={key}>
                {i > 0 && <div className="divider"/>}
                <div className={`swipe-row inbox-row${isOpen(r) ? ' row-open' : ''}`} data-swipe-id={r.id}>
                  <div className="swipe-content">
                    <div
                      className={`${rowClass} inbox-item-row inbox-${r.type}-row`}
                      onPointerDown={e => {
                        if (e.target.closest('.inbox-move-btn')) return
                        rowMenu.press(e, buildRowItems(r))
                        onRowPointerDown(e, r)
                      }}
                      onContextMenu={e => rowMenu.context(e, buildRowItems(r))}
                    >
                      <div className="checkbox-wrap" style={{ pointerEvents: 'none' }}>
                        {rowIcon(r)}
                      </div>
                      {/* Sublabels as on a canvas's rows: a note's preview line,
                          a link's address */}
                      {r.type === 'list' ? (
                        <div className="item-content">
                          <span className="item-text">{r.title}</span>
                        </div>
                      ) : r.type === 'note' ? (
                        <NoteRowContent note={r.item}/>
                      ) : (
                        <div className="item-content inbox-link-content">
                          <span className="note-text">{r.title}</span>
                          {!!r.url && <span className="note-preview-text">{displayUrl(r.url)}</span>}
                        </div>
                      )}
                      <button
                        type="button"
                        className="inbox-move-btn"
                        aria-label="Edit"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); open(r.type, r.id) }}
                      >
                        <EditPencilIcon/>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <RowActionMenu state={rowMenu.state} onClose={rowMenu.close} />

      {moveFor && (
        <MoveToCard
          categories={categories}
          currentCategoryId={categoryId}
          currentProjectId={projectId}
          onCancel={() => setMoveFor(null)}
          onSave={(sel) => {
            const target = moveFor
            setMoveFor(null)
            if (sel.projectId === projectId) return
            fileItem(target, sel)
          }}
        />
      )}

      {openTodo && createPortal(
        <TodoDetailPage
          todo={openTodo}
          categoryId={categoryId}
          projectId={projectId}
          projectNotes={[]}
          projectLinks={[]}
          onClose={() => setOpenDetail(null)}
        />,
        document.getElementById('app')
      )}

      {openNote && createPortal(
        <NoteDetailPage
          note={{ ...openNote, categoryId, projectId, projectName: 'Inbox' }}
          onClose={() => setOpenDetail(null)}
          onSave={(noteId, html, text) => updateProjectNote(categoryId, projectId, noteId, html, text)}
          activated={!!openNote.activated}
          onToggleActive={() => toggleProjectNoteActivated(categoryId, projectId, openNote.id)}
          projectName="Inbox"
          categoryId={categoryId}
          projectId={projectId}
        />,
        document.getElementById('app')
      )}

      {openLink && createPortal(
        <LinkDetailPage
          link={openLink}
          categoryId={categoryId}
          projectId={projectId}
          onClose={() => setOpenDetail(null)}
        />,
        document.getElementById('app')
      )}
    </div>
  )
}
