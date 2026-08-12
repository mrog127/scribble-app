import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArchiveMenuIcon, RetrieveMenuIcon, TrashMenuIcon } from './MenuIcons.jsx'
import { CalendarIcon } from './ScheduleBits.jsx'

/* Gallery (museum) glyph — same drawing as the home tab in TabBar, restyled to
   inherit the menu item's colour. */
export function GalleryMenuIcon() {
  const p = { stroke: 'currentColor', strokeWidth: 1, vectorEffect: 'non-scaling-stroke', strokeLinecap: 'round' }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <polyline points="3,6.8 10,2.6 17,6.8" {...p} strokeLinejoin="round"/>
      <line x1="5" y1="7.6" x2="5" y2="14" {...p}/>
      <line x1="8.33" y1="7.6" x2="8.33" y2="14" {...p}/>
      <line x1="11.67" y1="7.6" x2="11.67" y2="14" {...p}/>
      <line x1="15" y1="7.6" x2="15" y2="14" {...p}/>
      <line x1="3.5" y1="14" x2="16.5" y2="14" {...p}/>
      <line x1="3" y1="17" x2="17" y2="17" {...p}/>
    </svg>
  )
}

export { ArchiveMenuIcon, RetrieveMenuIcon, TrashMenuIcon, CalendarIcon }

/* Row tap handlers register their own pointerup listener at pointerdown, so they
   can't know a long press happened. They check this before acting. */
let rowMenuOpen = false
export function isRowMenuOpen() { return rowMenuOpen }

const LONG_PRESS_MS = 500
const MOVE_TOLERANCE = 8

const EDGE_GAP = 8

/* If the open menu hangs below the bottom edge, scroll its page up until it
   clears by EDGE_GAP. The menu is absolutely positioned against #app and so
   doesn't move with the scroll — we shift its top by the same delta. */
function scrollMenuIntoView(rowEl, setState) {
  const menu = document.querySelector('.row-action-menu')
  if (!menu) return
  const scroller = rowEl.closest('.page') || rowEl.closest('[style*="overflow"]')
  if (!scroller) return
  const limit = Math.min(scroller.getBoundingClientRect().bottom, window.innerHeight)
  const overflow = menu.getBoundingClientRect().bottom - (limit - EDGE_GAP)
  if (overflow <= 0) return
  const room = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
  const delta = Math.min(overflow, Math.max(0, room))
  if (delta <= 0) return
  scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: 'smooth' })
  setState(s => (s ? { ...s, top: s.top - delta } : s))
}

/* The drag hook parks its clone in the animation portal at z-index 999 */
function findDragClone() {
  const portal = document.getElementById('animation-portal')
  if (!portal) return null
  const clones = [...portal.children].filter(el => el.style.zIndex === '999')
  return clones[clones.length - 1] || null
}

