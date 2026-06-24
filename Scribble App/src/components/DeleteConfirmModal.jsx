import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppContext } from '../context/AppContext.jsx'

// Global confirmation modal shown before deleting a note, link, project card or
// category. The actual (animated) delete is the onConfirm callback passed to
// promptDelete; it runs only when the user taps Delete.
function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function DeleteConfirmModal() {
  const { deletePrompt, resolveDeletePrompt } = useAppContext()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (deletePrompt) {
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
  }, [deletePrompt])

  if (!deletePrompt) return null
  const host = document.getElementById('app')
  if (!host) return null

  return createPortal(
    <div className={`archive-modal-backdrop${visible ? ' visible' : ''}`} onPointerDown={() => resolveDeletePrompt(false)}>
      <div className="archive-modal" onPointerDown={e => e.stopPropagation()}>
        <p className="archive-modal-title">Are you sure you want to delete?</p>
        <p className="archive-modal-body">This action cannot be undone.</p>
        <div className="archive-modal-actions">
          <button className="archive-modal-btn" onPointerDown={e => { e.preventDefault(); resolveDeletePrompt(false) }}>Cancel</button>
          <button className="archive-modal-btn danger" onPointerDown={e => { e.preventDefault(); resolveDeletePrompt(true) }}>
            <TrashIcon/>Delete
          </button>
        </div>
      </div>
    </div>,
    host
  )
}
