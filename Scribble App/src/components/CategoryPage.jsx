import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { useAppContext } from '../context/AppContext.jsx'
import ProjectCard from './ProjectCard.jsx'
import CategoryCollapsedView from './CategoryCollapsedView.jsx'
import UnderlineSvg from '../assets/Underline.svg?react'

// Diagonal two-arrow toggle: arrows point inward (Expanded → collapse) or
// outward to the corners (Collapsed → expand). The two glyphs crossfade.
function CollapseToggleIcon({ collapsed }) {
  const common = { stroke: '#242424', strokeWidth: 1, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }
  const layer = (show) => ({
    position: 'absolute', inset: 0,
    opacity: show ? 1 : 0,
    transform: show ? 'scale(1)' : 'scale(0.7)',
    transition: 'opacity 220ms ease, transform 240ms cubic-bezier(0.4,0,0.2,1)',
  })
  return (
    <span style={{ position: 'relative', width: 20, height: 20, display: 'block' }}>
      {/* Collapse (inward) — shown in the Expanded state */}
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" style={layer(!collapsed)}>
        <polyline points="18 9.5 12.5 9.5 12.5 4" {...common}/>
        <path d="M12.5 9.5 L20.5 1.5" {...common}/>
        <polyline points="4 12.5 9.5 12.5 9.5 18" {...common}/>
        <path d="M9.5 12.5 L1.5 20.5" {...common}/>
      </svg>
      {/* Expand (outward) — shown in the Collapsed state */}
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" style={layer(collapsed)}>
        <polyline points="13.5 1.5 20.5 1.5 20.5 8.5" {...common}/>
        <path d="M20.5 1.5 L12 10" {...common}/>
        <polyline points="8.5 20.5 1.5 20.5 1.5 13.5" {...common}/>
        <path d="M1.5 20.5 L10 12" {...common}/>
      </svg>
    </span>
  )
}

function AddIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
      <rect x="1.5" y="1.5" width="19" height="19" rx="4.5" style={{ stroke: '#242424' }} strokeWidth="1"/>
      <path d="M11 6v10M6 11h10" style={{ stroke: '#242424' }} strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 10.5 L8.5 15 L16 5.5" style={{ stroke: 'var(--accent-dark)' }} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
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

