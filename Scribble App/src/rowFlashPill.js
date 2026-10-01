// Dots themes: every row flash (delete, Display / Stop displaying, check-off…)
// lights up the same 8px-inset pill the row hover uses, instead of washing the
// row's whole full-width wrapper.
//
// The flashes are written all over the components as
//   wrapper.animate([{ background: … }, { background: …, offset }, { background: … }], …)
// so rather than touch every one, this catches background-only animations aimed
// at a card row (its wrapper, the row itself, or anything inside it) and plays
// them on a temporary pill inside the row's .swipe-content instead.
//
// Light Dots also swaps the colour: the Display flash used the easel's "light"
// shade, which in the Dots palettes is the colour mixed toward near-black — muddy
// on a light card. There every non-red flash uses the easel colour itself at up
// to 24%. The red delete flash is kept as is.

const DOTS = ['dark-dots', 'light-dots']
const theme = () => document.documentElement.dataset.theme

const isBackgroundOnly = (frames) =>
  Array.isArray(frames) && frames.length >= 2 &&
  frames.every(f => f && typeof f === 'object' && 'background' in f &&
    Object.keys(f).every(k => k === 'background' || k === 'offset' || k === 'easing'))

function swipeContentFor(el) {
  if (!(el instanceof Element)) return null
  if (el.matches('.swipe-content')) return el
  const inside = el.closest('.swipe-content')
  if (inside) return inside
  // A row wrapper holds exactly one swipe row
  const rows = el.querySelectorAll('.swipe-content')
  return rows.length === 1 ? rows[0] : null
}

const parseRgba = (s) => {
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(s || '')
  return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] } : null
}

export function installRowFlashPill() {
  const original = Element.prototype.animate
  Element.prototype.animate = function (frames, options) {
    if (!DOTS.includes(theme()) || !isBackgroundOnly(frames)) return original.call(this, frames, options)
    const content = swipeContentFor(this)
    if (!content) return original.call(this, frames, options)

    let out = frames
    if (theme() === 'light-dots') {
      const cols = frames.map(f => parseRgba(f.background))
      const isRed = cols.some(c => c && c.r === 178 && c.g === 74 && c.b === 74)
      if (!isRed && cols.every(Boolean)) {
        const peak = Math.max(...cols.map(c => c.a)) || 1
        const cs = getComputedStyle(content)
        const rgb = (cs.getPropertyValue('--cb-base-rgb') || cs.getPropertyValue('--accent-base-rgb') || '').trim()
        if (rgb) out = frames.map((f, i) => ({ ...f, background: `rgba(${rgb}, ${(cols[i].a / peak) * 0.24})` }))
      }
    }

    const pill = document.createElement('span')
    pill.className = 'row-flash-pill'
    pill.setAttribute('aria-hidden', 'true')
    content.appendChild(pill)
    const anim = original.call(pill, out, options)
    const cleanup = () => pill.remove()
    anim.addEventListener('finish', cleanup)
    anim.addEventListener('cancel', cleanup)
    return anim
  }
}
