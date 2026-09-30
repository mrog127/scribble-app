// Shared look for a row lifted out of a card while it's being dragged.
//
// The floating copy is portalled into #animation-portal, outside the page and
// the card, so the rules that style a row never reach it on their own. It gets
// wrapped in the page's and the card's classes to bring those back, and takes
// the card's own fill — or, in Dark Dots, the clear glass the menus use.

const isDarkDots = () => ['dark-dots', 'light-dots'].includes(document.documentElement.dataset.theme)

// Wraps `cloneInner` for the portal and returns what to mount and how to skin it.
export function buildDragCloneShell(srcRowEl, cloneInner, fallbackBg = '#F7F6F3') {
  const srcCard = srcRowEl?.closest('.card')
  const cs = srcCard ? getComputedStyle(srcCard) : null
  const bg = cs && cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)'
    ? cs.backgroundColor : fallbackBg
  const border = cs && cs.borderTopWidth !== '0px' ? `1px solid ${cs.borderTopColor}` : 'none'
  const darkDots = isDarkDots()

  cloneInner.style.cssText = `pointer-events:none;background:${darkDots ? 'transparent' : bg};`

  const scope = document.createElement('div')
  if (srcCard) scope.className = srcCard.className
  scope.style.cssText = 'padding:0;margin:0;border:none;background:none;box-shadow:none;overflow:visible;opacity:1;transform:none;'
  scope.appendChild(cloneInner)

  // Only the class the row rules key off: a page's own classes carry fixed
  // positioning and a scroll mask that would swallow the row.
  const srcPage = srcRowEl?.closest('.page, .note-detail-page')
  const pageScope = document.createElement('div')
  pageScope.className = srcPage
    ? [...srcPage.classList].filter(c => c === 'home-page' || c === 'category-page' || c === 'note-detail-page').join(' ')
    : ''
  pageScope.style.cssText = 'padding:0;margin:0;border:none;background:none;box-shadow:none;position:static;inset:auto;width:auto;height:auto;transform:none;opacity:1;overflow:visible;-webkit-mask-image:none;mask-image:none;display:block;'
  pageScope.appendChild(scope)

  // Dots themes: the clear liquid glass — no hairline border, the gradient
  // outline drawn by a stroke layer instead (see .drag-glass-stroke in
  // layout.css), and the white inner highlight folded into the shadow.
  // Card rows in the Dots themes: the floating copy is a pill 8px in from the row
  // on each side and 4px taller than it at top and bottom, fully rounded — the
  // same shape the row takes under its long-press menu (layout.css), so lifting
  // and the menu read as one state. The callers place the copy 4px out from the
  // row on every side with 4px of padding top and bottom; these later
  // declarations pull the sides in, and the row inside slides 8px left so its
  // content stays put.
  const pill = darkDots && srcRowEl && !srcRowEl.closest('.note-detail-page')
  let pillGeom = []
  if (pill) {
    const r = srcRowEl.getBoundingClientRect()
    pillGeom = ['padding:4px 0', 'margin:0 0 0 12px', `width:${r.width - 16}px`, 'border-radius:999px']
    cloneInner.style.marginLeft = '-8px'
    cloneInner.style.width = r.width + 'px'
  }
  if (darkDots) {
    const stroke = makeGlassStroke()
    if (pill) stroke.style.borderRadius = '999px'
    pageScope.insertBefore(stroke, pageScope.firstChild)
  }
  const skin = darkDots
    ? ['background:var(--glass-fill)', 'border:none',
       `box-shadow:0 6px 24px rgba(0,0,0,0.2), ${glassInset()}`, 'border-radius:16px',
       '-webkit-backdrop-filter:blur(10px) saturate(180%)', 'backdrop-filter:blur(10px) saturate(180%)',
       ...pillGeom]
    : [`background:${bg}`, `border:${border}`, 'box-shadow:0 4px 20px rgba(0,0,0,0.10)', 'border-radius:8px']

  return { content: pageScope, skin, darkDots }
}

// The glass's inner highlight: faint in Dark Dots, strong white in Light Dots
const glassInset = () =>
  document.documentElement.dataset.theme === 'light-dots'
    ? 'inset -6px -6px 6px rgba(255,255,255,0.6)'
    : 'inset -6px -6px 4px rgba(255,255,255,0.04)'

// The glass's gradient outline, as an element laid over the floating copy
export function makeGlassStroke() {
  const el = document.createElement('span')
  el.className = 'drag-glass-stroke'
  el.setAttribute('aria-hidden', 'true')
  return el
}

// Deeper shadow once a long-press drag actually starts (keeps the glass's
// inner highlight in the Dots themes).
export const dragLiftShadow = () =>
  isDarkDots() ? `0 10px 32px rgba(0,0,0,0.3), ${glassInset()}` : '0 8px 24px rgba(0,0,0,0.18)'