// ---- Card drag-to-reorder hook ----
function useCardDragReorder(containerRef, projects, onReorder) {
  const dragRef = useRef(null)
  const flipRef = useRef(null)
  const needsExpandAll = useRef(false)
  const projectsRef = useRef(projects)
  projectsRef.current = projects

  // Expand all cards back to their natural height
  const expandAllCards = useCallback((container) => {
    const wrappers = [...container.querySelectorAll('[data-project-id]')]
    wrappers.forEach(wrapper => {
      const cardEl = wrapper.querySelector(':scope > .card')
      if (!cardEl) return
      cardEl.style.overflow = 'hidden'
      const fullH = cardEl.scrollHeight
      cardEl.style.transition = 'max-height 300ms ease, opacity 200ms ease'
      cardEl.style.maxHeight = fullH + 'px'
      cardEl.style.opacity = '1'
      setTimeout(() => {
        cardEl.style.overflow = ''
        cardEl.style.maxHeight = ''
        cardEl.style.transition = ''
        cardEl.style.opacity = ''
      }, 300)
    })
  }, [])

  // FLIP animation after state reorder, then expand all
  useLayoutEffect(() => {
    const flip = flipRef.current
    if (!flip) return
    flipRef.current = null
    const container = containerRef.current
    if (!container) return

    // Ensure all transforms are clear so we can read new positions cleanly
    flip.forEach(({ el }) => { el.style.transition = 'none'; el.style.transform = '' })
    document.body.offsetHeight

    const frames = flip
      .map(({ el, fromTop }) => ({ el, dy: fromTop - el.getBoundingClientRect().top }))
      .filter(f => Math.abs(f.dy) > 1)

    if (frames.length) {
      frames.forEach(({ el, dy }) => {
        el.style.transition = 'none'
        el.style.transform = `translateY(${dy}px)`
      })
      document.body.offsetHeight
      requestAnimationFrame(() => {
        frames.forEach(({ el }) => {
          el.style.transition = 'transform 260ms ease'
          el.style.transform = ''
        })
        setTimeout(() => {
          frames.forEach(({ el }) => { el.style.transition = '' })
          // Expand after FLIP settles
          if (needsExpandAll.current) {
            needsExpandAll.current = false
            expandAllCards(container)
          }
        }, 260)
      })
    } else if (needsExpandAll.current) {
      needsExpandAll.current = false
      expandAllCards(container)
    }
  }, [projects, containerRef, expandAllCards])

  const onCardHeaderPointerDown = useCallback((e, projectId) => {
    if (e.target.closest('.dots-menu-wrap') || e.target.closest('.card-rename-wrap')) return

    const startX = e.clientX, startY = e.clientY
    let started = false
    let longPressTimer = null
    const preventScroll = (ev) => { if (started) ev.preventDefault() }

    const start = (clientY) => {
      const container = containerRef.current
      if (!container) return false

      const wrappers = [...container.querySelectorAll('[data-project-id]')]
      const snapshots = wrappers.map(el => ({
        el,
        id: el.dataset.projectId,
        rect: el.getBoundingClientRect(),
      }))
      const dragIdx = snapshots.findIndex(s => s.id === projectId)
      if (dragIdx < 0) return false

      const dragged = snapshots[dragIdx]
      const cardEl = dragged.el.querySelector(':scope > .card')
      if (!cardEl) return false
      const headerEl = cardEl.querySelector('.card-header')
      if (!headerEl) return false

      const appEl = document.getElementById('app')
      const portal = document.getElementById('animation-portal')
      if (!appEl || !portal) return false
      const appRect = appEl.getBoundingClientRect()

      // Compute collapsed height for dragged card: header with equal top/bottom padding
      const cs = getComputedStyle(headerEl)
      const padTop = parseFloat(cs.paddingTop) || 22
      const padBottom = parseFloat(cs.paddingBottom) || 10
      const headerRect = headerEl.getBoundingClientRect()
      // Extra bottom to match top padding
      const collapsedH = headerRect.height + (padTop - padBottom)

      const pageEl = dragged.el.closest('.page')

      // Build ghost — collapsed-card clone following the pointer
      const headerClone = headerEl.cloneNode(true)
      headerClone.style.paddingBottom = padTop + 'px'
      headerClone.style.pointerEvents = 'none'
      const dotsEl = headerClone.querySelector('.dots-menu-wrap')
      if (dotsEl) dotsEl.style.opacity = '0.35'

      const ghostCard = document.createElement('div')
      ghostCard.style.cssText = [
        'background:#F7F6F3',
        'border:1px solid #C2C1BF',
        'border-radius:8px',
        'overflow:hidden',
        'box-shadow:0 8px 28px rgba(0,0,0,0.20)',
      ].join(';')
      ghostCard.appendChild(headerClone)

      const ghost = document.createElement('div')
      ghost.style.cssText = [
        'position:absolute',
        `left:${dragged.rect.left - appRect.left}px`,
        `top:${dragged.rect.top - appRect.top}px`,
        `width:${dragged.rect.width}px`,
        'pointer-events:none',
        'z-index:9999',
      ].join(';')
      ghost.appendChild(ghostCard)
      portal.appendChild(ghost)

      // Collapse ALL cards simultaneously
      // First pass: lock in current heights (no transition)
      snapshots.forEach(snap => {
        const cEl = snap.el.querySelector(':scope > .card')
        if (!cEl) return
        const fullH = cEl.getBoundingClientRect().height
        cEl.style.overflow = 'hidden'
        cEl.style.transition = 'none'
        cEl.style.maxHeight = fullH + 'px'
      })
      document.body.offsetHeight // single reflow

      // Second pass: animate to collapsed height
      requestAnimationFrame(() => {
        snapshots.forEach((snap, i) => {
          const cEl = snap.el.querySelector(':scope > .card')
          if (!cEl) return
          const cHeaderEl = cEl.querySelector('.card-header')
          const ccs = cHeaderEl ? getComputedStyle(cHeaderEl) : null
          const cPadTop = ccs ? (parseFloat(ccs.paddingTop) || 22) : 22
          const cPadBottom = ccs ? (parseFloat(ccs.paddingBottom) || 10) : 10
          const cHeaderH = cHeaderEl ? cHeaderEl.getBoundingClientRect().height : collapsedH
          const cCollapsed = cHeaderH + (cPadTop - cPadBottom)
          if (i === dragIdx) {
            cEl.style.transition = 'max-height 220ms ease, opacity 180ms ease'
            cEl.style.opacity = '0'
          } else {
            cEl.style.transition = 'max-height 220ms ease'
          }
          cEl.style.maxHeight = cCollapsed + 'px'
        })
      })

      const cloneTop = dragged.rect.top - appRect.top

      dragRef.current = {
        ghost, snapshots, dragIdx, currentIdx: dragIdx,
        cloneTop, startY: clientY,
        collapsedH, projectId,
        pageEl, appRect,
        scrollRaf: null,
      }
      return true
    }

    const doStart = (clientY) => {
      if (started) return
      started = start(clientY)
    }

    longPressTimer = setTimeout(() => { longPressTimer = null; doStart(startY) }, 250)
    document.addEventListener('touchmove', preventScroll, { passive: false })

    const applyShifts = (snapshots, dragIdx, newIdx, ghostH) => {
      snapshots.forEach((snap, i) => {
        if (i === dragIdx) return
        let dy = 0
        if (newIdx < dragIdx && i >= newIdx && i < dragIdx) dy = ghostH
        if (newIdx > dragIdx && i > dragIdx && i <= newIdx) dy = -ghostH
        snap.el.style.transition = 'transform 180ms ease'
        snap.el.style.transform = dy ? `translateY(${dy}px)` : ''
      })
    }

    const onMove = (e2) => {
      const dx = Math.abs(e2.clientX - startX), dy2 = Math.abs(e2.clientY - startY)
      if (longPressTimer && (dx > 8 || dy2 > 8)) {
        clearTimeout(longPressTimer); longPressTimer = null
        document.removeEventListener('touchmove', preventScroll)
      }
      if (!started) return
      e2.preventDefault()
      const s = dragRef.current
      if (!s) return

      const rawTop = s.cloneTop + (e2.clientY - s.startY)
      s.ghost.style.top = rawTop + 'px'

      // Edge scroll
      if (s.pageEl) {
        if (s.scrollRaf) { cancelAnimationFrame(s.scrollRaf); s.scrollRaf = null }
        const pageRect = s.pageEl.getBoundingClientRect()
        const ZONE = 80, SPEED = 6
        const nearTop = e2.clientY - pageRect.top < ZONE && s.pageEl.scrollTop > 0
        const nearBottom = pageRect.bottom - e2.clientY < ZONE
        if (nearTop || nearBottom) {
          const scroll = () => {
            if (!dragRef.current) return
            if (nearTop) s.pageEl.scrollTop -= SPEED
            if (nearBottom) s.pageEl.scrollTop += SPEED
            s.scrollRaf = requestAnimationFrame(scroll)
          }
          s.scrollRaf = requestAnimationFrame(scroll)
        }
      }

      // Use LIVE rects for insertion — these reflect post-collapse + current translateY
      const ghostH = s.collapsedH
      const nonDragged = s.snapshots.filter((_, i) => i !== s.dragIdx)
      let insertAt = nonDragged.length
      for (let j = 0; j < nonDragged.length; j++) {
        const liveRect = nonDragged[j].el.getBoundingClientRect()
        if (e2.clientY < liveRect.top + liveRect.height / 2) { insertAt = j; break }
      }
      const newIdx = Math.min(insertAt, s.snapshots.length - 1)
      if (newIdx !== s.currentIdx) {
        s.currentIdx = newIdx
        applyShifts(s.snapshots, s.dragIdx, s.currentIdx, ghostH)
      }
    }

    const finish = (drop) => {
      clearTimeout(longPressTimer); longPressTimer = null
      document.removeEventListener('pointermove', onMove, { passive: false })
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('touchmove', preventScroll)

      const s = dragRef.current
      if (s?.scrollRaf) { cancelAnimationFrame(s.scrollRaf); s.scrollRaf = null }
      dragRef.current = null

      if (!s || !started) return

      const container = containerRef.current

      // No movement or cancel — animate ghost back, expand everything
      if (!drop || s.currentIdx === s.dragIdx) {
        s.ghost.style.transition = 'opacity 200ms ease'
        s.ghost.style.opacity = '0'
        setTimeout(() => {
          s.ghost.remove()
          s.snapshots.forEach(snap => { snap.el.style.transition = ''; snap.el.style.transform = '' })
          const draggedCard = s.snapshots[s.dragIdx].el.querySelector(':scope > .card')
          if (draggedCard) draggedCard.style.opacity = '1'
          if (container) expandAllCards(container)
        }, 200)
        return
      }

      // --- Drop with reorder ---

      // Compute ghost's landing position while transforms are still applied
      const appEl = document.getElementById('app')
      const currentAppRect = appEl ? appEl.getBoundingClientRect() : s.appRect
      const landingSnap = s.snapshots[s.currentIdx]
      const landingLive = landingSnap.el.getBoundingClientRect()
      let landingTop
      if (s.currentIdx > s.dragIdx) {
        // Gap is below card at currentIdx (which shifted up)
        landingTop = landingLive.top + landingLive.height - currentAppRect.top
      } else {
        // Gap is above card at currentIdx (which shifted down)
        landingTop = landingLive.top - s.collapsedH - currentAppRect.top
      }

      // Animate ghost to landing slot
      s.ghost.style.transition = 'top 160ms ease'
      s.ghost.style.top = landingTop + 'px'

      setTimeout(() => {
        s.ghost.remove()

        // Snapshot positions WITH transforms for FLIP start points
        const fromTops = s.snapshots.map(snap => snap.el.getBoundingClientRect().top)

        // Reset transforms instantly — FLIP will recreate the visual motion
        s.snapshots.forEach(snap => { snap.el.style.transition = 'none'; snap.el.style.transform = '' })

        flipRef.current = s.snapshots.map((snap, i) => ({ el: snap.el, fromTop: fromTops[i] }))
        needsExpandAll.current = true

        const ids = s.snapshots.map(sn => sn.id)
        const [movedId] = ids.splice(s.dragIdx, 1)
        ids.splice(s.currentIdx, 0, movedId)
        const newOrder = ids.map(id => projectsRef.current.find(p => p.id === id)).filter(Boolean)
        onReorder(newOrder)
      }, 160)
    }

    const onUp = () => finish(true)
    const onCancel = () => finish(false)

    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
  }, [containerRef, onReorder, expandAllCards])

  return { onCardHeaderPointerDown }
}

