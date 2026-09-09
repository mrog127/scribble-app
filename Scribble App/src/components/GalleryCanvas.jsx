import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react'
import {
  CollapsedTodosCard,
  CollapsedNotesCard,
  CollapsedLinksCard,
} from './CategoryCollapsedView.jsx'
import { CARD_DRAG_EVENT } from './useCardDragReorder.js'

// The Gallery canvas: a pinned, read-only-chrome canvas at the top of an Easel
// that isn't sending its active items to the home screen. It shows only that
// Easel's active items, in the same aggregate cards the collapsed Easel view
// uses, but hosted inside one card with the usual content-type tabs.
//
// It has no add button, no three-dot menu, can't be renamed and can't be
// dragged (its wrapper carries no data-project-id, so the page's card-reorder
// delegation never picks it up). It can still collapse and expand.

// Museum glyph — the same drawing the Gallery tab and row menu use.
function GalleryTitleIcon() {
  const p = { stroke: 'currentColor', strokeWidth: 1, vectorEffect: 'non-scaling-stroke', strokeLinecap: 'round' }
  return (
    <svg className="gallery-title-icon" width="18" height="18" viewBox="0 0 20 20" fill="none">
      <polyline points="3,6.8 10,2.6 17,6.8" {...p} strokeLinejoin="round"/>
      <line x1="5" y1="7.6" x2="5" y2="14" {...p}/>
      <line x1="8.33" y1="7.6" x2="8.33" y2="14" {...p}/>
      <line x1="11.67" y1="7.6" x2="11.67" y2="14" {...p}/>
      <line x1="15" y1="7.6" x2="15" y2="14" {...p}/>
      <line x1="3.5" y1="14" x2="16.5" y2="14" {...p}/>
      <line x1="3" y1="17" x2="17" y2="17" {...p}/>
    </svg>
  )
}

