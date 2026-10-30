import { useRef, useLayoutEffect } from 'react'

// A row of items (each marked data-flip-id) that glide to their new places
// when their order changes. Returns the ref for the row; `key` is the order.
export function useFlipRow(key) {
  const rowRef = useRef(null)
  const lastRef = useRef(new Map())
  useLayoutEffect(() => {
    const row = rowRef.current
    const prev = lastRef.current
    const next = new Map()
    if (!row) { lastRef.current = next; return }
    const items = [...row.querySelectorAll('[data-flip-id]')]
    items.forEach(b => { b.style.transition = 'none'; b.style.transform = '' })
    items.forEach(b => next.set(b.dataset.flipId, b.getBoundingClientRect().left))
    lastRef.current = next
    const moved = items.filter(b => prev.has(b.dataset.flipId) && Math.abs(prev.get(b.dataset.flipId) - next.get(b.dataset.flipId)) > 0.5)
    if (!moved.length) { items.forEach(b => { b.style.transition = '' }); return }
    moved.forEach(b => { b.style.transform = `translateX(${prev.get(b.dataset.flipId) - next.get(b.dataset.flipId)}px)` })
    void row.offsetWidth
    moved.forEach(b => {
      b.style.transition = 'transform 400ms cubic-bezier(0.22, 0.61, 0.36, 1)'
      b.style.transform = ''
    })
    const t = setTimeout(() => items.forEach(b => { b.style.transition = '' }), 450)
    return () => clearTimeout(t)
  }, [key])
  return rowRef
}

// The Gallery's expanded / collapsed view, for things outside the Gallery page
// that follow it (the desktop sidebar's icon row)
export const GALLERY_EXPANDED_EVENT = 'scribble-gallery-expanded'
