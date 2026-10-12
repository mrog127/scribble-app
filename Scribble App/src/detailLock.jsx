// Lock a detail page open (desktop).
//
// The lock button sits where the old "open in a new window" button was. Locking
// a page makes it the pinned, right-hand panel (App renders it, so it stays put
// across easel switches); the next page opens beside it, to its left. Only one
// page can be locked, so while one is pinned no other page shows the button.
// A locked page hides its Done button; unlocking brings Done back.
import { createContext, useContext } from 'react'
import { useAppContext, sameDetail } from './context/AppContext.jsx'

// 'pinned' inside the pinned page (and anything it opens over itself)
export const DetailSlotContext = createContext('main')

export function useDetailLock(type, id) {
  const slot = useContext(DetailSlotContext)
  const { openDetail, pinnedDetail, pinLocked, setPinLocked, lockDetail } = useAppContext()
  const me = { type, id }
  const isPinned = slot === 'pinned' && sameDetail(pinnedDetail, me)
  const isMain = slot === 'main' && sameDetail(openDetail, me)
  return {
    slot,
    isPinned,
    showLock: isPinned || (isMain && !pinnedDetail),
    locked: isPinned && pinLocked,
    toggleLock: () => { if (isPinned) setPinLocked(l => !l); else lockDetail(me) },
  }
}

// Classes for the page's root element
export const lockPageClass = (lock) =>
  `${lock.slot === 'pinned' ? ' pinned-page' : ''}${lock.locked ? ' locked-page' : ''}`

// beforeLock: save anything mid-edit — locking re-mounts the page as the pinned one
export function DetailLockButton({ lock, beforeLock }) {
  if (!lock.showLock) return null
  return (
    <button
      className={`detail-popout-btn detail-lock-btn${lock.locked ? ' locked' : ''}`}
      aria-label={lock.locked ? 'Unlock page' : 'Lock page'}
      aria-pressed={lock.locked}
      onMouseDown={e => e.preventDefault()}
      onClick={() => {
        if (!lock.isPinned) {
          beforeLock?.()
          if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
        }
        lock.toggleLock()
      }}
    >
      {lock.locked ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="10" rx="2"/>
          <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="10" rx="2"/>
          <path d="M8 11V7a4 4 0 0 1 7.75-1.4"/>
        </svg>
      )}
    </button>
  )
}

// False while App is rendering the open page itself (a page opened beside a
// pinned one) — the card its row is in then leaves it alone.
export const useCardHostsDetail = () => !useAppContext().openDetail?.central
