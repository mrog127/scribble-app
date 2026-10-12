// Menus scroll their own lists — never the page behind them.
//
// On iOS a drag inside a popup (Move to, Save to and its search results, the
// Easels menus, Schedule…) chains on to whatever is behind it once the list
// runs out of room: at the top or bottom of the list, or when the list doesn't
// overflow at all, the page (or, with the keyboard up, the whole window) moves
// instead. While a vertical drag is inside one of these, it's held to the
// nearest list that can actually scroll that way; anything else is stopped.
// Horizontal drags (the canvas tabs, swiping between easels) and drags in a
// text field are left alone.
const MENUS = '.save-to-panel, .move-to-overlay, .cal-overlay, .card-context-menu'

let drag = null

const scrollerFor = (el, stop) => {
  for (; el && el !== stop; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el
  }
  return null
}

document.addEventListener('touchstart', (e) => {
  drag = null
  const t = e.target instanceof Element ? e.target : null
  if (!t || e.touches.length !== 1) return
  const menu = t.closest(MENUS)
  if (!menu) return
  if (t.closest('input, textarea, [contenteditable="true"]')) return
  drag = {
    x: e.touches[0].clientX, y: e.touches[0].clientY,
    scroller: scrollerFor(t, menu.parentElement),
    axis: null,
  }
}, { passive: true, capture: true })

document.addEventListener('touchmove', (e) => {
  if (!drag || e.touches.length !== 1) return
  const x = e.touches[0].clientX, y = e.touches[0].clientY
  const dx = x - drag.x, dy = y - drag.y
  // iOS picks what a drag scrolls on its very first move, so decide right away
  if (!drag.axis) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
  if (drag.axis !== 'y') return
  drag.x = x; drag.y = y
  const sc = drag.scroller
  const stop = !sc ||
    (dy > 0 && sc.scrollTop <= 0) ||                                   // pulling down at the top
    (dy < 0 && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1)   // pushing up at the bottom
  if (stop && e.cancelable) e.preventDefault()
}, { passive: false, capture: true })

document.addEventListener('touchend', () => { drag = null }, { capture: true })
document.addEventListener('touchcancel', () => { drag = null }, { capture: true })
