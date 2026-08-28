// Tiny pub/sub used to steer a ProjectCard from outside its prop tree.
//
// Search results need to open a specific canvas on a specific content-type tab,
// but ProjectCard owns that tab in local state and only receives { categoryId,
// project }. Threading a prop down through CategoryPage for a one-shot request
// would touch a lot of render paths, so the request is broadcast instead and the
// matching card claims it.

const listeners = new Set()

export function subscribeProjectFocus(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// req: { projectId, type: 'list' | 'note' | 'link' }
export function requestProjectFocus(req) {
  listeners.forEach(fn => fn(req))
}

// The gallery's canvas sublabels reuse the search-result navigation (switch tab,
// reveal, scroll, flash). App owns that routine; it registers it here.
let openInCanvasFn = null
export function setOpenInCanvas(fn) { openInCanvasFn = fn }
export function openInCanvas(req) { if (openInCanvasFn) openInCanvasFn(req) }
