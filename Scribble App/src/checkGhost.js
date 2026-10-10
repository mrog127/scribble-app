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
    const clear = (el, props) => props.forEach(p => el.style.removeProperty(p))
    const finish = () => {
      if (done) return
      done = true
      if (!collapse || !wrapper || !wrapper.isConnected || !wrapper.parentNode) {
        commit(false)
        if (wrapper) requestAnimationFrame(() => requestAnimationFrame(() => clear(wrapper, ['opacity'])))
        return
      }
      // The row's slot closes in one smooth motion while everything else in
      // the card — the rows below, the card's own height — moves with it.
      // A stand-in holds the slot; the row itself is marked done at once with
      // no height, so wherever it lands (the checked items at the bottom, or
      // nowhere when completed items are hidden) it never jolts the card.
      const h = wrapper.getBoundingClientRect().height
      const spacer = document.createElement('div')
      spacer.setAttribute('aria-hidden', 'true')
      spacer.style.cssText = `height:${h}px;overflow:hidden;pointer-events:none`
      wrapper.parentNode.insertBefore(spacer, wrapper)
      wrapper.style.height = '0px'
      wrapper.style.overflow = 'hidden'
      wrapper.style.opacity = '0'
      commit(false)
      requestAnimationFrame(() => {
        spacer.offsetHeight   // eslint-disable-line no-unused-expressions
        spacer.style.transition = `height ${COLLAPSE_MS}ms ease`
        spacer.style.height = '0px'
        // Still shown (completed items visible): it opens up at the bottom in
        // step, so the card's height stays put and nothing jumps
        const shown = wrapper.isConnected
        let full = 0
        if (shown) {
          wrapper.style.height = 'auto'
          full = wrapper.getBoundingClientRect().height
          wrapper.style.height = '0px'
          wrapper.offsetHeight   // eslint-disable-line no-unused-expressions
          wrapper.style.transition = `height ${COLLAPSE_MS}ms ease`
          wrapper.style.height = full + 'px'
        }
        setTimeout(() => {
          spacer.remove()
          if (!shown || !wrapper.isConnected) return
          clear(wrapper, ['height', 'overflow'])
          wrapper.style.transition = 'opacity 200ms ease'
          wrapper.style.opacity = '1'
          setTimeout(() => clear(wrapper, ['opacity', 'transition']), 220)
        }, COLLAPSE_MS + 20)
      })
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

  // The row's slot starts closing 200ms after the glass starts to grow and fade;
  // the glass finishes fading on its own
  let doneCalled = false
  const done = () => { if (!doneCalled) { doneCalled = true; onDone?.() } }
  const end = () => { ghost.remove(); done() }
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
    setTimeout(done, 200)   // the slot starts closing 200ms into the glass's grow and fade
  }
  return true
}
