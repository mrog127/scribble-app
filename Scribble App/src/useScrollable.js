import { useState, useEffect } from 'react'

// Returns true while the given scroll container's content overflows (i.e. is
// scrollable). Re-checks on container/content resize, window resize, and on the
// provided deps. Pass either a ref or a function that returns the element.
export function useScrollable(getEl, deps = []) {
  const [scrollable, setScrollable] = useState(false)

  useEffect(() => {
    const el = typeof getEl === 'function' ? getEl() : getEl?.current
    if (!el) { setScrollable(false); return }

    const check = () => setScrollable(el.scrollHeight > el.clientHeight + 1)

    const ro = new ResizeObserver(check)
    ro.observe(el)
    // Observe direct children so content growth (new cards / paragraphs) re-checks
    Array.from(el.children).forEach(c => ro.observe(c))

    window.addEventListener('resize', check)
    check()
    // Re-check after layout / animations settle
    const t = setTimeout(check, 80)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', check)
      clearTimeout(t)
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  return scrollable
}
