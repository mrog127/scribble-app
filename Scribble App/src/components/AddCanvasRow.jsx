import { useState, useRef, useEffect } from 'react'
import { useAppContext } from '../context/AppContext.jsx'

// Check + X, matching the "Name canvas" input on a category page
function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 10.5 L8.5 15 L16 5.5" style={{ stroke: 'var(--cb-dark)' }} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
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

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <line x1="10" y1="3.5" x2="10" y2="16.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <line x1="3.5" y1="10" x2="16.5" y2="10" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

/*
  Last row of a Save to / Move to list: "+ Add new canvas". Pressing it swaps the
  row for a text field (focused, so the keyboard opens); the check creates the
  canvas on that page and hands it back to be selected, the X restores the row
  and leaves the previous selection alone.
*/
export default function AddCanvasRow({ categoryId, onCreated, onDone }) {
  const { addProject } = useAppContext()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { if (adding) inputRef.current?.focus() }, [adding])
  // Switching pages abandons a half-typed name
  useEffect(() => { setAdding(false); setName('') }, [categoryId])

  if (!categoryId) return null

  const cancel = () => { setAdding(false); setName(''); if (onDone) onDone() }
  const submit = () => {
    const n = name.trim()
    if (!n) return
    const projectId = addProject(categoryId, n)
    setAdding(false)
    setName('')
    if (onCreated) onCreated({ categoryId, projectId })
    if (onDone) onDone()
  }

  return (
    <>
      <div className="save-to-divider"/>
      {adding ? (
        <div className="save-to-option save-to-new-row">
          <input
            ref={inputRef}
            className="save-to-new-input"
            placeholder="Name canvas"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); submit() }
              else if (e.key === 'Escape') { e.preventDefault(); cancel() }
            }}
          />
          <button
            className="save-to-new-btn"
            aria-label="Cancel"
            onMouseDown={e => { e.preventDefault(); cancel() }}
          ><CancelIcon/></button>
          {!!name.trim() && (
            <button
              className="save-to-new-send"
              aria-label="Create canvas"
              onMouseDown={e => { e.preventDefault(); submit() }}
            ><SendIcon/></button>
          )}
        </div>
      ) : (
        <button
          className="save-to-option save-to-add"
          onMouseDown={e => { e.preventDefault(); setAdding(true) }}
        >
          <span className="save-to-add-icon"><PlusIcon/></span>
          <span>Add new canvas</span>
        </button>
      )}
    </>
  )
}
