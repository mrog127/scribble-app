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

  const skin = darkDots
    ? ['background:rgba(255,255,255,0.08)', 'border:1px solid rgba(255,255,255,0.14)',
       'box-shadow:0 6px 24px rgba(0,0,0,0.2)', 'border-radius:16px',
       '-webkit-backdrop-filter:blur(24px) saturate(180%)', 'backdrop-filter:blur(24px) saturate(180%)']
    : [`background:${bg}`, `border:${border}`, 'box-shadow:0 4px 20px rgba(0,0,0,0.10)', 'border-radius:8px']

  return { content: pageScope, skin, darkDots }
}

// Deeper shadow once a long-press drag actually starts.
export const dragLiftShadow = () =>
  isDarkDots() ? '0 10px 32px rgba(0,0,0,0.3)' : '0 8px 24px rgba(0,0,0,0.18)'
