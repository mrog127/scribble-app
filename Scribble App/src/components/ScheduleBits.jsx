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

// Compact label for a row's schedule indicator: the abbreviated weekday if the
// date falls inside the next week ("Mon"), otherwise month + day ("Aug 12").
export function formatScheduleShort(str) {
  const date = parseLocalDate(str)
  if (!date) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((date - today) / 86400000)
  return date.toLocaleDateString(undefined, days >= 0 && days < 7
    ? { weekday: 'short' }
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

// ---- Recurrence ----------------------------------------------------------
// A todo can repeat: weekly (same weekday), monthly (same weekday-of-month,
// e.g. every 2nd Tuesday) or yearly (same calendar date). `recur_anchor` holds
// the occurrence the next one is measured from, so checking an item off late
// never drifts the series.
export const RECURRENCE_CYCLE = ['never', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'semiannual', 'yearly']

// How many weeks / months each recurrence steps by
const WEEK_STEP = { weekly: 1, biweekly: 2 }
const MONTH_STEP = { monthly: 1, bimonthly: 2, semiannual: 6 }

// Most frequent first — how recurring items are ordered within a list.
const RECURRENCE_RANK = { weekly: 0, biweekly: 1, monthly: 2, bimonthly: 3, semiannual: 4, yearly: 5 }
export function recurrenceRank(r) {
  const rank = RECURRENCE_RANK[r]
  return rank === undefined ? Infinity : rank
}

export function recurrenceLabel(r) {
  switch (r) {
    case 'weekly': return 'Weekly'
    case 'biweekly': return 'Bi-weekly'
    case 'monthly': return 'Monthly'
    case 'bimonthly': return 'Bi-monthly'
    case 'semiannual': return 'Every 6 months'
    case 'yearly': return 'Yearly'
    default: return 'Never'
  }
}

export function isRecurring(r) { return !!r && r !== 'never' }

const pad2 = (n) => String(n).padStart(2, '0')
const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

// The date of the nth (1-based) `weekday` of a month, clamped to the last one
// when that month doesn't have an nth.
function nthWeekdayOfMonth(year, month, weekday, nth) {
  const firstDow = new Date(year, month, 1).getDay()
  let day = 1 + ((weekday - firstDow + 7) % 7) + (nth - 1) * 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  while (day > daysInMonth) day -= 7
  return new Date(year, month, day)
}

// One step forward from `date` under the given recurrence.
function stepRecurrence(date, recurrence) {
  const weeks = WEEK_STEP[recurrence]
  if (weeks) {
    const d = new Date(date)
    d.setDate(d.getDate() + weeks * 7)
    return d
  }
  const months = MONTH_STEP[recurrence]
  if (months) {
    // Keep the weekday and its position in the month (2nd Tuesday → 2nd Tuesday)
    const weekday = date.getDay()
    const nth = Math.ceil(date.getDate() / 7)
    const total = date.getMonth() + months
    return nthWeekdayOfMonth(date.getFullYear() + Math.floor(total / 12), total % 12, weekday, nth)
  }
  // yearly — Feb 29 falls back to Feb 28 in a common year
  const y = date.getFullYear() + 1
  const m = date.getMonth()
  let day = date.getDate()
  if (m === 1 && day === 29 && !isLeap(y)) day = 28
  return new Date(y, m, day)
}

// The next occurrence strictly after today, measured from `anchorStr`
// (the occurrence that just happened). Returns 'YYYY-MM-DD' or null.
export function nextRecurrence(anchorStr, recurrence) {
  if (!isRecurring(recurrence)) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let next = parseLocalDate(anchorStr) || today
  let guard = 0
  do {
    next = stepRecurrence(next, recurrence)
    guard++
  } while (next <= today && guard < 500)
  return toDateStr(next)
}

// A scheduled item's place in the list is decided by its date, so it can't be
// dragged around.
export function isScheduleLocked(item) {
  return !!item && !item.activated && !!item.scheduledDate
}

// Order a list: active, then one-off scheduled, then recurring scheduled, then
// unscheduled. Scheduled items sort by the next date they activate (recurring
// ones most-frequent first, then by date). Active and unscheduled items keep
// their incoming order, e.g. sort_order.
export function groupByActivation(items) {
  const scheduled = items.filter(i => !i.activated && i.scheduledDate)
  const byDate = (a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate))
  return [
    ...items.filter(i => i.activated),
    ...scheduled.filter(i => !isRecurring(i.recurrence)).sort(byDate),
    ...scheduled.filter(i => isRecurring(i.recurrence))
      .sort((a, b) => (recurrenceRank(a.recurrence) - recurrenceRank(b.recurrence)) || byDate(a, b)),
    ...items.filter(i => !i.activated && !i.scheduledDate),
  ]
}

// Star icon used by the Active/Inactive toggle.
export function ActivateIcon({ activated }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ fill: activated ? 'rgba(var(--accent-base-rgb),0.3)' : 'none' }}>
      <polyline points="3,6.8 10,2.6 17,6.8" vectorEffect="non-scaling-stroke"/>
      <line x1="5" y1="7.6" x2="5" y2="14" vectorEffect="non-scaling-stroke"/>
      <line x1="8.33" y1="7.6" x2="8.33" y2="14" vectorEffect="non-scaling-stroke"/>
      <line x1="11.67" y1="7.6" x2="11.67" y2="14" vectorEffect="non-scaling-stroke"/>
      <line x1="15" y1="7.6" x2="15" y2="14" vectorEffect="non-scaling-stroke"/>
      <line x1="3.5" y1="14" x2="16.5" y2="14" vectorEffect="non-scaling-stroke"/>
      <line x1="3" y1="17" x2="17" y2="17" vectorEffect="non-scaling-stroke"/>
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

// A repeating item: a circular arrow, open at the lower right with the head
// coming down the right-hand side.
export function RecurringCalendarIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M15.5 18.06A7 7 0 1 1 19 12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <path d="M16.6 12.6 L19 15 L21.4 12.6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
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
        {scheduled
          ? (isRecurring(item.recurrence) ? <RecurringCalendarIcon size={16}/> : <CalendarIcon size={16}/>)
          : <ActivateIcon activated={active}/>}
        {scheduled
          ? <span className="swipe-action-label schedule">{formatSchedule(item.scheduledDate)}</span>
          : <span className="swipe-action-label active-tag">{active ? 'Displayed' : 'Display'}</span>}
      </div>
    </button>
  )
}
