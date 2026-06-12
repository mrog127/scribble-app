// Floating footer for the list-item and (non-edit) note detail pages.
// Left: the Active/Inactive toggle. Right: the project this item lives in.

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

export default function DetailFooter({ activated, onToggleActive, projectName, onProjectClick, menuOpen }) {
  return (
    <div className="detail-footer">
      <div className="detail-footer-cell left">
        <button
          className={`project-active-btn${activated ? ' on' : ''}`}
          onMouseDown={e => { e.preventDefault(); onToggleActive() }}
        >
          <ActivateIcon activated={activated}/>
          <span>{activated ? 'Active' : 'Inactive'}</span>
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
    </div>
  )
}
