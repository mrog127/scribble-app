// Floating footer for the list-item and (non-edit) note detail pages.
// Left: the Active/Inactive toggle. Right: the project this item lives in.

import { useState, useRef } from 'react'
import { CalendarIcon, formatSchedule, useActivatePress, isScheduleReached } from './ScheduleBits.jsx'
import CalendarPopup from './CalendarPopup.jsx'

function FolderIcon({ active }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginRight: 8 }}>
      <path
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        stroke={active ? 'var(--accent-base)' : 'var(--accent-dark)'} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <polygon
        points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
        stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
        style={{ fill: activated ? 'rgba(var(--accent-base-rgb),0.3)' : 'none' }}
      />
    </svg>
  )
}

export default function DetailFooter({ activated, onToggleActive, projectName, onProjectClick, menuOpen, scheduledDate, onSchedule, onClearSchedule, accent, onCopy, copied, completeButton, scrollable }) {
  const [calOpen, setCalOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const btnRef = useRef(null)
  const canSchedule = typeof onSchedule === 'function'
  const hasSchedule = canSchedule && !!scheduledDate && !activated
  // Once the scheduled day arrives, the item reads as plain "active".
  const reached = hasSchedule && isScheduleReached(scheduledDate)
  const active = activated || reached
  const scheduled = hasSchedule && !reached   // still upcoming → show the date

  const press = useActivatePress({
    onTap: () => { if (hasSchedule) onClearSchedule(); else onToggleActive() },
    onLongPress: () => {
      if (!canSchedule) return
      const r = btnRef.current?.getBoundingClientRect()
      setAnchorRect(r ? { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height } : null)
      setCalOpen(true)
    },
  })

  return (
    <div className={`detail-footer${scrollable ? ' has-shadow' : ''}`}>
      {completeButton && (
        <div className="detail-footer-complete">{completeButton}</div>
      )}
      <div className="detail-footer-controls">
        <div className="detail-footer-cell left">
          <button
            ref={btnRef}
            className={`project-active-btn${active ? ' on' : ''}${scheduled ? ' scheduled' : ''}`}
            {...press}
          >
            {scheduled ? <CalendarIcon size={20}/> : <ActivateIcon activated={active}/>}
            <span className={scheduled ? 'schedule-date' : undefined}>{scheduled ? formatSchedule(scheduledDate) : (active ? 'Active' : 'Inactive')}</span>
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
        {typeof onCopy === 'function' && (
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
          onSelect={(date) => onSchedule(date)}
          onClose={() => setCalOpen(false)}
        />
      )}
    </div>
  )
}