/*
  Long-press (500ms, held still) on a row opens an action menu.

  Drag-to-reorder engages first, on its own 250ms hold, so by the time this
  fires the row is usually already lifted into a drag. Rather than cancel that
  drag we park it: hide its clone and un-hide the real row, so the row appears
  to settle under the menu. If the finger then moves, we un-park — clone back,
  menu dismissed — and the drag carries on uninterrupted, so reordering still
  works without lifting off. Releasing without moving leaves the menu up.
*/
export function useRowMenu() {
  const [state, setState] = useState(null)
  const timerRef = useRef(null)
  const stateRef = useRef(null)
  stateRef.current = state

  const close = useCallback(() => {
    rowMenuOpen = false
    const s = stateRef.current
    if (s?.rowEl) s.rowEl.classList.remove('row-lifted', 'row-context-held')
    setState(null)
  }, [])

  // Clear the lift if the component unmounts while a menu is open
  useEffect(() => () => {
    rowMenuOpen = false
    if (stateRef.current?.rowEl) stateRef.current.rowEl.classList.remove('row-lifted', 'row-context-held')
  }, [])

  /* Right-click (desktop): no floating row, no drag. The menu's top-left lands
     on the cursor — or its bottom-left, if opening downward would run off the
     bottom (flip decided after measuring, in RowActionMenu). The row just holds
     its hover highlight until you click away. */
  const context = useCallback((e, buildItems) => {
    const rowEl = e.currentTarget.closest('.swipe-row') || e.currentTarget
    if (!rowEl) return
    const items = (buildItems(rowEl) || []).filter(Boolean)
    if (!items.length) return
    e.preventDefault()
    e.stopPropagation()

    const app = document.getElementById('app')
    if (!app) return
    const appRect = app.getBoundingClientRect()

    rowEl.classList.add('row-context-held')
    rowMenuOpen = true
    setState({
      rowEl,
      items,
      mode: 'context',
      top: e.clientY - appRect.top,
      left: e.clientX - appRect.left,
    })
  }, [])

  const press = useCallback((e, buildItems) => {
    if (e.button !== 0) return   // right-click is handled by `context`
    if (e.target.closest('.checkbox-wrap') || e.target.closest('.link-outlink-btn')) return
    const rowEl = e.currentTarget.closest('.swipe-row') || e.currentTarget
    if (!rowEl) return

    const startX = e.clientX, startY = e.clientY

    const detach = () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', detach)
      document.removeEventListener('pointercancel', detach)
    }

    const onMove = (e2) => {
      if (Math.abs(e2.clientX - startX) > MOVE_TOLERANCE || Math.abs(e2.clientY - startY) > MOVE_TOLERANCE) detach()
    }

    timerRef.current = setTimeout(() => {
      detach()
      const items = (buildItems(rowEl) || []).filter(Boolean)
      if (!items.length) return

      const app = document.getElementById('app')
      if (!app) return

      // Park any in-flight drag so the row reads as settled under the menu
      const clone = findDragClone()
      const wrapper = rowEl.parentElement
      const wrapperWasHidden = wrapper && wrapper.style.opacity === '0'
      if (clone) clone.style.visibility = 'hidden'
      if (wrapperWasHidden) wrapper.style.opacity = ''

      const appRect = app.getBoundingClientRect()
      const r = rowEl.getBoundingClientRect()

      rowEl.classList.add('row-lifted')
      rowMenuOpen = true
      setState({
        rowEl,
        items,
        mode: 'press',
        top: r.bottom - appRect.top + 4,   // 4px under the floating row
        right: appRect.right - r.right,    // right-aligned to the row's right edge
      })

      // Moving again un-parks the drag and drops the menu, so you can go
      // straight from the menu back into reordering without lifting off.
      const resumeDrag = (e2) => {
        if (Math.abs(e2.clientX - startX) <= MOVE_TOLERANCE && Math.abs(e2.clientY - startY) <= MOVE_TOLERANCE) return
        stopResume()
        if (clone) clone.style.visibility = ''
        if (wrapperWasHidden) wrapper.style.opacity = '0'
        close()
      }
      const stopResume = () => {
        document.removeEventListener('pointermove', resumeDrag)
        document.removeEventListener('pointerup', onRelease)
        document.removeEventListener('pointercancel', stopResume)
      }
      // On release, bring the whole menu into view if it hangs off the bottom
      const onRelease = () => { stopResume(); scrollMenuIntoView(rowEl, setState) }
      document.addEventListener('pointermove', resumeDrag)
      document.addEventListener('pointerup', onRelease)
      document.addEventListener('pointercancel', stopResume)
    }, LONG_PRESS_MS)

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', detach)
    document.addEventListener('pointercancel', detach)
  }, [close])

  return { state, press, context, close }
}

export function RowActionMenu({ state, onClose }) {
  const [open, setOpen] = useState(false)
  const [flip, setFlip] = useState({ x: 0, y: 0 })
  const menuRef = useRef(null)

  useEffect(() => {
    if (!state) { setOpen(false); return }
    const id = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(id)
  }, [state])

  /* Cursor-anchored menus default to top-left-on-cursor and flip per axis if
     that would run them off screen: past the bottom → bottom edge on the
     cursor; past the right → right edge on the cursor. A flip is skipped if it
     would only push the menu off the opposite edge instead. Measured from the
     rendered menu rather than estimated from item count. */
  useLayoutEffect(() => {
    setFlip({ x: 0, y: 0 })
    if (!state || state.mode !== 'context') return
    const el = menuRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let y = 0, x = 0
    if (r.bottom > window.innerHeight - EDGE_GAP && r.top - r.height >= EDGE_GAP) y = r.height
    if (r.right > window.innerWidth - EDGE_GAP && r.left - r.width >= EDGE_GAP) x = r.width
    if (x || y) setFlip({ x, y })
  }, [state])

  if (!state) return null
  const app = document.getElementById('app')
  if (!app) return null

  const pos = state.mode === 'context'
    ? { top: state.top - flip.y, left: state.left - flip.x }
    : { top: state.top, right: state.right }

  return createPortal(
    <>
      <div className="row-menu-overlay" onPointerDown={onClose} onContextMenu={e => { e.preventDefault(); onClose() }}/>
      <div
        ref={menuRef}
        className={`card-context-menu row-action-menu${state.mode === 'context' ? ' cursor-anchored' : ''}${open ? ' open' : ''}`}
        style={pos}
      >
        {state.items.map((item, i) => (
          <button
            key={i}
            className={`card-context-item${item.danger ? ' danger' : ''}`}
            onMouseDown={e => { e.preventDefault(); onClose(); item.onSelect() }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </>,
    app
  )
}
