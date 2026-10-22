import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppContext } from '../context/AppContext.jsx'
import { getCategoryAccent } from '../theme.js'
import { NoteRowContent } from './ProjectCard.jsx'
import { NoteRowIcon } from './TodoDetailPage.jsx'

// Global confirmation modal shown when a todo with attached notes is completed.
// Asks whether the attached notes should be archived alongside the todo.
export default function ArchiveAttachmentsModal() {
  const { archivePrompt, resolveArchivePrompt, categories } = useAppContext()
  const [visible, setVisible] = useState(false)

  // Fade/scale in once mounted
  useEffect(() => {
    if (archivePrompt) {
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
  }, [archivePrompt])

  if (!archivePrompt) return null

  const count = archivePrompt.noteIds.length
  const noun = count === 1 ? 'note' : 'notes'
  const host = document.getElementById('app')
  if (!host) return null

  // The attached notes, as their rows on the canvas: icon, title and preview
  const catIdx = categories.findIndex(c => c.id === archivePrompt.categoryId)
  const accent = catIdx >= 0 ? getCategoryAccent(catIdx) : null
  const proj = categories[catIdx]?.projects.find(p => p.id === archivePrompt.projectId)
  const idSet = new Set(archivePrompt.noteIds.map(String))
  const notes = (proj?.notes || []).filter(n => idSet.has(String(n.id)))

  return createPortal(
    <div className={`archive-modal-backdrop${visible ? ' visible' : ''}`} onPointerDown={() => resolveArchivePrompt(false)}>
      <div className="archive-modal" onPointerDown={e => e.stopPropagation()}>
        <p className="archive-modal-title">Archive attached {noun}?</p>
        <p className="archive-modal-body">
          This item has {count} attached {noun}. Would you like to archive {count === 1 ? 'it' : 'them'} too?
        </p>
        {notes.length > 0 && (
          <div
            className="archive-modal-notes"
            style={accent ? { '--accent-base': accent.base, '--accent-dark': accent.dark, '--accent-light': accent.light, '--accent-base-rgb': accent.baseRgb } : undefined}
          >
            {notes.map(n => (
              <div key={n.id}>
                <div className="note-row">
                  <div className="checkbox-wrap" style={{ pointerEvents: 'none' }}>
                    <NoteRowIcon activated={n.activated}/>
                  </div>
                  <div className="item-content">
                    <NoteRowContent note={n}/>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="archive-modal-actions">
          <button className="archive-modal-btn" onPointerDown={e => { e.preventDefault(); resolveArchivePrompt(false) }}>No</button>
          <button className="archive-modal-btn primary" onPointerDown={e => { e.preventDefault(); resolveArchivePrompt(true) }}>Yes</button>
        </div>
      </div>
    </div>,
    host
  )
}
