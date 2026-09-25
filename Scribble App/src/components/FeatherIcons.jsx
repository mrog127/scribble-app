// Feather icons, as used in the Dark Dots designs (24px grid, 2px stroke,
// round caps and joins). The app's own icons are 1px hairlines drawn for
// Paintbrush; these are the heavier set the dark theme is designed around.
//
// Rendered at 20px unless a size is passed. `color` accepts a CSS variable so
// the theme can drive it.

const stroke = (color, strokeWidth) => ({
  stroke: color,
  strokeWidth,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
})

const Svg = ({ size, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">{children}</svg>
)

export function MinimizeIcon({ size = 20, color = 'currentColor', strokeWidth = 2 }) {
  const s = stroke(color, strokeWidth)
  return (
    <Svg size={size}>
      <polyline points="4 14 10 14 10 20" {...s}/>
      <polyline points="20 10 14 10 14 4" {...s}/>
      <line x1="14" y1="10" x2="21" y2="3" {...s}/>
      <line x1="3" y1="21" x2="10" y2="14" {...s}/>
    </Svg>
  )
}

export function MaximizeIcon({ size = 20, color = 'currentColor', strokeWidth = 2 }) {
  const s = stroke(color, strokeWidth)
  return (
    <Svg size={size}>
      <polyline points="15 3 21 3 21 9" {...s}/>
      <polyline points="9 21 3 21 3 15" {...s}/>
      <line x1="21" y1="3" x2="14" y2="10" {...s}/>
      <line x1="3" y1="21" x2="10" y2="14" {...s}/>
    </Svg>
  )
}

export function PlusSquareIcon({ size = 20, color = 'currentColor', strokeWidth = 2 }) {
  const s = stroke(color, strokeWidth)
  return (
    <Svg size={size}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" {...s}/>
      <line x1="12" y1="8" x2="12" y2="16" {...s}/>
      <line x1="8" y1="12" x2="16" y2="12" {...s}/>
    </Svg>
  )
}

export function ListIcon({ size = 20, color = 'currentColor', strokeWidth = 2 }) {
  const s = stroke(color, strokeWidth)
  return (
    <Svg size={size}>
      <line x1="8" y1="6" x2="21" y2="6" {...s}/>
      <line x1="8" y1="12" x2="21" y2="12" {...s}/>
      <line x1="8" y1="18" x2="21" y2="18" {...s}/>
      <line x1="3" y1="6" x2="3.01" y2="6" {...s}/>
      <line x1="3" y1="12" x2="3.01" y2="12" {...s}/>
      <line x1="3" y1="18" x2="3.01" y2="18" {...s}/>
    </Svg>
  )
}

export function FileIcon({ size = 20, color = 'currentColor', strokeWidth = 2 }) {
  const s = stroke(color, strokeWidth)
  return (
    <Svg size={size}>
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" {...s}/>
      <polyline points="13 2 13 9 20 9" {...s}/>
    </Svg>
  )
}

export function LinkIcon({ size = 20, color = 'currentColor', strokeWidth = 2 }) {
  const s = stroke(color, strokeWidth)
  return (
    <Svg size={size}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" {...s}/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" {...s}/>
    </Svg>
  )
}

export function PlusIcon({ size = 20, color = 'currentColor', strokeWidth = 2 }) {
  const s = stroke(color, strokeWidth)
  return (
    <Svg size={size}>
      <line x1="12" y1="5" x2="12" y2="19" {...s}/>
      <line x1="5" y1="12" x2="19" y2="12" {...s}/>
    </Svg>
  )
}
