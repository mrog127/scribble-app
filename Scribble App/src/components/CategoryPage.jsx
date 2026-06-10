import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppContext } from '../context/AppContext.jsx'
import ProjectCard from './ProjectCard.jsx'
import UnderlineSvg from '../assets/Underline.svg?react'

function ExpandIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 22 22" fill="none">
      <path d="M3 9V3h6M19 9V3h-6M3 13v6h6M19 13v6h-6" style={{ stroke: 'var(--accent-dark)' }} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function AddIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 22 22" fill="none">
      <rect x="1.5" y="1.5" width="19" height="19" rx="4.5" style={{ stroke: 'var(--accent-dark)' }} strokeWidth="1"/>
      <path d="M11 6v10M6 11h10" style={{ stroke: 'var(--accent-dark)' }} strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 16 L10 4" style={{ stroke: 'var(--accent-dark)' }} strokeWidth="1" strokeLinecap="round"/>
      <path d="M4 9 L10 3 L16 9" style={{ stroke: 'var(--accent-dark)' }} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function CategoryPage({ categoryId, onScroll, headerOpacity, headerTranslate, pageAnimClass = '', isExiting = false }) {
  const { categories, addProject } = useAppContext()
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const creationCardRef = useRef(null)
  const inputRef = useRef(null)

  const category = categories.find(c => c.id === categoryId)

  // Animate creation card in and auto-focus input when it appears
  useEffect(() => {
    if (!creating) return
    const card = creationCardRef.current
    if (card) requestAnimationFrame(() => card.classList.add('visible'))
    // Small delay so the card is visible before focus
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [creating])

  const handleSubmit = useCallback(() => {
    const name = title.trim()
    if (!name) return

    // Animate creation card out, then add the real project card
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
            <button className="category-header-btn">
              <ExpandIcon/>
            </button>
            <button
              className="category-header-btn"
              onMouseDown={e => { e.preventDefault(); setCreating(true); setTitle('') }}
            >
              <AddIcon/>
            </button>
          </div>
        </div>
        <UnderlineSvg className="underline-img" style={{ marginTop: '8px', marginBottom: '18px', color: 'var(--accent-base)' }} />
      </div>

      <div className="cards-area">
        {category.projects.length === 0 && !creating && (
          <div className="empty-state">
            <p>No projects yet</p>
          </div>
        )}

        {category.projects.map(project => (
          <ProjectCard
            key={project.id}
            categoryId={categoryId}
            project={project}
          />
        ))}

        {creating && (
          <div className="card card-intro new-project-card" ref={creationCardRef}>
            <p className="new-project-label">Title your project:</p>
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
                <button
                  className={`project-send-btn${title.trim() ? ' visible' : ''}`}
                  onMouseDown={e => { e.preventDefault(); handleSubmit() }}
                >
                  <SendIcon/>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
