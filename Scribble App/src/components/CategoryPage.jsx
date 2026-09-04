import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { flushSync } from 'react-dom'
import { useAppContext } from '../context/AppContext.jsx'
import ProjectCard from './ProjectCard.jsx'
import CategoryCollapsedView from './CategoryCollapsedView.jsx'
import { EyeIcon, EyeOffIcon, ArchiveMenuIcon, EditIcon, GalleryMenuIcon, GalleryOffMenuIcon } from './MenuIcons.jsx'
import UnderlineSvg from '../assets/Underline.svg?react'
import { getCategoryAccent } from '../theme.js'
import { subscribeProjectFocus } from '../searchFocus.js'
import { useCardDragReorder } from './useCardDragReorder.js'

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

export default function CategoryPage({ categoryId, collapsed = false, onToggleCollapsed, onScroll, headerOpacity, headerTranslate, pageAnimClass = '', isExiting = false }) {
  const { categories, addProject, reorderProjects, archiveCategory, renameCategory, toggleCategoryHomescreen } = useAppContext()
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef(null)
  const [showArchivedCanvases, setShowArchivedCanvases] = useState(() => {
    try { return localStorage.getItem(`arch-canvases-${categoryId}`) === 'true' } catch { return false }
  })
  const creationCardRef = useRef(null)
  const inputRef = useRef(null)
  const cardsAreaRef = useRef(null)
  const menuRef = useRef(null)

  const category = categories.find(c => c.id === categoryId)
  // This page's own accent — so the underline colour cross-dissolves with the
  // header as pages fade in/out, instead of switching only at the global commit.
  const catIdx = categories.findIndex(c => c.id === categoryId)
  const pageAccent = catIdx >= 0 ? getCategoryAccent(catIdx) : null

  // Close the header menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // A search result inside an archived canvas needs that section revealed first.
  useEffect(() => subscribeProjectFocus(req => {
    if (!req || !req.showArchivedCanvases) return
    if (String(req.categoryId) !== String(categoryId)) return
    setShowArchivedCanvases(true)
    try { localStorage.setItem(`arch-canvases-${categoryId}`, 'true') } catch {}
  }), [categoryId])

  const handleToggleShowArchivedCanvases = useCallback(() => {
    setShowArchivedCanvases(v => {
      const next = !v
      try { localStorage.setItem(`arch-canvases-${categoryId}`, next ? 'true' : 'false') } catch {}
      return next
    })
  }, [categoryId])

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
    const cat = categories.find(c => c.id === categoryId)
    const archived = cat ? cat.projects.filter(p => p.archived) : []
    reorderProjects(categoryId, [...newOrder, ...archived])
  }, [categoryId, reorderProjects, categories])

  // Fade a drop shadow in behind the cards over the first 56px of scrolling (0% → 4%)
  const handleScroll = useCallback((e) => {
    if (onScroll) onScroll(e)
    const y = e.target.scrollTop
    const opacity = Math.min(0.10, Math.max(0.04, 0.04 + (y / 56) * 0.06))
    if (cardsAreaRef.current) cardsAreaRef.current.style.setProperty('--card-scroll-shadow', String(opacity))
  }, [onScroll])

  const { onCardHeaderPointerDown } = useCardDragReorder(
    cardsAreaRef,
    (category?.projects ?? []).filter(p => !p.archived),
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
    const t = setTimeout(() => {
      if (document.activeElement !== inputRef.current) inputRef.current?.focus()
    }, 80)
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

  const commitRename = () => {
    if (!renaming) return
    const next = renameValue.trim()
    if (next && next !== category?.name) renameCategory(categoryId, next)
    setRenaming(false)
  }

  if (!category) return null

  const inGallery = category.sendToHomescreen !== false
  const activeProjects = category.projects.filter(p => !p.archived)
  const archivedProjects = category.projects.filter(p => p.archived)
  const archivedCanvasCount = archivedProjects.length

  return (
    <div
      className={`page active category-page${pageAnimClass ? ` ${pageAnimClass}` : ''}`}
      id={isExiting ? undefined : `page-${categoryId}`}
      onScroll={handleScroll}
      style={pageAccent ? { '--accent-base': pageAccent.base, '--accent-dark': pageAccent.dark, '--accent-light': pageAccent.light, '--accent-base-rgb': pageAccent.baseRgb } : undefined}
    >
      <div
        className="page-header"
        style={{ opacity: headerOpacity, transform: `translateY(${headerTranslate}px)` }}
      >
        <div className="category-header-row">
          {renaming ? (
            <input
              ref={renameInputRef}
              className="active-title category-title-input"
              value={renameValue}
              autoFocus
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename() }
                if (e.key === 'Escape') { e.preventDefault(); setRenaming(false) }
              }}
              onBlur={commitRename}
            />
          ) : (
            <p className="active-title" style={{ marginBottom: '0' }}>{category.name}</p>
          )}
          <div className="category-header-actions">
          {renaming ? (
            <button
              className="project-send-btn visible"
              aria-label="Save name"
              onMouseDown={e => { e.preventDefault(); commitRename() }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 10.5 L8.5 15 L16 5.5" style={{ stroke: 'var(--accent-dark)' }} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : (<>
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
                // flushSync commits the state (and mounts the input) before this
                // handler returns, so focus() still counts as part of the tap —
                // iOS only raises the keyboard for a focus inside a gesture.
                flushSync(() => { setCreating(true); setTitle('') })
                inputRef.current?.focus()
              }}
            >
              <AddIcon/>
            </button>
            <div className="dots-menu-wrap" ref={menuRef}>
              <div
                className="dots-menu dots-menu-btn"
                onMouseDown={e => { e.preventDefault(); setMenuOpen(v => !v) }}
              >
                <span/><span/><span/>
              </div>
              <div className={`card-context-menu${menuOpen ? ' open' : ''}`}>
                {!collapsed && archivedCanvasCount > 0 && (
                  <button
                    className="card-context-item"
                    onMouseDown={e => { e.preventDefault(); handleToggleShowArchivedCanvases(); setMenuOpen(false) }}
                  >
                    {showArchivedCanvases ? <EyeOffIcon/> : <EyeIcon/>}
                    {showArchivedCanvases ? 'Hide Archived Canvases' : `Show ${archivedCanvasCount} Archived Canvases`}
                  </button>
                )}
                <button
                  className="card-context-item"
                  onMouseDown={e => { e.preventDefault(); setMenuOpen(false); toggleCategoryHomescreen(categoryId) }}
                >
                  {inGallery ? <GalleryOffMenuIcon/> : <GalleryMenuIcon/>}
                  {inGallery ? 'Hide from Gallery' : 'Send to Gallery'}
                </button>
                <button
                  className="card-context-item"
                  onMouseDown={e => {
                    e.preventDefault()
                    setMenuOpen(false)
                    setRenameValue(category.name)
                    setRenaming(true)
                  }}
                >
                  <EditIcon/>
                  Rename
                </button>
                <button
                  className="card-context-item"
                  onMouseDown={e => { e.preventDefault(); setMenuOpen(false); archiveCategory(categoryId) }}
                >
                  <ArchiveMenuIcon/>
                  Archive Easel
                </button>
              </div>
            </div>
          </>)}
          </div>
        </div>
        <UnderlineSvg className="underline-img" style={{ marginTop: '8px', marginBottom: '18px', color: pageAccent ? pageAccent.base : 'var(--accent-base)' }} />
      </div>

      <div className="cards-area" ref={cardsAreaRef}>
        {creating && (
          <div className="card card-intro new-project-card" ref={creationCardRef}>
            <div className="project-input-wrap focused" style={{ marginTop: 0 }}>
              <div className="project-input-row">
                <input
                  ref={inputRef}
                  className="project-input"
                  placeholder="Name canvas"
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

        {activeProjects.map(project => (
          <div key={project.id} data-project-id={project.id}>
            <ProjectCard
              categoryId={categoryId}
              project={project}
            />
          </div>
        ))}

        {showArchivedCanvases && archivedProjects.map(project => (
          <div key={project.id} data-archived-id={project.id}>
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
