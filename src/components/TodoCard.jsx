import { useRef, useCallback } from 'react'

function useSwipe(onDelete, onTagActive) {
  const swipeState = useRef({})

  const onPointerDown = useCallback((e, id) => {
    if (e.target.closest('.swipe-action-btn') || e.target.closest('.checkbox-wrap')) return
    const row = e.currentTarget.closest('.swipe-row')
    if (!row) return
    swipeState.current = { id, startX: e.clientX, startY: e.clientY, row, moved: false, dir: null }

    const onMove = (e2) => {
      const s = swipeState.current
      if (!s.row) return
      const dx = e2.clientX - s.startX
      const dy = e2.clientY - s.startY
      if (!s.dir) {
        if (Math.abs(dy) > 8) { cleanup(); return }
        if (Math.abs(dx) > 10) s.dir = dx < 0 ? 'left' : 'right'
        else return
      }
      s.moved = true
      const content = s.row.querySelector('.swipe-content')
      if (!content) return
      const base = s.row.classList.contains('swiped-left') ? -72 : s.row.classList.contains('swiped-right') ? 72 : 0
      const clamped = Math.max(-72, Math.min(72, base + dx))
      content.style.transition = 'none'
      content.style.transform = `translateX(${clamped}px)`
    }

    const onUp = (e2) => {
      const s = swipeState.current
      if (!s.row) { cleanup(); return }
      const dx = e2.clientX - s.startX
      const content = s.row.querySelector('.swipe-content')
      if (!content) { cleanup(); return }
      content.style.transition = ''
      const base = s.row.classList.contains('swiped-left') ? -72 : s.row.classList.contains('swiped-right') ? 72 : 0
      const total = base + dx
      if (total < -36) {
        s.row.classList.add('swiped-left'); s.row.classList.remove('swiped-right')
        content.style.transform = ''
      } else if (total > 36) {
        s.row.classList.add('swiped-right'); s.row.classList.remove('swiped-left')
        content.style.transform = ''
      } else {
        s.row.classList.remove('swiped-left', 'swiped-right')
        content.style.transform = ''
      }
      cleanup()
    }

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [])

  return { onPointerDown }
}

function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 1L7.27 4.27L10.85 4.63L8.3 6.9L9.09 10.4L6 8.5L2.91 10.4L3.7 6.9L1.15 4.63L4.73 4.27L6 1Z" fill="rgba(105,147,254,0.2)" stroke="#3F5999" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

function TrashIcon({ color = '#B24A4A' }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <polyline points="3 6 5 6 21 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 11v6M14 11v6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ActiveTagIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" stroke="#3F5999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

export default function TodoCard({ todos, hideCompleted, onToggle, onDelete, onReorder, onToggleHideCompleted }) {
  const { onPointerDown } = useSwipe(onDelete, () => {})
  const checkTimers = useRef({})

  if (todos.length === 0) return null

  const sorted = hideCompleted
    ? todos.filter(t => !t.checked)
    : [...todos.filter(t => !t.checked), ...todos.filter(t => t.checked)]

  const hasChecked = todos.some(t => t.checked)

  const handleCheckboxDown = (e, id) => {
    e.stopPropagation()
    checkTimers.current[id] = setTimeout(() => {
      // long press — no-op for now
    }, 300)
  }

  const handleCheckboxUp = (e, id) => {
    e.stopPropagation()
    clearTimeout(checkTimers.current[id])
    onToggle(id)
  }

  return (
    <div className="card" id="listsCard">
      <div className="card-header">
        <div>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="5" cy="7" r="1.5" fill="#3D3D3D"/>
            <line x1="9" y1="7" x2="19" y2="7" stroke="#3D3D3D" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="5" cy="12" r="1.5" fill="#3D3D3D"/>
            <line x1="9" y1="12" x2="19" y2="12" stroke="#3D3D3D" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="5" cy="17" r="1.5" fill="#3D3D3D"/>
            <line x1="9" y1="17" x2="14" y2="17" stroke="#3D3D3D" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="card-title">Lists</span>
        <div className="dots-menu"><span/><span/><span/></div>
      </div>

      <div id="lists-container">
        {sorted.map((t, i) => (
          <div key={t.id}>
            {i > 0 && <div className="divider"/>}
            <div className="swipe-row" data-swipe-id={t.id} data-swipe-type="todo">
              <button className="swipe-action-btn active-tag" onMouseDown={e => e.preventDefault()}>
                <ActiveTagIcon/>
                <span className="swipe-action-label active-tag">Active</span>
              </button>
              <button className="swipe-action-btn delete" onMouseDown={e => { e.preventDefault(); onDelete(t.id) }}>
                <TrashIcon/>
                <span className="swipe-action-label delete">Delete</span>
              </button>
              <div className="swipe-content">
                <div
                  className={`todo-row${t.checked ? ' checked' : ''}`}
                  data-id={t.id}
                  onPointerDown={e => onPointerDown(e, t.id)}
                >
                  <div
                    className="checkbox-wrap"
                    onMouseDown={e => handleCheckboxDown(e, t.id)}
                    onMouseUp={e => handleCheckboxUp(e, t.id)}
                    onMouseLeave={e => clearTimeout(checkTimers.current[t.id])}
                    onTouchStart={e => handleCheckboxDown(e, t.id)}
                    onTouchEnd={e => handleCheckboxUp(e, t.id)}
                  >
                    <div className={`checkbox${t.checked ? ' checked' : ''}`}>
                      <svg className="checkmark" width="16" height="16" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                  <div className="item-content">
                    <span className={`item-text${t.checked ? ' checked-text' : ''}`}>{t.text}</span>
                    <div className="source-label">
                      <StarIcon/>
                      <span className="source-label-text">{t.source}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasChecked && (
        <button
          className="hide-completed-btn visible"
          onClick={onToggleHideCompleted}
          style={{ display: 'block' }}
        >
          {hideCompleted ? 'Show Completed' : 'Hide Completed'}
        </button>
      )}
    </div>
  )
}
