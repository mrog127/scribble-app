import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { getCategoryAccent } from '../theme.js'

// "Move to..." card — pick a destination project. Nothing applies until Save.
// Opens centered over a dim scrim. Reuses the .save-to-* styles.
export default function MoveToCard({ categories, currentCategoryId, currentProjectId, topPx, onCancel, onSave }) {
  const [sel, setSel] = useState({ categoryId: currentCategoryId, projectId: currentProjectId })
  const changed = sel.projectId !== currentProjectId
  const scrollRef = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => { requestAnimationFrame(() => setOpen(true)) }, [])
  const finish = (fn) => { setOpen(false); setTimeout(fn, 180) }

  // Fade the rest of the screen to 10% while open
  useEffect(() => {
    const app = document.getElementById('app')
    app?.classList.add('dim-bg')
    return () => app?.classList.remove('dim-bg')
  }, [])

  // On open, scroll so the currently selected location is centered in the view
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const selectedEl = scroller.querySelector('.save-to-option.selected')
    if (!selectedEl) return
    const sRect = scroller.getBoundingClientRect()
    const eRect = selectedEl.getBoundingClientRect()
    const delta = (eRect.top - sRect.top) - (scroller.clientHeight - eRect.height) / 2
    scroller.scrollTop += delta
  }, [])

  return createPortal(
    <div className={`move-to-overlay${open ? ' open' : ''}`} onPointerDown={() => finish(onCancel)}>
    <div className={`move-to-card${open ? ' open' : ''}`} onPointerDown={e => e.stopPropagation()}>
      <div className="save-to-header">
        <p className="save-to-title">Move to...</p>
        <button
          className="save-to-cancel"
          onMouseDown={e => { e.preventDefault(); changed ? finish(() => onSave(sel)) : finish(onCancel) }}
        >
          {changed ? 'Save' : 'Cancel'}
        </button>
      </div>
      <div className="save-to-scroll" ref={scrollRef}>
        {categories.filter(c => c.projects.length > 0).map(cat => {
          const catIdx = categories.findIndex(c2 => c2.id === cat.id)
          const accent = getCategoryAccent(catIdx)
          return (
            <div key={cat.id} style={{ '--cb-base': accent.base, '--cb-dark': accent.dark, '--cb-light': accent.light, '--cb-base-rgb': accent.baseRgb }}>
              <div className="save-to-category">{cat.name}</div>
              {cat.projects.map((proj, i) => (
                <div key={proj.id}>
                  {i > 0 && <div className="save-to-divider"/>}
                  <button
                    className={`save-to-option${sel.projectId === proj.id ? ' selected' : ''}`}
                    onMouseDown={e => { e.preventDefault(); setSel({ categoryId: cat.id, projectId: proj.id }) }}
                  >
                    <div className={`save-to-radio${sel.projectId === proj.id ? ' filled' : ''}`}/>
                    <span>{proj.name}</span>
                  </button>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
    </div>,
    document.getElementById('app')
  )
}
