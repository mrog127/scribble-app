import { useRef, useCallback } from 'react'

// Parse a 'YYYY-MM-DD' string as a local date (avoids UTC off-by-one).
export function parseLocalDate(str) {
  if (!str) return null
  const [y, m, d] = String(str).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

// Format a scheduled date for display. long=false → "Jun 20", long=true → "Jun 20, 2026".
export function formatSchedule(str, long = false) {
  const date = parseLocalDate(str)
  if (!date) return ''
  return date.toLocaleDateString(undefined, long
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric' })
}

// True once a scheduled item's day has arrived (scheduled date is today or earlier).
export function isScheduleReached(str) {
  const date = parseLocalDate(str)
  if (!date) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date <= today
}

// Order a list of items: active first, then scheduled, then the rest.
// Stable within each group (preserves incoming order, e.g. sort_order).
export function groupByActivation(items) {
  return [
    ...items.filter(i => i.activated),
    ...items.filter(i => !i.activated && i.scheduledDate),
    ...items.filter(i => !i.activated && !i.scheduledDate),
  ]
}

// Star icon used by the Active/Inactive toggle.
export function ActivateIcon({ activated }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <polygon
        points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
        stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
        style={{ fill: activated ? 'rgba(var(--accent-base-rgb),0.3)' : 'none' }}
      />
    </svg>
  )
}

// Snap a swipe row closed and clear its inline transform.
export function closeSwipeRow(row) {
  if (!row) return
  row.classList.remove('swiped-left', 'swiped-right')
  const content = row.querySelector('.swipe-content')
  if (content) { content.style.transition = ''; content.style.transform = '' }
}

// Convert an element into a plain anchor-rect object for CalendarPopup.
export function toAnchorRect(el) {
  const r = el?.getBoundingClientRect()
  return r ? { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height } : null
}

// 1pt stroke calendar icon. Inherits color via currentColor.
export function CalendarIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1" />
      <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="1" />
      <path d="M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

// Distinguish a tap from a long-press on a button.
// Returns { onPointerDown } to spread onto the element.
// - quick release  -> onTap()
// - held >= delay  -> onLongPress() (and the following release does NOT fire onTap)
// - moved > 10px   -> treated as a scroll/swipe, neither fires
export function useActivatePress({ onTap, onLongPress, delay = 500 }) {
  const stateRef = useRef({})

  const onPointerDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const s = stateRef.current
    s.longFired = false
    s.startX = e.clientX
    s.startY = e.clientY

    s.timer = setTimeout(() => {
      s.longFired = true
      onLongPress && onLongPress()
    }, delay)

    const onMove = (e2) => {
      if (Math.abs(e2.clientX - s.startX) > 10 || Math.abs(e2.clientY - s.startY) > 10) {
        clearTimeout(s.timer)
        cleanup()
      }
    }
    const onUp = () => {
      clearTimeout(s.timer)
      if (!s.longFired) onTap && onTap()
      cleanup()
    }
    const onCancel = () => { clearTimeout(s.timer); cleanup() }
    const cleanup = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
  }, [onTap, onLongPress, delay])

  return { onPointerDown }
}

// Swipe-revealed Active button. Tap toggles active (or clears a schedule);
// long-press opens the calendar to schedule activation. Used by project cards,
// collapsed category views, and the homescreen activated cards.
export function ActivateSwipeButton({ item, type, onActivateTap, onScheduleClear, onScheduleOpen }) {
  const btnRef = useRef(null)
  const hasSchedule = !!item.scheduledDate && !item.activated
  // Once the scheduled day arrives, the item reads as plain "active".
  const reached = hasSchedule && isScheduleReached(item.scheduledDate)
  const active = item.activated || reached
  const scheduled = hasSchedule && !reached   // still upcoming → show the date
  const press = useActivatePress({
    onTap: () => {
      const row = btnRef.current?.closest('.swipe-row')
      if (hasSchedule) onScheduleClear(type, item.id, row)
      else onActivateTap(type, item.id, row)
    },
    onLongPress: () => onScheduleOpen(type, item, btnRef.current),
  })
  return (
    <button ref={btnRef} className={`swipe-action-btn active-tag${active ? ' activated' : ''}${scheduled ? ' scheduled' : ''}`} {...press}>
      <div className="swipe-active-inner">
        {scheduled ? <CalendarIcon size={16}/> : <ActivateIcon activated={active}/>}
        {scheduled
          ? <span className="swipe-action-label schedule">{formatSchedule(item.scheduledDate)}</span>
          : <span className="swipe-action-label active-tag">{active ? 'Active' : 'Inactive'}</span>}
      </div>
    </button>
  )
}
