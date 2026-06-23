// 32x32 invisible button (4% black hover) with a 20x20 external-link icon in the
// accent-dark color. Sits at the right end of a link row and opens the link.
export default function OutlinkButton({ onOpen }) {
  return (
    <button
      className="link-outlink-btn"
      aria-label="Open link"
      onPointerDown={e => { e.preventDefault(); e.stopPropagation() }}
      onClick={e => { e.preventDefault(); e.stopPropagation(); onOpen() }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M14 5h5v5" stroke="var(--accent-dark)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
        <path d="M19 5l-8 8" stroke="var(--accent-dark)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
        <path d="M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5" stroke="var(--accent-dark)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
      </svg>
    </button>
  )
}
