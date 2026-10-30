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

// The Easels menu in Save to / Move to rises out past the card it sits in, over
// the canvas list and the page. iOS hands a drag there to one of the scrollers
// underneath instead of the menu, so the menu never scrolls. Its scrolling is
// driven here from the touches instead (with a flick's momentum), and iOS's own
// scroll is stopped for the whole drag.
// The same goes for the Easel list that Save to now shows in place of its
// canvases (Easel button → the list of Easels): iOS sent drags there to the
// page behind.
const MANUAL = '.dest-easels-menu, .save-to-panel .dest-view-easels .dest-canvas-list, .move-to-overlay .dest-view-easels .dest-canvas-list'
let fling = 0
const stopFling = () => { if (fling) { cancelAnimationFrame(fling); fling = 0 } }
const startFling = (el, v) => {   // v in px per ms, positive = content moves down
  let last = performance.now()
  const step = (now) => {
    const dt = Math.min(32, now - last)
    last = now
    el.scrollTop -= v * dt
    v *= Math.pow(0.95, dt / 16)
    const atEnd = el.scrollTop <= 0 || el.scrollTop + el.clientHeight >= el.scrollHeight - 1
    fling = Math.abs(v) > 0.02 && !atEnd ? requestAnimationFrame(step) : 0
  }
  fling = requestAnimationFrame(step)
}

const scrollerFor = (el, stop) => {
  for (; el && el !== stop; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el
  }
  return null
}

document.addEventListener('touchstart', (e) => {
  drag = null
  stopFling()
  const t = e.target instanceof Element ? e.target : null
  if (!t || e.touches.length !== 1) return
  const menu = t.closest(MENUS)
  if (!menu) return
  if (t.closest('input, textarea, [contenteditable="true"]')) return
  drag = {
    x: e.touches[0].clientX, y: e.touches[0].clientY,
    scroller: scrollerFor(t, menu.parentElement),
    axis: null,
    manual: t.closest(MANUAL),
    v: 0, time: e.timeStamp,
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
  if (drag.manual) {
    if (e.cancelable) e.preventDefault()
    drag.manual.scrollTop -= dy
    const dt = Math.max(1, e.timeStamp - drag.time)
    drag.v = 0.8 * (dy / dt) + 0.2 * drag.v
    drag.time = e.timeStamp
    return
  }
  const sc = drag.scroller
  const stop = !sc ||
    (dy > 0 && sc.scrollTop <= 0) ||                                   // pulling down at the top
    (dy < 0 && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1)   // pushing up at the bottom
  if (stop && e.cancelable) e.preventDefault()
}, { passive: false, capture: true })

document.addEventListener('touchend', (e) => {
  // A flick carries on; a drag that stopped before lifting doesn't
  if (drag?.manual && drag.axis === 'y' && e.timeStamp - drag.time < 80 && Math.abs(drag.v) > 0.1) {
    startFling(drag.manual, drag.v)
  }
  drag = null
}, { capture: true })
document.addEventListener('touchcancel', () => { drag = null }, { capture: true })
