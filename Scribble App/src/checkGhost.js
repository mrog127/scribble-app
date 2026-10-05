// Dots themes: checking off a list item.
//   1. The row's colour flash (0–500ms, played by the caller).
//   2. At the flash's peak, a copy of the row in its hovered look — the clear
//      liquid glass pill — fades in over it and the row itself goes blank.
//   3. The copy grows and fades away on a curve that starts fast and settles.
//   4. The row's empty slot closes up, and only then is the item marked done,
//      so it never visibly slides down the list.
// Other themes keep the old behaviour: commit after the flash, rows slide.

import { buildDragCloneShell } from './dragClone.js'

const DOTS = ['dark-dots', 'light-dots']
const FLASH_MS = 500
// The flash peaks 20% of the way through (100ms) — the glass starts there
const GHOST_START_MS = 100
const FADE_IN_MS = 140
const FADE_OUT_MS = 900
const COLLAPSE_MS = 240

// commit(flip): marks the item done. `flip` says whether the caller should
// animate the list's rows into their new places (only when there was no ghost).
export function runCheckOff(todoRowEl, commit, { collapse = true } = {}) {
  const dots = DOTS.includes(document.documentElement.dataset.theme)
  if (!dots || !todoRowEl) { setTimeout(() => commit(true), FLASH_MS); return }

  setTimeout(() => {
    const rowEl = todoRowEl.closest('.swipe-row') || todoRowEl
    const wrapper = rowEl.parentElement
    let done = false
    const restore = () => {
      if (!wrapper) return
      requestAnimationFrame(() => requestAnimationFrame(() => {
        ;['height', 'overflow', 'transition', 'opacity'].forEach(p => wrapper.style.removeProperty(p))
      }))
    }
    const finish = () => {
      if (done) return
      done = true
      if (!collapse || !wrapper || !wrapper.isConnected) { commit(false); restore(); return }
      // Close the row's empty slot, then mark it done
      wrapper.style.height = wrapper.getBoundingClientRect().height + 'px'
      wrapper.style.overflow = 'hidden'
      requestAnimationFrame(() => requestAnimationFrame(() => {
        wrapper.style.transition = `height ${COLLAPSE_MS}ms ease`
        wrapper.style.height = '0px'
      }))
      setTimeout(() => { commit(false); restore() }, COLLAPSE_MS + 10)
    }
    const played = playCheckGhost(rowEl, {
      onShown: () => { if (wrapper) wrapper.style.opacity = '0' },
      onDone: finish,
    })
    if (!played) { done = true; setTimeout(() => commit(true), FLASH_MS - GHOST_START_MS) }
  }, GHOST_START_MS)
}

function playCheckGhost(rowEl, { onShown, onDone }) {
  if (!rowEl || !rowEl.isConnected) return false
  const appEl = document.getElementById('app')
  const portal = document.getElementById('animation-portal')
  if (!appEl || !portal) return false
  const r = rowEl.getBoundingClientRect()
  if (!r.width || !r.height) return false
  const appRect = appEl.getBoundingClientRect()

  const inner = rowEl.cloneNode(true)
  inner.querySelectorAll('.row-flash-pill').forEach(el => el.remove())
  const { content, skin } = buildDragCloneShell(rowEl, inner)

  const ghost = document.createElement('div')
  ghost.style.cssText = [
    'position:absolute',
    `left:${r.left - appRect.left - 4}px`,
    `top:${r.top - appRect.top - 4}px`,
    `width:${r.width + 8}px`,
    'padding:4px 0',
    'pointer-events:none',
    ...skin,
    'overflow:hidden',
    'z-index:999',
    'opacity:0',
    'transform-origin:center',
  ].join(';')
  ghost.appendChild(content)
  portal.appendChild(ghost)

  const end = () => { ghost.remove(); onDone?.() }
  const fadeIn = ghost.animate(
    [{ opacity: 0, transform: 'scale(1)' }, { opacity: 1, transform: 'scale(1)' }],
    { duration: FADE_IN_MS, easing: 'ease-out', fill: 'forwards' }
  )
  fadeIn.oncancel = end
  fadeIn.onfinish = () => {
    onShown?.()
    // Grow and fade out: fast at first, slowing to a stop
    const out = ghost.animate(
      [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.12)' }],
      { duration: FADE_OUT_MS, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
    )
    out.onfinish = end
    out.oncancel = end
  }
  return true
}
