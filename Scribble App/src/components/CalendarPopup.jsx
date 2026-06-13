import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { parseLocalDate } from './ScheduleBits.jsx'

const pad = (n) => String(n).padStart(2, '0')
const toStr = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Centered date picker over a dim scrim. Nothing commits until Save
// (mirrors the "Move to..." card).
// Props: initialDate ('YYYY-MM-DD'|null), onSelect(dateStr), onClose, accent
export default function CalendarPopup({ initialDate, onSelect, onClose, accent }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [pending, setPending] = useState(initialDate || null)
  const init = parseLocalDate(pending) || today
  const [view, setView] = useState({ y: init.getFullYear(), m: init.getMonth() })
  const [open, setOpen] = useState(false)

  useEffect(() => { requestAnimationFrame(() => setOpen(true)) }, [])

  // Fade the rest of the screen to 10% while open
  useEffect(() => {
    const app = document.getElementById('app')
    app?.classList.add('dim-bg')
    return () => app?.classList.remove('dim-bg')
  }, [])

  const selected = parseLocalDate(pending)
  const startWeekday = new Date(view.y, view.m, 1).getDay()
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const atCurrentMonth = view.y < today.getFullYear() ||
    (view.y === today.getFullYear() && view.m <= today.getMonth())

  const prevMonth = () => { if (atCurrentMonth) return; setView(v => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 })) }
  const nextMonth = () => setView(v => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))

  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const close = () => { setOpen(false); setTimeout(onClose, 180) }

  const pick = (d) => {
    const date = new Date(view.y, view.m, d)
    date.setHours(0, 0, 0, 0)
    if (date < today) return
    setPending(toStr(view.y, view.m, d))
  }

  const changed = (pending || null) !== (initialDate || null)
  const onHeaderBtn = () => {
    if (changed && pending) onSelect(pending)
    close()
  }

  const style = accent ? {
    '--accent-base': accent.base,
    '--accent-dark': accent.dark,
    '--accent-light': accent.light,
    '--accent-base-rgb': accent.baseRgb,
  } : undefined

  return createPortal(
    <div className={`cal-overlay${open ? ' open' : ''}`} onPointerDown={close} style={style}>
      <div
        className={`cal-card${open ? ' open' : ''}`}
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="save-to-header">
          <p className="save-to-title">Schedule for...</p>
          <button className="save-to-cancel" onPointerDown={e => { e.preventDefault(); onHeaderBtn() }}>
            {changed ? 'Save' : 'Cancel'}
          </button>
        </div>

        <div className="cal-body">
          <div className="cal-monthnav">
            <button className={`cal-nav${atCurrentMonth ? ' disabled' : ''}`} onPointerDown={e => { e.preventDefault(); prevMonth() }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <span className="cal-month">{monthLabel}</span>
            <button className="cal-nav" onPointerDown={e => { e.preventDefault(); nextMonth() }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>

          <div className="cal-weekdays">
            {WEEKDAYS.map((w, i) => <span key={i} className="cal-weekday">{w}</span>)}
          </div>

          <div className="cal-grid">
            {cells.map((d, i) => {
              if (d === null) return <span key={i} className="cal-cell empty" />
              const date = new Date(view.y, view.m, d)
              date.setHours(0, 0, 0, 0)
              const isPast = date < today
              const isToday = date.getTime() === today.getTime()
              const isSelected = selected && date.getTime() === new Date(selected.getFullYear(), selected.getMonth(), selected.getDate()).getTime()
              return (
                <button
                  key={i}
                  className={`cal-cell${isPast ? ' past' : ''}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                  disabled={isPast}
                  onPointerDown={e => { e.preventDefault(); pick(d) }}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>,
    document.getElementById('app')
  )
}
