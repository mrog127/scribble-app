import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppContext } from '../context/AppContext.jsx'

// Global confirmation modal shown when a todo with attached notes is completed.
// Asks whether the attached notes should be archived alongside the todo.
export default function ArchiveAttachmentsModal() {
  const { archivePrompt, resolveArchivePrompt } = useAppContext()
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

  return createPortal(
    <div className={`archive-modal-backdrop${visible ? ' visible' : ''}`} onPointerDown={() => resolveArchivePrompt(false)}>
      <div className="archive-modal" onPointerDown={e => e.stopPropagation()}>
        <p className="archive-modal-title">Archive attached {noun}?</p>
        <p className="archive-modal-body">
          This item has {count} attached {noun}. Would you like to archive {count === 1 ? 'it' : 'them'} too?
        </p>
        <div className="archive-modal-actions">
          <button className="archive-modal-btn" onPointerDown={e => { e.preventDefault(); resolveArchivePrompt(false) }}>No</button>
          <button className="archive-modal-btn primary" onPointerDown={e => { e.preventDefault(); resolveArchivePrompt(true) }}>Yes</button>
        </div>
      </div>
    </div>,
    host
  )
}
