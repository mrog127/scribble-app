// 16x16, 1pt (non-scaling) stroke icons for three-dot context-menu rows.
// All inherit color via currentColor so they match each row's label.

const base = {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
}
const stroke = {
  stroke: 'currentColor', strokeWidth: 1, vectorEffect: 'non-scaling-stroke',
  strokeLinecap: 'round', strokeLinejoin: 'round',
}

// Open eye — "Show"
export function EyeIcon() {
  return (
    <svg {...base}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" {...stroke}/>
      <circle cx="12" cy="12" r="3" {...stroke}/>
    </svg>
  )
}

// Eye with a slash — "Hide"
export function EyeOffIcon() {
  return (
    <svg {...base}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" {...stroke}/>
      <circle cx="12" cy="12" r="3" {...stroke}/>
      <line x1="3" y1="3" x2="21" y2="21" {...stroke}/>
    </svg>
  )
}

// Pencil — "Rename"
export function EditIcon() {
  return (
    <svg {...base}>
      <path d="M14.5 4.5l5 5L8 21l-5 1 1-5 10.5-10.5z" {...stroke}/>
      <path d="M12.5 6.5l5 5" {...stroke}/>
    </svg>
  )
}

// Two stacked sheets — "Copy"
export function CopyMenuIcon() {
  return (
    <svg {...base}>
      <rect x="9" y="9" width="11" height="11" rx="2" {...stroke}/>
      <path d="M5 15V5a2 2 0 012-2h8" {...stroke}/>
    </svg>
  )
}

// Calendar — "Schedule". Matches the other menu icons' 16x16 / non-scaling
// 1pt stroke so it reads the same weight and colour.
export function CalendarMenuIcon() {
  return (
    <svg {...base}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" {...stroke}/>
      <path d="M3.5 9.5h17" {...stroke}/>
      <path d="M8 3.5v3M16 3.5v3" {...stroke}/>
    </svg>
  )
}

// Archive box — "Archive"
export function ArchiveMenuIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="4" width="18" height="4" rx="1" {...stroke}/>
      <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" {...stroke}/>
      <path d="M10 12h4" {...stroke}/>
    </svg>
  )
}

// Archive box with up arrow — "Unarchive / Retrieve"
export function RetrieveMenuIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="4" width="18" height="4" rx="1" {...stroke}/>
      <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" {...stroke}/>
      <path d="M12 18v-6" {...stroke}/>
      <path d="M9.5 14.5L12 12l2.5 2.5" {...stroke}/>
    </svg>
  )
}

// Trash — "Delete"
export function TrashMenuIcon() {
  return (
    <svg {...base}>
      <polyline points="3 6 5 6 21 6" {...stroke}/>
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" {...stroke}/>
      <path d="M10 11v6M14 11v6" {...stroke}/>
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" {...stroke}/>
    </svg>
  )
}

// Folder — "Move to…"
export function FolderMenuIcon() {
  return (
    <svg {...base}>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" {...stroke}/>
    </svg>
  )
}
