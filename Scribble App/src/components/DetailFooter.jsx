// Floating footer for the list-item and (non-edit) note detail pages.
// Left: the Active/Inactive toggle. Right: the project this item lives in.

import { useState, useRef, useEffect } from 'react'
import { CalendarIcon, RecurringCalendarIcon, isRecurring, formatSchedule, isScheduleReached } from './ScheduleBits.jsx'
import CalendarPopup from './CalendarPopup.jsx'

function FolderIcon({ active }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginRight: 8 }}>
      <path
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        stroke="var(--accent-base)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

function CopyIcon({ copied }) {
  if (copied) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M5 13l4 4L19 7" stroke="var(--accent-base)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="#242424" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 15V5a2 2 0 012-2h8" stroke="#242424" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ActivateIcon({ activated }) {
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

export default function DetailFooter({ activated, onToggleActive, projectName, onProjectClick, menuOpen, scheduledDate, onSchedule, onClearSchedule, accent, onCopy, copied, completeButton, scrollable, disabledActive = false, menuItems, allowRecurring = false, recurrence = null }) {
  const [calOpen, setCalOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const btnRef = useRef(null)
  // Three-dot menu, in the slot the copy button used to occupy
  const [dotsOpen, setDotsOpen] = useState(false)
  const dotsRef = useRef(null)

  useEffect(() => {
    if (!dotsOpen) return
    const handler = (e) => { if (dotsRef.current && !dotsRef.current.contains(e.target)) setDotsOpen(false) }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [dotsOpen])
  const canSchedule = typeof onSchedule === 'function'
  const hasSchedule = canSchedule && !!scheduledDate && !activated
  // Once the scheduled day arrives, the item reads as plain "active".
  const reached = hasSchedule && isScheduleReached(scheduledDate)
  const active = activated || reached
  const scheduled = hasSchedule && !reached   // still upcoming → show the date

  const openCalendar = () => {
    if (!canSchedule) return
    // Anchor to the Display button, so the popup lands where it always has —
    // the three-dot menu is only the new way in.
    const r = btnRef.current?.getBoundingClientRect()
    setAnchorRect(r ? { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height } : null)
    setCalOpen(true)
  }

  // The menu schedules an unscheduled item and clears a scheduled one —
  // rescheduling happens by tapping the date on the Display button.
  const scheduleItem = canSchedule && (hasSchedule
    ? { label: 'Clear Schedule', icon: <CalendarIcon size={18}/>, onSelect: () => onClearSchedule() }
    : { label: 'Schedule', icon: <CalendarIcon size={18}/>, onSelect: openCalendar })
  const items = [scheduleItem, ...(menuItems || [])].filter(Boolean)

  return (
    <div className={`detail-footer${scrollable ? ' has-shadow' : ''}`}>
      {completeButton && (
        <div className="detail-footer-complete">{completeButton}</div>
      )}
      <div className="detail-footer-controls">
        <div className="detail-footer-cell left">
          <button
            ref={btnRef}
            className={`project-active-btn${active ? ' on' : ''}${scheduled ? ' scheduled' : ''}${disabledActive ? ' disabled' : ''}`}
            onMouseDown={disabledActive ? undefined : (e) => {
              e.preventDefault()
              // Tapping the date reopens the scheduler; otherwise it toggles Display
              if (scheduled) openCalendar()
              else if (hasSchedule) onClearSchedule()
              else onToggleActive()
            }}
          >
            {scheduled
              ? (isRecurring(recurrence) ? <RecurringCalendarIcon size={20}/> : <CalendarIcon size={20}/>)
              : <ActivateIcon activated={active}/>}
            <span className={scheduled ? 'schedule-date' : undefined}>{scheduled ? formatSchedule(scheduledDate) : (active ? 'Displayed' : 'Display')}</span>
          </button>
        </div>
        <div className="detail-footer-divider"/>
        <div className={`detail-footer-cell right${menuOpen ? ' active' : ''}`}>
          <button
            className="detail-footer-project-btn"
            onMouseDown={e => { e.preventDefault(); onProjectClick && onProjectClick() }}
          >
            <FolderIcon active={menuOpen}/>
            <span className="detail-footer-project">{projectName}</span>
          </button>
        </div>
        {items.length > 0 ? (
          <>
            <div className="detail-footer-divider"/>
            <div className="dots-menu-wrap detail-footer-dots" ref={dotsRef}>
              <div
                className="dots-menu dots-menu-btn"
                onMouseDown={e => { e.preventDefault(); setDotsOpen(v => !v) }}
              >
                <span/><span/><span/>
              </div>
              <div className={`card-context-menu detail-footer-menu${dotsOpen ? ' open' : ''}`}>
                {items.map((item, i) => (
                  <button
                    key={i}
                    className={`card-context-item${item.danger ? ' danger' : ''}`}
                    onMouseDown={e => { e.preventDefault(); setDotsOpen(false); item.onSelect() }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : typeof onCopy === 'function' && (
          <>
            <div className="detail-footer-divider"/>
            <button
              className={`detail-footer-copy-btn${copied ? ' copied' : ''}`}
              aria-label="Copy note"
              onMouseDown={e => { e.preventDefault(); onCopy() }}
            >
              <span className="detail-footer-copy-icon-wrap">
                <span className="detail-footer-copy-flash"/>
                <CopyIcon copied={copied}/>
              </span>
            </button>
          </>
        )}
      </div>

      {calOpen && (
        <CalendarPopup
          anchorRect={anchorRect}
          initialDate={scheduledDate || null}
          accent={accent}
          allowRecurring={allowRecurring}
          initialRecurrence={recurrence}
          onSelect={(date, r) => onSchedule(date, r)}
          onClose={() => setCalOpen(false)}
        />
      )}
    </div>
  )
}