export default function CategoryPage({ categoryId, collapsed = false, onToggleCollapsed, onScroll, headerOpacity, headerTranslate, pageAnimClass = '', isExiting = false }) {
  const { categories, addProject, reorderProjects } = useAppContext()
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const creationCardRef = useRef(null)
  const inputRef = useRef(null)
  const cardsAreaRef = useRef(null)

  const category = categories.find(c => c.id === categoryId)

  // Fade the cards area out, flip the (lifted) collapse state, then fade back in
  const toggleCollapsed = useCallback(() => {
    const area = cardsAreaRef.current
    if (area) { area.style.transition = 'opacity 160ms ease'; area.style.opacity = '0' }
    setTimeout(() => {
      onToggleCollapsed && onToggleCollapsed()
      requestAnimationFrame(() => { if (cardsAreaRef.current) cardsAreaRef.current.style.opacity = '1' })
      setTimeout(() => { if (cardsAreaRef.current) cardsAreaRef.current.style.transition = '' }, 220)
    }, 160)
  }, [onToggleCollapsed])

  const handleReorderProjects = useCallback((newOrder) => {
    reorderProjects(categoryId, newOrder)
  }, [categoryId, reorderProjects])

  const { onCardHeaderPointerDown } = useCardDragReorder(
    cardsAreaRef,
    category?.projects ?? [],
    handleReorderProjects
  )

  // Event delegation: long-press on any .card-header inside cards-area
  useEffect(() => {
    const container = cardsAreaRef.current
    if (!container) return
    const handler = (e) => {
      const header = e.target.closest('.card-header')
      if (!header) return
      const wrapper = header.closest('[data-project-id]')
      if (!wrapper) return
      onCardHeaderPointerDown(e, wrapper.dataset.projectId)
    }
    container.addEventListener('pointerdown', handler)
    return () => container.removeEventListener('pointerdown', handler)
  }, [onCardHeaderPointerDown])

  // Animate creation card in and auto-focus input when it appears
  useEffect(() => {
    if (!creating) return
    const card = creationCardRef.current
    if (card) requestAnimationFrame(() => card.classList.add('visible'))
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [creating])

  const handleCancel = useCallback(() => {
    const card = creationCardRef.current
    if (card) {
      card.style.transition = 'opacity 150ms ease, transform 150ms ease'
      card.style.opacity = '0'
      card.style.transform = 'translateY(-6px) scale(0.98)'
    }
    setTimeout(() => { setCreating(false); setTitle('') }, 150)
  }, [])

  const handleSubmit = useCallback(() => {
    const name = title.trim()
    if (!name) return
    const card = creationCardRef.current
    if (card) {
      card.style.transition = 'opacity 150ms ease, transform 150ms ease'
      card.style.opacity = '0'
      card.style.transform = 'translateY(-6px) scale(0.98)'
    }
    setTimeout(() => {
      addProject(categoryId, name)
      setCreating(false)
      setTitle('')
    }, 150)
  }, [title, categoryId, addProject])

  if (!category) return null

  return (
    <div className={`page active category-page${pageAnimClass ? ` ${pageAnimClass}` : ''}`} id={isExiting ? undefined : `page-${categoryId}`} onScroll={onScroll}>
      <div
        className="page-header"
        style={{ opacity: headerOpacity, transform: `translateY(${headerTranslate}px)` }}
      >
        <div className="category-header-row">
          <p className="active-title" style={{ marginBottom: '0' }}>{category.name}</p>
          <div className="category-header-actions">
            <button
              className="category-header-btn"
              onMouseDown={e => { e.preventDefault(); toggleCollapsed() }}
            >
              <CollapseToggleIcon collapsed={collapsed}/>
            </button>
            <button
              className="category-header-btn"
              onMouseDown={e => {
                e.preventDefault()
                setCreating(true); setTitle('')
              }}
            >
              <AddIcon/>
            </button>
          </div>
        </div>
        <UnderlineSvg className="underline-img" style={{ marginTop: '8px', marginBottom: '18px', color: 'var(--accent-base)' }} />
      </div>

      <div className="cards-area" ref={cardsAreaRef}>
        {creating && (
          <div className="card card-intro new-project-card" ref={creationCardRef}>
            <div className="project-input-wrap focused" style={{ marginTop: 0 }}>
              <div className="project-input-row">
                <input
                  ref={inputRef}
                  className="project-input"
                  placeholder="Project name..."
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit() } }}
                />
                {title.trim() ? (
                  <button
                    className="project-send-btn visible"
                    onMouseDown={e => { e.preventDefault(); handleSubmit() }}
                  >
                    <SendIcon/>
                  </button>
                ) : (
                  <button
                    className="project-cancel-btn"
                    onMouseDown={e => { e.preventDefault(); handleCancel() }}
                  >
                    <CancelIcon/>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {collapsed ? (
          <CategoryCollapsedView category={category} />
        ) : (
        <>
        {category.projects.length === 0 && !creating && (
          <div className="empty-state">
            <p>No projects yet</p>
          </div>
        )}

        {category.projects.map(project => (
          <div key={project.id} data-project-id={project.id}>
            <ProjectCard
              categoryId={categoryId}
              project={project}
            />
          </div>
        ))}
        </>
        )}
      </div>
    </div>
  )
}
