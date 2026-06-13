// Floating footer for the list-item and (non-edit) note detail pages.
// Left: the Active/Inactive toggle. Right: the project this item lives in.

import { useState, useRef } from 'react'
import { ClockIcon, formatSchedule, useActivatePress } from './ScheduleBits.jsx'
import CalendarPopup from './CalendarPopup.jsx'

function FolderIcon({ active }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginRight: 8 }}>
      <path
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        stroke={active ? 'var(--accent-base)' : '#7A7A7A'} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
      />
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

export default function DetailFooter({ activated, onToggleActive, projectName, onProjectClick, menuOpen, scheduledDate, onSchedule, onClearSchedule, accent }) {
  const [calOpen, setCalOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const btnRef = useRef(null)
  const canSchedule = typeof onSchedule === 'function'
  const scheduled = canSchedule && !!scheduledDate && !activated

  const press = useActivatePress({
    onTap: () => { if (scheduled) onClearSchedule(); else onToggleActive() },
    onLongPress: () => {
      if (!canSchedule) return
      const r = btnRef.current?.getBoundingClientRect()
      setAnchorRect(r ? { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height } : null)
      setCalOpen(true)
    },
  })

  return (
    <div className="detail-footer">
      <div className="detail-footer-cell left">
        <button
          ref={btnRef}
          className={`project-active-btn${activated ? ' on' : ''}${scheduled ? ' scheduled' : ''}`}
          {...press}
        >
          {scheduled ? <ClockIcon size={20}/> : <ActivateIcon activated={activated}/>}
          <span className={scheduled ? 'schedule-date' : undefined}>{scheduled ? formatSchedule(scheduledDate) : (activated ? 'Active' : 'Inactive')}</span>
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