function ListIcon({ size = 24, color }) {
  const c = color || '#595959'
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

function NoteIcon({ size = 24, color }) {
  const s = { stroke: color || '#595959' }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 4h10l6 6v12a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" style={s} strokeWidth="1" strokeLinejoin="round" fill="none"/>
      <path d="M14 4v6h6" style={s} strokeWidth="1" strokeLinejoin="round"/>
      <line x1="6" y1="15" x2="18" y2="15" style={s} strokeWidth="1" strokeLinecap="round"/>
      <line x1="6" y1="18.5" x2="14" y2="18.5" style={s} strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

function LinkIcon({ size = 24, color }) {
  const s = { stroke: color || '#595959' }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" style={s} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" style={s} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function GalleryCanvas({ category }) {
  const [activeTab, setActiveTab] = useState('list')
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(`collapsed-gallery-${category.id}`) === 'true' } catch { return false }
  })

  const cardRef = useRef(null)
  const itemsRef = useRef(null)
  const itemsHeightRef = useRef(null)
  const tabBarRef = useRef(null)
  const tabIndicatorRef = useRef(null)
  const tabMountedRef = useRef(false)
  const collapseMountedRef = useRef(false)
  const collapsedRef = useRef(collapsed)
  collapsedRef.current = collapsed
  const suppressHeaderToggleRef = useRef(false)
  const defaultTabRef = useRef(false)

  const liveProjects = category.projects.filter(p => !p.archived)
  const activeTodos = liveProjects.flatMap(p => p.todos.filter(t => t.activated))
  const activeNotes = liveProjects.flatMap(p => p.notes.filter(n => n.activated && !n.archived))
  const activeLinks = liveProjects.flatMap(p => p.links.filter(l => l.activated && !l.archived))

  // True for as long as a canvas card is being dragged anywhere on the page —
  // same signal a regular canvas uses to reveal its type icons.
  const [cardsDragging, setCardsDragging] = useState(false)
  useEffect(() => {
    const onDrag = (e) => setCardsDragging(!!e.detail?.active)
    window.addEventListener(CARD_DRAG_EVENT, onDrag)
    return () => window.removeEventListener(CARD_DRAG_EVENT, onDrag)
  }, [])

  const typesWithItems = ['list', 'note', 'link'].filter(t =>
    (t === 'list' && activeTodos.length > 0) ||
    (t === 'note' && activeNotes.length > 0) ||
    (t === 'link' && activeLinks.length > 0)
  )
  // Same rule as a regular canvas: tabs appear when there's more than one
  // content type, and a single-type canvas shows its one icon only while
  // collapsed or while cards are being rearranged.
  const showTabs = typesWithItems.length > 1 ||
    ((collapsed || cardsDragging) && typesWithItems.length === 1)
  const displayType = typesWithItems.length > 1 ? activeTab : (typesWithItems[0] || 'list')
  const selectedTab = collapsed ? null : displayType

  // Badges count outstanding work only — completed items drop out.
  const tabCount = (t) => {
    if (t === 'list') return activeTodos.filter(x => !x.checked).length
    if (t === 'note') return activeNotes.length
    return activeLinks.length
  }

  // ---- Default tab: first type with items ----
  useLayoutEffect(() => {
    if (defaultTabRef.current || typesWithItems.length === 0) return
    defaultTabRef.current = true
    setActiveTab(typesWithItems[0])
  })

  // ---- Keep the tab valid as items come and go ----
  useEffect(() => {
    if (typesWithItems.length > 0 && !typesWithItems.includes(activeTab)) {
      setActiveTab(typesWithItems[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typesWithItems.join(',')])

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
      requestAnimationFrame(() => { ind.style.transition = ''; tabMountedRef.current = true })
    }
  }, [selectedTab, showTabs, collapsed, cardsDragging, typesWithItems.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Signature of what the body is currently showing. Checking an item off (or
  // deactivating one) drops a row, and the height effect below has to animate to
  // the new size rather than leave the card at its old one.
  const contentKey = [
    activeTodos.map(t => t.id + (t.checked ? 'c' : '')).join(','),
    activeNotes.map(n => n.id).join(','),
    activeLinks.map(l => l.id).join(','),
  ].join('|')

  // ---- Animate the items area height when switching tabs or losing rows ----
  useLayoutEffect(() => {
    const el = itemsRef.current
    if (!el) return
    if (collapsedRef.current) return
    // Animate from what the body is ACTUALLY painted at right now, not from a
    // cached value — a second content change landing mid-animation would
    // otherwise start from the previous target and jump.
    const curH = el.getBoundingClientRect().height
    // scrollHeight never reports less than the box's own height, so an inline
    // height left over from an earlier animation would measure as the NEW
    // height and the card would sit at its old size forever. Clear the inline
    // sizing (transitions off, so nothing animates from the reset) and measure
    // the natural content height first.
    el.style.transition = 'none'
    el.style.height = ''
    el.style.overflow = ''
    const newH = el.scrollHeight
    itemsHeightRef.current = newH
    if (Math.abs(curH - newH) < 1) { el.style.transition = ''; return }
    el.style.height = curH + 'px'
    el.style.overflow = 'hidden'
    el.offsetHeight // force reflow
    el.style.transition = 'height 250ms ease'
    el.style.height = newH + 'px'
    const done = (e) => {
      if (e && e.propertyName !== 'height') return
      el.style.height = ''
      el.style.overflow = ''
      el.style.transition = ''
      itemsHeightRef.current = el.scrollHeight
      el.removeEventListener('transitionend', done)
    }
    el.addEventListener('transitionend', done)
    return () => el.removeEventListener('transitionend', done)
  }, [displayType, contentKey])

  // ---- Collapse / expand the body when the header is tapped ----
  useLayoutEffect(() => {
    const el = itemsRef.current
    if (!el) return
    if (!collapseMountedRef.current) {
      collapseMountedRef.current = true
      if (collapsed) { el.style.height = '0px'; el.style.overflow = 'hidden' }
      return
    }
    const full = el.scrollHeight
    el.style.overflow = 'hidden'
    el.style.height = (collapsed ? full : 0) + 'px'
    el.offsetHeight
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

  const applyCollapsed = useCallback((next) => {
    setCollapsed(next)
    try { localStorage.setItem(`collapsed-gallery-${category.id}`, next ? 'true' : 'false') } catch {}
  }, [category.id])

  const handleHeaderClick = useCallback((e) => {
    if (suppressHeaderToggleRef.current) { suppressHeaderToggleRef.current = false; return }
    if (e.target.closest('button, .project-tab-bar')) return
    applyCollapsed(!collapsedRef.current)
  }, [applyCollapsed])

  const switchTab = useCallback((type) => {
    setActiveTab(type)
    if (collapsedRef.current) {
      itemsHeightRef.current = null
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

  // Nothing active in this Easel — no Gallery canvas at all. (After the hooks,
  // so the hook order stays stable across renders.)
  if (typesWithItems.length === 0) return null

  const tabButton = (type, Icon) => (
    <button
      className={`project-tab-btn${selectedTab === type ? ' selected' : ''}${tabCount(type) === 0 ? ' all-hidden' : ''}`}
      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); switchTab(type) }}
    >
      <Icon size={20} color={selectedTab === type ? 'var(--accent-dark)' : '#242424'}/>
      {tabCount(type) > 0 && <span className="project-tab-count">{tabCount(type)}</span>}
    </button>
  )

  return (
    <div className="card project-card gallery-canvas card-intro" ref={cardRef}>
      <span className="gallery-canvas-stroke" aria-hidden="true"/>
      <span className="gallery-canvas-glow" aria-hidden="true"/>

      <div className={`card-header${collapsed ? ' collapsed' : ''}`} onClick={handleHeaderClick}>
        <div className="card-title-wrap">
          <div className="card-title-row">
            <GalleryTitleIcon/>
            <span className="card-title">Gallery</span>
          </div>
        </div>
        {showTabs && (
          <div className="project-tab-bar" ref={tabBarRef}>
            <div className="project-tab-indicator" ref={tabIndicatorRef}/>
            {typesWithItems.includes('list') && tabButton('list', ListIcon)}
            {typesWithItems.includes('note') && tabButton('note', NoteIcon)}
            {typesWithItems.includes('link') && tabButton('link', LinkIcon)}
          </div>
        )}
      </div>

      <div className="project-items" ref={itemsRef}>
        {displayType === 'list' && activeTodos.length > 0 && (
          <CollapsedTodosCard category={category} bare onlyActivated />
        )}
        {displayType === 'note' && activeNotes.length > 0 && (
          <CollapsedNotesCard category={category} bare onlyActivated />
        )}
        {displayType === 'link' && activeLinks.length > 0 && (
          <CollapsedLinksCard category={category} bare onlyActivated />
        )}
      </div>
    </div>
  )
}
