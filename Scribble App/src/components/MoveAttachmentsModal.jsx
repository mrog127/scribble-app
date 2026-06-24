import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppContext } from '../context/AppContext.jsx'

// Global confirmation modal shown when a list item with attachments is moved to a
// different project. Asks whether the attached notes/links should move along.
export default function MoveAttachmentsModal() {
  const { moveAttachPrompt, resolveMoveAttachPrompt } = useAppContext()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (moveAttachPrompt) {
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
  }, [moveAttachPrompt])

  if (!moveAttachPrompt) return null
  const host = document.getElementById('app')
  if (!host) return null

  const { noteCount = 0, linkCount = 0, destName } = moveAttachPrompt
  const parts = []
  if (noteCount) parts.push(`${noteCount} attached note${noteCount === 1 ? '' : 's'}`)
  if (linkCount) parts.push(`${linkCount} attached link${linkCount === 1 ? '' : 's'}`)
  const phrase = parts.join(' and ')
  const total = noteCount + linkCount
  const pronoun = total === 1 ? 'it' : 'them'

  return createPortal(
    <div className={`archive-modal-backdrop${visible ? ' visible' : ''}`} onPointerDown={() => resolveMoveAttachPrompt(false)}>
      <div className="archive-modal" onPointerDown={e => e.stopPropagation()}>
        <p className="archive-modal-title">Move attached items?</p>
        <p className="archive-modal-body">
          This item has {phrase}. Would you like to move {pronoun} to {destName} too?
        </p>
        <div className="archive-modal-actions">
          <button className="archive-modal-btn" onPointerDown={e => { e.preventDefault(); resolveMoveAttachPrompt(false) }}>No</button>
          <button className="archive-modal-btn primary" onPointerDown={e => { e.preventDefault(); resolveMoveAttachPrompt(true) }}>Yes</button>
        </div>
      </div>
    </div>,
    host
  )
}
