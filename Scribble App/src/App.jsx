import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { ACCENT_COLORS, getCategoryAccent, getHomeAccent, mixHex } from './theme.js'
import { useTheme } from './useTheme.js'
import ActivePage from './components/ActivePage.jsx'
import CategoryPage from './components/CategoryPage.jsx'
import TabBar from './components/TabBar.jsx'
import AuthScreen from './components/AuthScreen.jsx'
import MenuPage, { useCategoryDragReorder } from './components/MenuPage.jsx'
import ArchiveAttachmentsModal from './components/ArchiveAttachmentsModal.jsx'
import DeleteConfirmModal from './components/DeleteConfirmModal.jsx'
import MoveAttachmentsModal from './components/MoveAttachmentsModal.jsx'
import CardTabs from './components/CardTabs.jsx'
import { AppProvider, useAppContext } from './context/AppContext.jsx'
import { requestProjectFocus, setOpenInCanvas } from './searchFocus.js'
import AddCanvasRow from './components/AddCanvasRow.jsx'
import { NoteDetailPage } from './components/NoteCard.jsx'
import { createPortal } from 'react-dom'
import { subscribeGalleryPulse, setOrderHold } from './galleryPulse.js'
import { registerKeyboardKeeper, keepKeyboardAlive } from './keyboardKeeper.js'
import { pasteInto } from './clipboard.js'
import { ListIcon as FeatherListIcon, FileIcon as FeatherFileIcon, LinkIcon as FeatherLinkIcon } from './components/FeatherIcons.jsx'

// Wraps every case-insensitive occurrence of `q` in `text` so the matched span
// can be tinted. Returns an array of strings and <mark> nodes.
function highlightMatch(text, q, tint) {
  const s = String(text || '')
  const needle = (q || '').trim().toLowerCase()
  if (!needle) return s
  const hay = s.toLowerCase()
  const out = []
  let from = 0
  let at = hay.indexOf(needle)
  while (at !== -1) {
    if (at > from) out.push(s.slice(from, at))
    out.push(
      <mark key={`${at}`} className="search-hit" style={{ background: tint }}>
        {s.slice(at, at + needle.length)}
      </mark>
    )
    from = at + needle.length
    at = hay.indexOf(needle, from)
  }
  if (from < s.length) out.push(s.slice(from))
  return out
}
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { useScrollable } from './useScrollable.js'
import GalleryDecoration from './assets/gallery-page-decoration.svg?react'
import { isTileDragging } from './components/ProjectCard.jsx'
import { isCardDragging } from './components/useCardDragReorder.js'

// Pull-to-refresh, iOS style: pulling down at the top of the active page drags
// the whole page down with rubber-band resistance, revealing the spinner in the
// gap above it. Crossing the threshold starts the refresh (the spinner starts
// spinning); letting go springs the page back up to a resting gap that holds the
// spinner until the refresh finishes, then the page springs home.
// Drives the page and spinner directly through the DOM for smoothness.
function usePullToRefresh(onRefresh) {
  const spinnerRef = useRef(null)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    const app = document.getElementById('app')
    if (!app) return
    const THRESHOLD = 56   // pulled distance (after resistance) that triggers a refresh
    const HOLD = 56        // gap the page rests at while refreshing
    const RANGE = 240      // rubber band: the page can never be pulled past this
    const SPINNER = 28
    const SPRING = 'transform 450ms cubic-bezier(0.2, 0.9, 0.3, 1.12)'
    const s = { active: false, startY: 0, page: null, target: null, pull: 0, refreshing: false, holding: false, fingerDown: false, doneWaiting: false }

    // iOS's rubber-band curve: close to 1:1 at first, stiffening the further you go
    const band = (dy) => RANGE * (1 - 1 / (dy * 0.55 / RANGE + 1))

    // The page the gesture is actually over. The Settings sheet sits on top of the
    // homepage and scrolls its own .page, so its scroll position is what matters there.
    const pageFor = (target) =>
      target.closest('.settings-sheet')?.querySelector('.page') ||
      document.querySelector('#app .page:not(.page-exiting)')

    // True if anything the gesture is inside is scrolled down at all — not just
    // the page. Settings (and other pages) can scroll an inner box rather than
    // .page itself, which stays at scrollTop 0 and would read as "at the top".
    const scrolledAbove = (target, page) => {
      for (let el = target; el && el !== app; el = el.parentElement) {
        if (el.scrollTop > 0) return true
      }
      return !!page && page.scrollTop > 0
    }

    // Place the page and the spinner for a pulled distance. The spinner rides in
    // the middle of the gap opening above the page, fading and turning in as it comes.
    const paint = (pull, animate) => {
      s.pull = pull
      const page = s.page
      const el = spinnerRef.current
      const t = animate ? SPRING : 'none'
      if (page) {
        page.style.transition = t
        page.style.transform = pull > 0 ? `translateY(${pull}px)` : ''
      }
      if (el) {
        const y = (Math.min(pull, RANGE) - SPINNER) / 2 - 8
        el.style.transition = animate ? `${SPRING}, opacity 250ms ease` : 'none'
        el.style.opacity = s.refreshing ? '1' : String(Math.min(1, pull / THRESHOLD))
        el.style.transform = `translateX(-50%) translateY(${y}px)` + (s.refreshing ? '' : ` rotate(${pull * 4}deg)`)
      }
    }
    const settle = () => {
      const page = s.page
      paint(0, true)
      const el = spinnerRef.current
      if (el) el.style.opacity = '0'
      setTimeout(() => {
        if (s.pull !== 0) return
        if (page) { page.style.transition = ''; page.style.transform = '' }
        if (el) { el.style.transition = ''; el.classList.remove('spinning') }
        if (!s.refreshing && !s.active) s.page = null
      }, 450)
    }
    const finish = () => {
      s.refreshing = false; s.holding = false
      if (s.fingerDown) { s.doneWaiting = true; return }   // let go first
      settle()
    }
    const startRefresh = () => {
      if (s.refreshing) return
      s.refreshing = true
      const el = spinnerRef.current
      if (el) { el.classList.add('spinning'); el.style.opacity = '1' }
      if (navigator.vibrate) navigator.vibrate(8)
      const done = () => setTimeout(finish, 500)
      Promise.resolve(onRefreshRef.current && onRefreshRef.current()).then(done, done)
    }
    const release = () => {
      s.active = false; s.fingerDown = false
      if (s.doneWaiting) { s.doneWaiting = false; settle(); return }
      if (s.refreshing) { s.holding = true; paint(HOLD, true) }
      else settle()
    }

    const onStart = (e) => {
      if (s.refreshing || s.pull > 0) return
      if (e.target.closest('.note-detail-page') || e.target.closest('.footer') || e.target.closest('.save-to-panel')) return
      const page = pageFor(e.target)
      if (!page || scrolledAbove(e.target, page)) return
      s.page = page; s.target = e.target; s.startY = e.touches[0].clientY; s.active = true; s.fingerDown = true
    }
    const onMove = (e) => {
      if (!s.active) return
      if (!s.page || (s.pull === 0 && scrolledAbove(s.target, s.page))) { s.active = false; s.fingerDown = false; return }
      const dy = e.touches[0].clientY - s.startY
      if (dy <= 0) { if (s.pull) paint(0, false); return }
      e.preventDefault()
      const pull = band(dy)
      paint(pull, false)
      if (pull >= THRESHOLD) startRefresh()
    }
    const onEnd = () => {
      if (!s.active) return
      release()
    }

    // Desktop trackpad: a pull only counts after the page has come to REST at the top
    // (no wheel activity for 300ms while at scrollTop 0), then a deliberate scroll-up.
    // Momentum from scrolling up into the top keeps resetting the idle timer, so it
    // never arms — preventing accidental refreshes just from reaching the top.
    let wheelDy = 0, wheelTimer = null, idleTimer = null, topIdle = true, wheelPage = null, wheelTarget = null
    const scheduleIdle = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        if (s.refreshing) return
        const p = wheelPage || document.querySelector('#app .page:not(.page-exiting)')
        if (p && !scrolledAbove(wheelTarget || p, p)) topIdle = true
      }, 300)
    }
    const onWheel = (e) => {
      if (s.refreshing || s.active) return
      if (e.target.closest('.note-detail-page') || e.target.closest('.footer') || e.target.closest('.save-to-panel')) return
      const page = pageFor(e.target)
      if (!page) return
      wheelPage = page; wheelTarget = e.target
      const atTop = !scrolledAbove(e.target, page)
      if (!atTop) topIdle = false
      const pulling = atTop && topIdle && e.deltaY < 0 && Math.abs(e.deltaY) >= Math.abs(e.deltaX)
      if (!pulling) {
        if (wheelDy > 0) { wheelDy = 0; settle() }
        scheduleIdle()
        return
      }
      e.preventDefault()
      s.page = page; s.fingerDown = true
      wheelDy += -e.deltaY
      const pull = band(wheelDy)
      paint(pull, false)
      if (pull >= THRESHOLD) startRefresh()
      clearTimeout(wheelTimer)
      wheelTimer = setTimeout(() => {
        wheelDy = 0
        release()
        topIdle = false   // require settling at the top again before the next pull
        scheduleIdle()
      }, 150)
    }

    app.addEventListener('touchstart', onStart, { passive: true })
    app.addEventListener('touchmove', onMove, { passive: false })
    app.addEventListener('touchend', onEnd)
    app.addEventListener('touchcancel', onEnd)
    app.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      app.removeEventListener('touchstart', onStart)
      app.removeEventListener('touchmove', onMove)
      app.removeEventListener('touchend', onEnd)
      app.removeEventListener('touchcancel', onEnd)
      app.removeEventListener('wheel', onWheel)
      clearTimeout(wheelTimer)
      clearTimeout(idleTimer)
    }
  }, [])

  return spinnerRef
}

function AppInner() {
  const {
    categories, activeTodos, activeNotes, loading,
    addActiveTodo, addActiveNote, toggleActiveTodo, deleteActiveTodo, deleteActiveNote, updateActiveNote, reorderActiveTodos, reorderActiveNotes,
    addProjectTodo, addProjectNote, addProjectLink,
    setOpenDetail, setAutoEditNoteId, refresh,
    registerComposeHandler, addCategory, reorderCategories,
    openDetail, updateProjectNote, toggleProjectNoteActivated, setProjectNoteScheduled,
  } = useAppContext()
  const pullSpinnerRef = usePullToRefresh(refresh)

  // (see goToNewNote) Once the new note's page has closed, flash its row
  const prevOpenDetailRef = useRef(null)
  useEffect(() => {
    const prev = prevOpenDetailRef.current
    prevOpenDetailRef.current = openDetail
    const pending = newNoteNavRef.current
    if (!pending || openDetail || prev?.type !== 'note') return
    if (String(prev.id) !== String(pending.holder.id)) return
    newNoteNavRef.current = null
    // Already on the right page (goToNewNote went there): just flash the row —
    // or, if it hasn't been found yet, let it flash as soon as it is
    pending.closed = true
    if (pending.flash) setTimeout(pending.flash, 150)
  }, [openDetail])
  const openSearchResultRef = useRef(null)

  // A note opened from the footer (a new note) usually opens on the page it lands
  // on — its canvas card or the Gallery's notes card renders the note page. When
  // nothing on screen is showing that note (e.g. a new, not-displayed note added
  // from the Gallery or Settings), App opens it itself so it never silently fails.
  const [orphanNoteId, setOrphanNoteId] = useState(null)
  useEffect(() => {
    if (openDetail?.type !== 'note') { setOrphanNoteId(null); return }
    const id = openDetail.id
    const t = setTimeout(() => {
      if (!document.querySelector('#app > .note-detail-page')) setOrphanNoteId(id)
    }, 150)
    return () => clearTimeout(t)
  }, [openDetail])
  // If the note's own page turns up after all (its canvas finished mounting),
  // step aside so there's only ever one note page
  useEffect(() => {
    if (orphanNoteId == null) return
    const iv = setInterval(() => {
      if (document.querySelectorAll('#app > .note-detail-page').length > 1) setOrphanNoteId(null)
    }, 200)
    return () => clearInterval(iv)
  }, [orphanNoteId])
  let orphanNote = null
  if (orphanNoteId != null && openDetail?.type === 'note' && String(openDetail.id) === String(orphanNoteId)) {
    outer:
    for (const cat of categories) {
      for (const p of cat.projects) {
        const n = p.notes.find(x => String(x.id) === String(orphanNoteId))
        if (n) { orphanNote = { note: { ...n, categoryId: cat.id }, cat, proj: p }; break outer }
      }
    }
  }
  const categoryIds = categories.map(c => c.id)
  const [activeTab, setActiveTab] = useState('star')
  const [toolbarType, setToolbarType] = useState('list')
  const [inputFocused, setInputFocused] = useState(false)
  const [toolbarFadedIn, setToolbarFadedIn] = useState(false)
  // Mobile = below the 1000px desktop breakpoint. Drives the floating action bar.
  const [isMobileView, setIsMobileView] = useState(
    () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 1000px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1000px)')
    const onChange = () => setIsMobileView(!mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Search — the control bar's trailing circle expands the pill into a search field
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef(null)

  // Re-render the whole app when the theme changes, so accent colours (which are
  // read at render time) refresh with it.
  const theme = useTheme()
  const dotsTheme = theme === 'dark-dots' || theme === 'light-dots'
  // The content type picked on the resting Add item pill (Dots themes)
  const pendingTypeRef = useRef(null)
  // Dark Dots draws the add box's content-type tabs with the canvas card tabs'
  // Feather icons (2px, selected one at 24px)
  const featherTabs = ['dark-dots', 'light-dots'].includes(theme)

  // Settings sheet — mobile only; desktop still reaches Settings via the nav tab
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsMounted, setSettingsMounted] = useState(false)
  const [settingsIn, setSettingsIn] = useState(false)   // drives the .open class
  useEffect(() => {
    if (settingsOpen) {
      // Mount offscreen first, then flip .open on a later frame — applying both in
      // one commit gives the browser no start value to transition from.
      setSettingsMounted(true)
      let inner = 0
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setSettingsIn(true))
      })
      return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner) }
    }
    setSettingsIn(false)
    // Keep it mounted through the slide-down so the exit animation can play
    const t = setTimeout(() => setSettingsMounted(false), 350)
    return () => clearTimeout(t)
  }, [settingsOpen])

  // Activation celebration on the gallery control: two orbit rotations (833ms
  // each), then a short flash, then back to no animation at all.
  const [galleryPulse, setGalleryPulse] = useState('')      // '' | 'spin' | 'flash'
  const [pulseAccent, setPulseAccent] = useState(null)
  const pulseTimers = useRef([])
  const categoriesForPulse = useRef(categories)
  categoriesForPulse.current = categories
  // A copy of the activated row flies to the gallery control, morphing into its
  // shape while its contents fade. The original stays put (the card also freezes
  // its order), so the list is undisturbed for the whole sequence.
  const FLOAT_MS = 500
  const flyRowToGallery = useCallback((itemId) => {
    const app = document.getElementById('app')
    const portal = document.getElementById('animation-portal-under')
    const row = document.querySelector(`.swipe-row[data-swipe-id="${itemId}"]`)
    // Both controls exist at every width — the inactive one is just display:none,
    // and would hand back a zero rect. Take the first that's actually laid out.
    const target = ['.mbar-gallery', '.tab-home']
      .map(sel => document.querySelector(sel))
      .find(el => el && el.offsetParent !== null && el.getBoundingClientRect().width > 0)
    if (!app || !portal || !row || !target) return false

    const appR = app.getBoundingClientRect()
    const from = row.getBoundingClientRect()
    const to = target.getBoundingClientRect()
    const targetRadius = getComputedStyle(target).borderRadius
    // Dark Dots: the copy is the row's own card grey, with no outline — not
    // Paintbrush's cream box
    const darkDots = ['dark-dots', 'light-dots'].includes(document.documentElement.dataset.theme)
    const cardBg = darkDots ? getComputedStyle(row.closest('.card') || row).backgroundColor : null
    const cloneBg = darkDots ? (cardBg && cardBg !== 'rgba(0, 0, 0, 0)' ? cardBg : '#2B2B2B') : '#F7F6F3'

    const clone = document.createElement('div')
    clone.style.cssText = [
      'position:absolute',
      `left:${from.left - appR.left}px`,
      `top:${from.top - appR.top}px`,
      `width:${from.width}px`,
      `height:${from.height}px`,
      'overflow:hidden',
      'pointer-events:none',
      `background:${cloneBg}`,
      darkDots ? 'border:none' : 'border:1px solid #C2C1BF',
      darkDots ? 'border-radius:32px' : 'border-radius:8px',
      'box-sizing:border-box',
      'opacity:1',
      `transition:left ${FLOAT_MS}ms ease, top ${FLOAT_MS}ms ease, width ${FLOAT_MS}ms ease, height ${FLOAT_MS}ms ease, border-radius ${FLOAT_MS}ms ease, opacity ${FLOAT_MS}ms ease`,
    ].join(';')

    const inner = row.cloneNode(true)
    inner.style.transition = `opacity ${Math.round(FLOAT_MS * 0.7)}ms ease`
    inner.style.opacity = '1'
    clone.appendChild(inner)
    portal.appendChild(clone)

    requestAnimationFrame(() => {
      clone.style.left = `${to.left - appR.left}px`
      clone.style.top = `${to.top - appR.top}px`
      clone.style.width = `${to.width}px`
      clone.style.height = `${to.height}px`
      clone.style.borderRadius = targetRadius
      clone.style.opacity = '0.5'   // arrives at 50%
      inner.style.opacity = '0'
    })
    setTimeout(() => clone.remove(), FLOAT_MS + 60)
    return true
  }, [])

  useEffect(() => subscribeGalleryPulse((categoryId, itemId) => {
    const idx = categoriesForPulse.current.findIndex(c => c.id === categoryId)
    pulseTimers.current.forEach(clearTimeout)
    pulseTimers.current = []
    setPulseAccent(idx >= 0 ? getCategoryAccent(idx) : null)

    // Cards hold their current order until the whole sequence finishes, so the
    // row only slides to its new slot at the very end.
    setOrderHold(true)
    const flew = flyRowToGallery(itemId)
    const startAt = flew ? FLOAT_MS : 0

    // 'float' runs during the fly-over so the desktop selector box can fade in
    // with it; then one rotation (555ms) + a quarter-rotation fade (139ms), a
    // beat at rest, and the 500ms-in / 500ms-out flash.
    setGalleryPulse('float')
    pulseTimers.current.push(setTimeout(() => setGalleryPulse('spin'), startAt))
    pulseTimers.current.push(setTimeout(() => {
      setGalleryPulse('flash')
      setOrderHold(false)      // list re-sorts as the flash begins
    }, startAt + 794))
    pulseTimers.current.push(setTimeout(() => {
      setGalleryPulse('')
      setPulseAccent(null)
    }, startAt + 1804))
  }), [flyRowToGallery])
  useEffect(() => () => pulseTimers.current.forEach(clearTimeout), [])

  const pulseVars = pulseAccent ? {
    '--pulse-base': pulseAccent.base,
    '--pulse-light': pulseAccent.light,
    '--pulse-dark': pulseAccent.dark,
    '--pulse-base-rgb': pulseAccent.baseRgb,
  } : undefined

  // Long-press page menu hanging off the gallery/easel circle
  const [pageMenuOpen, setPageMenuOpen] = useState(false)
  // "Add new easel" row at the foot of the page menu
  const [addEaselOpen, setAddEaselOpen] = useState(false)
  const [addEaselName, setAddEaselName] = useState('')
  const addEaselRef = useRef(null)
  // Press-and-hold an easel to drag it — the same reorder the Easels page uses
  const easelListRef = useRef(null)
  const { onDragPointerDown: onEaselDrag } = useCategoryDragReorder(easelListRef, categories, reorderCategories, { ghostClass: 'easel-drag-ghost' })
  // A drag shouldn't also navigate: only a quick, still press counts as a tap
  const easelTap = useRef({})
  const closeAddEasel = useCallback(() => { setAddEaselOpen(false); setAddEaselName('') }, [])
  const submitAddEasel = useCallback(() => {
    const name = addEaselName.trim()
    if (!name) return
    const id = addCategory(name)
    closeAddEasel()
    setPageMenuOpen(false)
    if (id) handleTabChangeRef.current?.(id)
  }, [addEaselName, addCategory, closeAddEasel])
  const pageMenuTimerRef = useRef(null)
  const pageMenuFiredRef = useRef(false)
  const pageMenuWrapRef = useRef(null)

  const startPageMenuPress = useCallback(() => {
    pageMenuFiredRef.current = false
    clearTimeout(pageMenuTimerRef.current)
    pageMenuTimerRef.current = setTimeout(() => {
      pageMenuFiredRef.current = true
      setPageMenuOpen(true)
    }, 450)
  }, [])

  const cancelPageMenuPress = useCallback(() => {
    clearTimeout(pageMenuTimerRef.current)
  }, [])

  useEffect(() => () => clearTimeout(pageMenuTimerRef.current), [])

  // Dismissal is handled by the full-screen scrim rendered below, so a tap
  // anywhere — including the other control-bar buttons — only closes the menu.
  const [inputValue, setInputValue] = useState('')
  const [linkUrlValue, setLinkUrlValue] = useState('')
  const [headerOpacity, setHeaderOpacity] = useState(1)
  const [headerTranslate, setHeaderTranslate] = useState(0)
  // ---- "@" canvas picker ----
  // Typing `@` as the very first character of the add field turns it into a
  // canvas search: the `@` and what follows read as one highlighted token, and
  // the Save-to list shows matching canvases from every page. Return commits the
  // highlighted one; deleting the `@` leaves the picker.
  const [ccActive, setCcActive] = useState(false)
  const [ccPick, setCcPick] = useState(null)   // { categoryId, projectId } | null

  const ccMatches = useMemo(() => {
    if (!ccActive) return []
    const q = inputValue.replace(/^@/, '').trim().toLowerCase()
    const out = []
    categories.forEach((cat, catIdx) => {
      (cat.projects || []).forEach(proj => {
        if (proj.archived) return
        if (!q || (proj.name || '').toLowerCase().includes(q)) {
          out.push({ categoryId: cat.id, projectId: proj.id, name: proj.name, categoryName: cat.name, accentIdx: catIdx })
        }
      })
    })
    return out
  }, [ccActive, inputValue, categories])

  // Highlighted canvas: whatever the user tapped, else the first match
  const ccSelected = useMemo(() => {
    if (!ccActive) return null
    if (ccPick) {
      const hit = ccMatches.find(m => m.projectId === ccPick.projectId)
      if (hit) return hit
    }
    return ccMatches[0] || null
  }, [ccActive, ccPick, ccMatches])

  const ccAccent = ccSelected ? getCategoryAccent(ccSelected.accentIdx) : null
  const ccSelectedRef = useRef(null)
  ccSelectedRef.current = ccSelected

  // Commit the highlighted canvas: it becomes the Save-to destination, the panel
  // returns to its normal state showing that canvas's page, and the field clears.
  const ccCommit = useCallback((pick) => {
    if (pick) {
      setSaveToTab(pick.categoryId)
      setSaveToProject({ categoryId: pick.categoryId, projectId: pick.projectId })
    }
    setCcActive(false)
    setCcPick(null)
    setInputValue('')
  }, [])

  // Runs on every keystroke in the add field.
  const handleAddInputChange = useCallback((raw) => {
    if (ccActive) {
      // The leading "@" holds the picker open — losing it leaves. Everything
      // else refines the search, spaces included (canvas names have them).
      if (!/^@/.test(raw)) { setCcActive(false); setCcPick(null) }
      setInputValue(raw)
      return
    }
    // Only the very start of an empty field can open the picker.
    if (/^@/.test(raw)) {
      setCcActive(true)
      setCcPick(null)
      setInputValue(raw)   // the "@" stays, as part of the token
      return
    }
    setInputValue(raw)
  }, [ccActive, ccCommit])

  const [saveToProject, setSaveToProject] = useState(null)   // { categoryId, projectId }
  const [saveToTab, setSaveToTab] = useState(null)           // category whose projects show in the Save to card
  const lastAddedRef = useRef(null)                          // last project saved to (in-memory, until refresh)
  const pageAddedRef = useRef(null)                          // { tab, categoryId, projectId } last canvas added to while on this page
  const pendingComposeRef = useRef(null)                     // { categoryId, projectId } from a project-card "Add" button
  const saveToScrollRef = useRef(null)                       // the Save to list scroller

  // Whenever the Save-to list is shown (or its page / destination changes),
  // centre the chosen canvas so the panel never opens scrolled away from it.
  useEffect(() => {
    if (!inputFocused || ccActive) return
    const id = requestAnimationFrame(() => {
      const scroller = saveToScrollRef.current
      if (!scroller) return
      const sel = scroller.querySelector('.save-to-option.selected')
      if (!sel) return
      const sRect = scroller.getBoundingClientRect()
      const eRect = sel.getBoundingClientRect()
      scroller.scrollTop += (eRect.top - sRect.top) - (scroller.clientHeight - eRect.height) / 2
      scroller.classList.toggle('scrolled', scroller.scrollTop > 4)
    })
    return () => cancelAnimationFrame(id)
  }, [inputFocused, ccActive, saveToTab, saveToProject])
  const scrollSelPendingRef = useRef(false)                  // scroll the Save to list to the selected option on open
  const prevInputFocused = useRef(false)
  const [addAsActiveFlag, setAddAsActiveFlag] = useState(true)

  // Per-category expand/collapse state (persisted). Lifted here so the shared
  // footer can show its text box only when the active category is collapsed.
  const [collapsedMap, setCollapsedMap] = useState({})
  const readCollapsedLS = (catId) => {
    try { return localStorage.getItem(`cat-collapsed-${catId}`) === 'true' } catch { return false }
  }
  const getCollapsed = useCallback((catId) => (
    catId in collapsedMap ? collapsedMap[catId] : readCollapsedLS(catId)
  ), [collapsedMap])

  // Both writers read the current state through this ref rather than from inside
  // a setState updater. The updater has to be PURE: StrictMode runs it twice,
  // and the old version wrote localStorage inside it, so on the first toggle of
  // a category (before the map had a key for it) the second run read back the
  // value the first run had just written and flipped it straight back — the tap
  // re-rendered but the state never changed, and it took a second tap to work.
  const collapsedMapRef = useRef(collapsedMap)
  collapsedMapRef.current = collapsedMap
  const currentCollapsed = (catId) => (
    catId in collapsedMapRef.current ? collapsedMapRef.current[catId] : readCollapsedLS(catId)
  )
  const writeCollapsed = (catId, next) => {
    try { localStorage.setItem(`cat-collapsed-${catId}`, next ? 'true' : 'false') } catch {}
    setCollapsedMap(prev => ({ ...prev, [catId]: next }))
  }

  // Jumping to an item (search result, or a canvas sublabel in the collapsed
  // view) has to put the Easel back in its Expanded state first — the canvas
  // and its rows don't exist in the collapsed one.
  const expandCategory = useCallback((catId) => {
    if (!currentCollapsed(catId)) return
    writeCollapsed(catId, false)
  }, [])

  const toggleCollapsed = useCallback((catId) => {
    writeCollapsed(catId, !currentCollapsed(catId))
  }, [])

  const activeCategoryCollapsed = categoryIds.includes(activeTab) && getCollapsed(activeTab)
  // The footer text box is available on the homescreen and on every category page
  // (items are always added from the footer); only the Menu page has none.
  // Desktop keeps Add item and search on Settings too (mobile Settings is a sheet)
  const footerInputMode = activeTab === 'star' || categoryIds.includes(activeTab) || (activeTab === 'menu' && !isMobileView)

  // The canvas last added to is remembered only for as long as we stay on the
  // same page; changing pages drops it so the top canvas takes over again.
  useEffect(() => { pageAddedRef.current = null }, [activeTab])

  // Reset to star tab if active category tab is deleted
  useEffect(() => {
    if (activeTab !== 'star' && activeTab !== 'menu' && !categories.some(c => c.id === activeTab)) {
      setActiveTab('star')
    }
  }, [categories]) // eslint-disable-line

  // The default destination for the "Save to..." card:
  //  - a project page → whichever canvas was last added to while on this page,
  //    else the page's top canvas
  //  - homescreen → the project last added to this session, else the first
  //    project of the first tab
  // Archived projects are never offered.
  const computeSaveDefault = useCallback(() => {
    const firstActive = (cat) => cat?.projects.find(p => !p.archived) || null
    if (categoryIds.includes(activeTab)) {
      const added = pageAddedRef.current
      if (added && added.tab === activeTab) {
        const ac = categories.find(c => c.id === added.categoryId)
        if (ac?.projects.some(p => p.id === added.projectId && !p.archived)) {
          return { tab: added.categoryId, target: { categoryId: added.categoryId, projectId: added.projectId } }
        }
      }
      const proj = firstActive(categories.find(c => c.id === activeTab))
      return { tab: activeTab, target: proj ? { categoryId: activeTab, projectId: proj.id } : null }
    }
    const last = lastAddedRef.current
    if (last) {
      const cat = categories.find(c => c.id === last.categoryId)
      const proj = cat?.projects.find(p => p.id === last.projectId && !p.archived)
      if (proj) return { tab: last.categoryId, target: last }
    }
    const firstCat = categories.find(c => c.projects.some(p => !p.archived))
    const firstProj = firstActive(firstCat)
    return {
      tab: firstCat?.id ?? categories[0]?.id ?? null,
      target: firstCat && firstProj ? { categoryId: firstCat.id, projectId: firstProj.id } : null,
    }
  }, [categories, activeTab, categoryIds])

  // Apply the default each time the Save to card opens (input focused). A pending
  // compose request (from a project card's "Add" button) wins over the default.
  useEffect(() => {
    if (inputFocused && footerInputMode && !prevInputFocused.current) {
      if (pendingComposeRef.current) {
        const { categoryId, projectId } = pendingComposeRef.current
        pendingComposeRef.current = null
        setSaveToTab(categoryId)
        setSaveToProject({ categoryId, projectId })
      } else {
        // every fresh open starts on the list type — unless it was opened from
        // one of the resting pill's type buttons
        setToolbarType(pendingTypeRef.current || 'list')
        pendingTypeRef.current = null
        const { tab, target } = computeSaveDefault()
        setSaveToTab(tab)
        setSaveToProject(target)
      }
      setAddAsActiveFlag(false)     // new items are not displayed unless asked
      scrollSelPendingRef.current = true   // scroll the list to the selected canvas
    }
    prevInputFocused.current = inputFocused
  }, [inputFocused, footerInputMode, computeSaveDefault])

  // Once the Save to list has rendered with its selection, scroll it so the
  // selected canvas is centered in view (only when the panel just opened).
  useEffect(() => {
    if (!scrollSelPendingRef.current) return
    if (!inputFocused || !footerInputMode) { scrollSelPendingRef.current = false; return }
    scrollSelPendingRef.current = false
    const raf = requestAnimationFrame(() => {
      const scroller = saveToScrollRef.current
      const sel = scroller?.querySelector('.save-to-option.selected')
      if (!scroller || !sel) return
      const sRect = scroller.getBoundingClientRect()
      const eRect = sel.getBoundingClientRect()
      scroller.scrollTop += (eRect.top - sRect.top) - (scroller.clientHeight - eRect.height) / 2
      scroller.classList.toggle('scrolled', scroller.scrollTop > 4)
    })
    return () => cancelAnimationFrame(raf)
  }, [saveToProject, saveToTab, inputFocused, footerInputMode])

  // Desktop: while the Save-to panel is open the page dims, but the canvas the
  // item is headed for stays at full opacity. Tag its wrapper in the live DOM.
  useEffect(() => {
    const on = inputFocused && footerInputMode
    const sel = on && saveToProject
      ? document.querySelector(`[data-project-id="${saveToProject.projectId}"]`)
      : null
    document.querySelectorAll('.save-target').forEach(el => { if (el !== sel) el.classList.remove('save-target') })
    if (sel) sel.classList.add('save-target')
    return () => { sel?.classList.remove('save-target') }
  }, [inputFocused, footerInputMode, saveToProject, activeTab, categories])

  // Register the compose handler so a project card's "Add ..." button can open
  // the footer preset to that project + content type (focus synchronously).
  useEffect(() => {
    registerComposeHandler((target) => {
      if (!target) return
      pendingComposeRef.current = { categoryId: target.categoryId, projectId: target.projectId }
      setToolbarType(target.type)
      inputRef.current?.focus()
    })
  }, [registerComposeHandler])

  // Keep the current selection valid as data changes (e.g. a project is deleted or
  // archived); fall back to the default when it goes stale.
  useEffect(() => {
    const valid = saveToProject &&
      categories.find(c => c.id === saveToProject.categoryId)?.projects.some(p => p.id === saveToProject.projectId && !p.archived)
    if (!valid) {
      const { tab, target } = computeSaveDefault()
      setSaveToTab(tab)
      setSaveToProject(target)
    }
  }, [categories]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resize the phone to sit exactly above the keyboard on mobile.
  // vv.height = visible area above keyboard; vv.offsetTop = how far iOS scrolled
  // the layout viewport (non-zero when iOS auto-scrolls to reveal the input).
  // Setting height = vv.height + translateY(vv.offsetTop) keeps the phone
  // anchored to the top of the visual viewport with the correct height,
  // regardless of dvh/innerHeight mismatches on iOS Safari.
  useEffect(() => {
    const vv = window.visualViewport
    const phone = document.getElementById('app')
    if (!vv || !phone) return
    const update = () => {
      phone.style.setProperty('--ivh', vv.height + 'px')
      phone.style.transform = vv.offsetTop > 0 ? `translateY(${vv.offsetTop}px)` : ''
    }
    // Search raises the keyboard too, so it needs the same viewport tracking —
    // otherwise .phone stays full height and the search bar sits under the keys.
    if (inputFocused || searchOpen) {
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
      update()
    } else {
      phone.style.removeProperty('--ivh')
      phone.style.transform = ''
    }
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [inputFocused, searchOpen])

  // Delay faded-in by one frame so CSS transition fires correctly
  useEffect(() => {
    if (inputFocused) {
      const raf = requestAnimationFrame(() => setToolbarFadedIn(true))
      return () => cancelAnimationFrame(raf)
    } else {
      setToolbarFadedIn(false)
      toolbarIndicatorMounted.current = false
    }
  }, [inputFocused])

  const inputRef = useRef(null)
  const linkUrlRef = useRef(null)
  const addRowRef = useRef(null)
  const addTapRef = useRef(null)   // press origin, so a swipe doesn't open the field
  const tabBarRef = useRef(null)
  const indicatorRef = useRef(null)
  const toolbarIndicatorRef = useRef(null)
  const indicatorMounted = useRef(false)
  const prevIndicatorTab = useRef(activeTab)
  const toolbarIndicatorMounted = useRef(false)

  // The pill grows into the full box the moment it's focused, and that reflow can
  // leave iOS with the keyboard up but no live caret. Re-assert focus once the new
  // layout has settled so typing works without needing a second tap.
  useEffect(() => {
    if (!inputFocused || !isMobileView || toolbarType === 'link') return
    const el = inputRef.current
    if (!el) return
    const raf = requestAnimationFrame(() => {
      const ae = document.activeElement
      if (ae !== el && ae !== linkUrlRef.current) el.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [inputFocused, isMobileView, toolbarType])
  const pendingAnimRef = useRef(null)
  const pendingProjectAnimRef = useRef(null)

  // Tab transition state
  const TRANSITION_MS = 190
  const [exitingTab, setExitingTab] = useState(null)
  const [transitionDir, setTransitionDir] = useState(null) // 'left' | 'right'
  const [isTransitioning, setIsTransitioning] = useState(false)
  const transitionTimerRef = useRef(null)

  // Finger-tracked drag/swipe carousel state
  const [dragActive, setDragActive] = useState(false)       // current page wears .tab-drag-from
  const [dragIncoming, setDragIncoming] = useState(null)    // { tab } mounted as the .drag-incoming overlay

  const handleTabChange = useCallback((newTab) => {
    if (newTab === activeTab) return
    setOpenDetail(null)   // close any open detail when navigating
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
    const tabs = ['star', ...categoryIds, 'menu']
    const currentIdx = tabs.indexOf(activeTab)
    const newIdx = tabs.indexOf(newTab)
    const dir = currentIdx === -1 || newIdx >= currentIdx ? 'left' : 'right'
    setHeaderOpacity(1)
    setHeaderTranslate(0)
    setExitingTab(activeTab)
    setActiveTab(newTab)
    setTransitionDir(dir)
    setIsTransitioning(true)
    transitionTimerRef.current = setTimeout(() => {
      setExitingTab(null)
      setIsTransitioning(false)
      setTransitionDir(null)
    }, TRANSITION_MS)
  }, [activeTab, categoryIds]) // eslint-disable-line


  // Results are split: things you can currently see first, then everything in a
  // checked/archived state (including anything inside an archived canvas).
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return { visible: [], archived: [] }
    const visible = []
    const archived = []
    categories.forEach((cat, catIdx) => {
      (cat.projects || []).forEach(proj => {
        const projArchived = !!proj.archived
        const projGone = projArchived
        const base = {
          categoryId: cat.id,
          projectId: proj.id,
          projectName: proj.name,
          categoryName: cat.name,
          accentIdx: catIdx,
        }
        const push = (row, isArchived) => (isArchived ? archived : visible).push({ ...row, projArchived })
        // The canvas itself
        if ((proj.name || '').toLowerCase().includes(q)) {
          push({ ...base, key: `c-${proj.id}`, itemId: proj.id, type: 'canvas', title: proj.name || '', hidden: projGone }, projGone)
        }
        ;(proj.todos || []).forEach(t => {
          const title = t.text || ''
          if (title.toLowerCase().includes(q)) {
            push({ ...base, key: `t-${proj.id}-${t.id}`, itemId: t.id, type: 'list', title, hidden: !!t.checked }, projGone || !!t.checked)
          }
        })
        ;(proj.notes || []).forEach(n => {
          const title = n.text || ''
          if (title.toLowerCase().includes(q)) {
            push({ ...base, key: `n-${proj.id}-${n.id}`, itemId: n.id, type: 'note', title, hidden: !!n.archived }, projGone || !!n.archived)
          }
        })
        ;(proj.links || []).forEach(l => {
          const title = l.title || l.url || ''
          if (title.toLowerCase().includes(q) || (l.url || '').toLowerCase().includes(q)) {
            push({ ...base, key: `l-${proj.id}-${l.id}`, itemId: l.id, type: 'link', title, hidden: !!l.archived }, projGone || !!l.archived)
          }
        })
      })
    })
    return { visible: visible.slice(0, 100), archived: archived.slice(0, 100) }
  }, [searchQuery, categories])

  // Backstop: if the synchronous focus in the tap handler didn't take, grab it here.
  useEffect(() => {
    if (!searchOpen) return
    const raf = requestAnimationFrame(() => {
      if (document.activeElement !== searchInputRef.current) {
        searchInputRef.current?.focus({ preventScroll: true })
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [searchOpen])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    searchInputRef.current?.blur()
  }, [])

  // Desktop: clicking anywhere outside the search field or its results dismisses
  // search. (Mobile keeps its own affordances — the panel covers the screen and
  // the bar has a close X.)
  useEffect(() => {
    if (!searchOpen) return
    if (!window.matchMedia('(min-width: 1000px)').matches) return
    const onDown = (e) => {
      if (e.target.closest('.search-stack') || e.target.closest('.search-panel')) return
      closeSearch()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [searchOpen, closeSearch])

  // opts.onFlashed: called once the row has been scrolled to and flashed.
  // r.itemId may be a function, for a new item whose temporary id is swapped
  // for its real one while we're still looking for its row.
  const openSearchResult = useCallback((r, opts = {}) => {
    // Everything the destination needs to make this item visible: the content tab,
    // an expand if the canvas is collapsed, and whichever hide-toggle is hiding it.
    const isCanvas = r.type === 'canvas'
    const focusReq = {
      projectId: r.projectId,
      categoryId: r.categoryId,
      // A canvas result shouldn't force a particular content tab
      type: isCanvas ? null : r.type,
      expand: true,
      showCompleted: r.type === 'list' && (r.hidden || r.projArchived),
      showArchivedNotes: r.type === 'note' && (r.hidden || r.projArchived),
      showArchivedLinks: r.type === 'link' && (r.hidden || r.projArchived),
      showArchivedCanvases: !!r.projArchived,
    }
    // Fires before navigating and again while hunting — a card that hasn't
    // mounted yet can't hear the first one.
    requestProjectFocus(focusReq)
    closeSearch()
    expandCategory(r.categoryId)
    handleTabChange(r.categoryId)
    // Wait for the destination canvas + its content tab to render, scroll the row
    // itself into view, then flash it once the smooth scroll has actually settled.
    const itemIdNow = () => (typeof r.itemId === 'function' ? r.itemId() : r.itemId)
    let tries = 0
    const hunt = setInterval(() => {
      requestProjectFocus(focusReq)
      const scope = document.querySelector(`[data-project-id="${r.projectId}"]`)
        || document.querySelector(`[data-archived-id="${r.projectId}"]`)
      // Canvas results flash the whole card; item results flash their row.
      // A page sorted by content type has no canvas wrappers at all, so fall
      // back to finding the row anywhere on the page (links sit in a grid cell).
      const page = document.querySelector('.page.active:not(.page-exiting)')
      const row = isCanvas
        ? scope?.querySelector('.card')
        : (scope?.querySelector(`.swipe-row[data-swipe-id="${itemIdNow()}"]`)
          || page?.querySelector(`.swipe-row[data-swipe-id="${itemIdNow()}"], .link-grid-cell[data-swipe-id="${itemIdNow()}"]`))
      if (!row) {
        if (++tries > 40) clearInterval(hunt)
        return
      }
      clearInterval(hunt)

      const doFlash = () => {
        // Look the row up again: a new item's row is re-created when its
        // temporary id is swapped for the real one, which can happen between
        // finding it and flashing it (always, when the flash waits on a note)
        const id = itemIdNow()
        const live = (row.isConnected && !isCanvas) ? row
          : isCanvas ? row
          : (document.querySelector(`[data-project-id="${r.projectId}"] .swipe-row[data-swipe-id="${id}"]`)
            || document.querySelector(`.page.active:not(.page-exiting) .swipe-row[data-swipe-id="${id}"], .page.active:not(.page-exiting) .link-grid-cell[data-swipe-id="${id}"]`)
            || row)
        live.classList.remove('search-flash')
        void live.offsetWidth
        live.classList.add('search-flash')
        setTimeout(() => live.classList.remove('search-flash'), 1500)
        opts.onFlashed?.()
      }
      // opts.deferFlash(fn): hand the flash back to be played later instead
      const flash = () => (opts.deferFlash ? opts.deferFlash(doFlash) : doFlash())

      // Revealing the item changes the card's height (expand animation, plus rows
      // that were hidden), so one scroll pass lands against a moving layout.
      // Scroll, let it settle, then correct and only then flash.
      const settleAndScroll = () => {
        scrollRowIntoView(row)
        const page = row.closest('.page')
        let done = false
        const finish = () => {
          if (done) return
          done = true
          page?.removeEventListener('scrollend', finish)
          // Second pass: if the expand shifted it out of view, nudge and flash after.
          const rect = row.getBoundingClientRect()
          const pr = page?.getBoundingClientRect()
          const offscreen = pr && (rect.top < pr.top + 24 || rect.bottom > pr.bottom - 24)
          if (offscreen) {
            scrollRowIntoView(row)
            setTimeout(flash, 450)
          } else {
            flash()
          }
        }
        page?.addEventListener('scrollend', finish, { once: true })
        setTimeout(finish, 700)
      }

      // Give the reveal (expand + re-render) a beat before measuring anything.
      setTimeout(settleAndScroll, 360)
    }, 60)
  }, [closeSearch, handleTabChange, expandCategory])
  openSearchResultRef.current = openSearchResult

  /* Three-dot menus open below their button; if the menu would hang off the
     bottom of the window, flip it above instead. They're rendered inline all
     over the app, so one observer on #app covers every one of them.
     The flip is applied as inline style rather than a class: React owns these
     elements' className and rewrites it on every re-render, which would drop the
     flip mid-close and snap the menu back down. */
  useEffect(() => {
    const app = document.getElementById('app')
    if (!app) return
    const flipped = new WeakSet()
    const timers = new WeakMap()

    const place = (menu) => {
      const r = menu.getBoundingClientRect()
      if (r.bottom <= window.innerHeight - 8) return
      const anchor = menu.parentElement?.getBoundingClientRect()
      if (anchor && anchor.top - r.height - 6 < 8) return   // no room up there either
      flipped.add(menu)
      menu.style.top = 'auto'
      menu.style.bottom = 'calc(100% + 6px)'
      menu.style.transform = 'translateY(8px)'
      requestAnimationFrame(() => { menu.style.transform = 'translateY(0)' })
    }

    const unplace = (menu) => {
      if (!flipped.delete(menu)) return
      menu.style.transform = 'translateY(8px)'   // fade out downward, in place
      clearTimeout(timers.get(menu))
      timers.set(menu, setTimeout(() => {
        menu.style.top = ''
        menu.style.bottom = ''
        menu.style.transform = ''
      }, 240))
    }

    const obs = new MutationObserver(muts => {
      muts.forEach(m => {
        const el = m.target
        if (!el.classList || !el.classList.contains('card-context-menu')) return
        if (el.classList.contains('row-action-menu')) return   // positioned from JS already
        if (el.classList.contains('open')) {
          if (flipped.has(el)) return
          clearTimeout(timers.get(el))
          place(el)
        } else {
          unplace(el)
        }
      })
    })
    obs.observe(app, { attributes: true, attributeFilter: ['class'], subtree: true })
    return () => obs.disconnect()
  }, [])

  // Let the gallery's canvas sublabels reuse this navigation
  useEffect(() => setOpenInCanvas(openSearchResult), [openSearchResult])

  // Refs for swipe-to-change-tab gesture (avoids re-registering listeners on every state change)
  const activeTabRef = useRef(activeTab)
  const tabOrderRef = useRef(['star', ...categoryIds, 'menu'])
  const handleTabChangeRef = useRef(handleTabChange)
  const dragRef = useRef(null)        // live gesture state (shared with the layout effect)
  const dragFrameRef = useRef(null)   // applies a drag frame; set inside the gesture effect
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  // Swipe carousel: Home → each project. On mobile the old Menu tab is gone —
  // Settings is a sheet now — so swiping past the last project must not land on it.
  useEffect(() => {
    tabOrderRef.current = isMobileView
      ? ['star', ...categoryIds]
      : ['star', ...categoryIds, 'menu']
  }, [categoryIds, isMobileView])
  useEffect(() => { handleTabChangeRef.current = handleTabChange }, [handleTabChange])

  // Drag/swipe between tabs — a finger-tracked carousel. The current page's
  // content follows the finger and fades out while the adjacent page's content
  // slides in and fades in (headers cross-fade in place). Release past half the
  // screen width — or a fast flick — commits to the new page; otherwise it snaps
  // back. Only the cards travel; per-frame updates are written as CSS custom
  // properties straight onto the page elements (no React re-render per frame).
  useEffect(() => {
    // Mobile only, both paths. The handlers bail on width themselves rather than
    // the effect skipping setup, so the listeners survive a resize.
    const app = document.getElementById('app')
    if (!app) return

    const ANIM_MS = 190
    const GUTTER = 16    // constant gap between the two card columns, all through the drag
    const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
    let animating = false   // snap/commit animation in flight

    const fromPage = () => app.querySelector('.page.tab-drag-from') || app.querySelector('.page.active:not(.drag-incoming)')
    const toPage = () => app.querySelector('.page.drag-incoming')

    const setVars = (pg, v) => {
      if (!pg) return
      if (v.x !== undefined) pg.style.setProperty('--tab-x', `${v.x}px`)
      if (v.op !== undefined) pg.style.setProperty('--tab-op', String(v.op))
      if (v.hop !== undefined) pg.style.setProperty('--tab-hdr-op', String(v.hop))
      if (v.trans !== undefined) pg.style.setProperty('--tab-trans', v.trans)
    }
    const clearFromVars = () => {
      const fp = fromPage()
      if (!fp) return
      ;['--tab-x', '--tab-op', '--tab-hdr-op', '--tab-trans'].forEach(p => fp.style.removeProperty(p))
    }

    // One column step = the measured page width + the gutter. Measuring the actual
    // page avoids window.innerWidth drift, and the explicit gutter keeps the columns
    // exactly GUTTER apart for the whole drag (no overlap, no jitter).
    const measureStep = (s) => {
      const fp = fromPage()
      const w = (fp && fp.getBoundingClientRect().width) || window.innerWidth
      s.W = w
      s.step = w + GUTTER
    }

    const frame = (s, dx) => {
      if (!s || !s.engaged) return
      if (s.edge) { setVars(fromPage(), { x: dx, op: 1, hop: 1 }); return }
      const p = Math.min(1, Math.abs(dx) / s.W)
      const base = s.dir === 'next' ? s.step : -s.step
      setVars(fromPage(), { x: dx, op: 1 - p, hop: 1 - p })
      setVars(toPage(), { x: dx + base, op: p, hop: p })
    }
    // Exposed so the layout effect can position the incoming page before it paints.
    dragFrameRef.current = (dx) => frame(dragRef.current, dx)

    const engage = (dx) => {
      const s = dragRef.current
      const tabs = tabOrderRef.current
      const idx = tabs.indexOf(activeTabRef.current)
      s.dir = dx < 0 ? 'next' : 'prev'
      const toIdx = s.dir === 'next' ? idx + 1 : idx - 1
      s.engaged = true
      measureStep(s)
      if (idx === -1 || toIdx < 0 || toIdx >= tabs.length) {
        s.edge = true; s.toTab = null
        setDragActive(true)
      } else {
        s.edge = false; s.toTab = tabs[toIdx]
        setDragActive(true)
        setDragIncoming({ tab: s.toTab })
      }
      try { app.setPointerCapture(s.id) } catch { /* ignore */ }
    }

    const finalize = (commit) => {
      const s = dragRef.current
      if (!s) return
      const willCommit = commit && !!s.toTab
      const toTab = s.toTab, dir = s.dir, step = s.step
      const trans = `transform ${ANIM_MS}ms ${EASE}, opacity ${ANIM_MS}ms ${EASE}`
      animating = true
      setVars(fromPage(), { trans })
      setVars(toPage(), { trans })
      if (willCommit) {
        setVars(fromPage(), { x: dir === 'next' ? -step : step, op: 0, hop: 0 })
        setVars(toPage(), { x: 0, op: 1, hop: 1 })
      } else {
        setVars(fromPage(), { x: 0, op: 1, hop: 1 })
        setVars(toPage(), { x: dir === 'next' ? step : -step, op: 0, hop: 0 })
      }
      window.setTimeout(() => {
        if (willCommit) {
          // Old pages unmount (carrying their inline vars); the incoming page keeps
          // its instance and simply becomes active — a seamless handoff.
          setOpenDetail(null)
          setHeaderOpacity(1)
          setHeaderTranslate(0)
          setActiveTab(toTab)
        } else {
          clearFromVars()   // overlay stays offscreen until it unmounts
        }
        setDragActive(false)
        setDragIncoming(null)
        animating = false
      }, ANIM_MS + 20)
      dragRef.current = null
    }

    const onDown = (e) => {
      if (window.innerWidth >= 1000) return   // pointer-drag switching is mobile-only
      // A gesture may start while the previous tab animation is still settling —
      // onMove holds it un-engaged until that lands, so consecutive swipes don't
      // have to wait out the full transition.
      if (dragRef.current) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const t = e.target
      // Rows used to own the horizontal gesture (swipe-to-reveal), so they were
      // excluded here. That's gone — a horizontal drag on a row now switches tabs.
      if (t.closest('.note-detail-page')) return
      // A canvas card is being rearranged — it owns the gesture
      if (isCardDragging()) return
      // Allow drags that start anywhere on a page (incl. project-card text boxes)
      // or on the footer's text-box row (the add-row), but not the tab bar.
      if (!t.closest('.page') && !t.closest('.add-row')) return
      dragRef.current = { fromTile: !!t.closest('.link-tile'), startX: e.clientX, startY: e.clientY, id: e.pointerId, engaged: false, edge: false, dir: null, toTab: null, dx: 0, W: window.innerWidth, step: window.innerWidth + GUTTER, lastX: e.clientX, lastT: performance.now(), v: 0 }
    }

    const onMove = (e) => {
      const s = dragRef.current
      if (!s || e.pointerId !== s.id) return
      // Previous commit still animating: keep the gesture alive but re-baseline to
      // the finger's current position, so it engages from here the moment the
      // animation lands instead of jumping by however far you've already moved.
      if (!s.engaged && animating) {
        s.startX = e.clientX
        s.startY = e.clientY
        s.lastX = e.clientX
        s.lastT = performance.now()
        return
      }
      const dx = e.clientX - s.startX
      const dy = e.clientY - s.startY
      if (!s.engaged) {
        // A link tile has been lifted for a grid reorder — it owns the gesture
        if (isTileDragging() || isCardDragging()) { dragRef.current = null; return }
        // Starting on a tile: hold off long enough for the lift to claim it
        if (s.fromTile && Math.abs(dx) < 12) return
        // Hand off to vertical scrolling only when the gesture is clearly vertical:
        // a long drop AND meaningfully steeper than it is wide.
        if (Math.abs(dy) > 28 && Math.abs(dy) > Math.abs(dx) * 1.8) { dragRef.current = null; return }
        // Engage on a short horizontal move; a diagonal still counts as a swipe.
        if (Math.abs(dx) < 5 || Math.abs(dx) < Math.abs(dy) * 0.45) return
        engage(dx)
      }
      const now = performance.now()
      const dt = now - s.lastT
      if (dt > 0) s.v = (e.clientX - s.lastX) / dt
      s.lastX = e.clientX; s.lastT = now
      let cdx = s.dir === 'next' ? Math.max(-s.step, Math.min(0, dx)) : Math.min(s.step, Math.max(0, dx))
      if (s.edge) cdx = cdx / 3   // rubber-band when there's no neighbor
      s.dx = cdx
      frame(s, cdx)
    }

    const onUp = (e) => {
      const s = dragRef.current
      if (!s || (e.pointerId !== undefined && e.pointerId !== s.id)) return
      if (!s.engaged) { dragRef.current = null; return }
      if (s.edge) { finalize(false); return }
      const passedHalf = Math.abs(s.dx) > s.W * 0.2
      const flick = Math.abs(s.v) > 0.12 && Math.abs(s.dx) > 6 &&
        ((s.dir === 'next' && s.v < 0) || (s.dir === 'prev' && s.v > 0))
      finalize(passedHalf || flick)
    }

    const onCancel = (e) => {
      const s = dragRef.current
      if (!s || (e.pointerId !== undefined && e.pointerId !== s.id)) return
      if (!s.engaged) { dragRef.current = null; return }
      finalize(false)
    }

    // Two-finger trackpad swipe — same carousel, driven by horizontal wheel deltas.
    // A trackpad gesture has no explicit end, so it commits/cancels on a short idle.
    let wheelEndTimer = null
    const wheelFinish = () => {
      const s = dragRef.current
      if (!s || !s.wheel) return
      if (!s.engaged) { dragRef.current = null; return }
      if (s.edge) { finalize(false); return }
      const passedHalf = Math.abs(s.dx) > s.W * 0.2
      const flick = Math.abs(s.v) > 0.12 && Math.abs(s.dx) > 6 &&
        ((s.dir === 'next' && s.v < 0) || (s.dir === 'prev' && s.v > 0))
      finalize(passedHalf || flick)
    }
    const onWheel = (e) => {
      // Mobile-only gesture. Desktop has the sidebar for switching pages, and a
      // trackpad's horizontal deltas fire during ordinary scrolling. Checked per
      // event rather than at setup so a window resize takes effect immediately.
      if (window.matchMedia('(min-width: 1000px)').matches) return
      if (animating) return
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 0.8) return   // clearly vertical — leave it to scrolling
      if (dragRef.current && !dragRef.current.wheel) return   // a finger drag owns the gesture
      const t = e.target
      // The touch row-swipe owns horizontal drags over a card row
      if (t.closest('.swipe-row')) return
      if (t.closest('.note-detail-page')) return
      // A canvas card is being rearranged — it owns the gesture
      if (isCardDragging()) return
      if (!t.closest('.page') && !t.closest('.add-row')) return
      e.preventDefault()

      let s = dragRef.current
      if (!s) {
        s = { wheel: true, engaged: false, edge: false, dir: null, toTab: null, acc: 0, dx: 0, W: window.innerWidth, step: window.innerWidth + GUTTER, v: 0, lastT: performance.now() }
        dragRef.current = s
      }
      s.acc -= e.deltaX
      const now = performance.now()
      const dt = now - s.lastT
      if (dt > 0) s.v = (-e.deltaX) / dt
      s.lastT = now

      if (!s.engaged) {
        if (Math.abs(s.acc) < 8) { clearTimeout(wheelEndTimer); wheelEndTimer = setTimeout(wheelFinish, 140); return }
        engage(s.acc)
      }
      let cdx = s.dir === 'next' ? Math.max(-s.step, Math.min(0, s.acc)) : Math.min(s.step, Math.max(0, s.acc))
      if (s.edge) cdx = cdx / 3
      s.dx = cdx
      frame(s, cdx)
      clearTimeout(wheelEndTimer)
      wheelEndTimer = setTimeout(wheelFinish, 140)
    }

    app.addEventListener('pointerdown', onDown)
    app.addEventListener('pointermove', onMove)
    app.addEventListener('pointerup', onUp)
    app.addEventListener('pointercancel', onCancel)
    app.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      dragFrameRef.current = null
      clearTimeout(wheelEndTimer)
      app.removeEventListener('pointerdown', onDown)
      app.removeEventListener('pointermove', onMove)
      app.removeEventListener('pointerup', onUp)
      app.removeEventListener('pointercancel', onCancel)
      app.removeEventListener('wheel', onWheel)
    }
  }, []) // eslint-disable-line

  // The incoming page mounts a frame or two after the drag engages. Position it
  // (and re-assert the current frame) synchronously before paint, so it never
  // flashes at translateX(0) over the current page mid-drag.
  useLayoutEffect(() => {
    const s = dragRef.current
    if (dragIncoming && s && s.engaged && dragFrameRef.current) dragFrameRef.current(s.dx)
  }, [dragIncoming])

  // Row swipe gestures (pointer drag + trackpad two-finger) were removed in
  // favour of the long-press row action menu — see RowMenu.jsx.

  // Update tab indicator position
  useEffect(() => {
    const updateIndicator = () => {
      const selected = document.querySelector('.text-tab.selected, .icon-tab.selected')
      const indicator = document.getElementById('tabIndicator')
      if (!selected || !indicator) return
      const bar = selected.closest('.tab-bar')
      if (!bar) return
      const bR = bar.getBoundingClientRect()
      const tR = selected.getBoundingClientRect()
      const vertical = window.matchMedia('(min-width: 1000px)').matches
      const scroller = bar.querySelector('.tabs-scroll')
      // Settings sits outside the scroller and paints its own highlight; moving
      // the indicator down to it stretched the scroll area and jumped the list.
      if (vertical && scroller && !scroller.contains(selected)) return
      const place = () => {
        if (vertical && scroller) {
          // Desktop: vertical stack — the selector box slides top-to-bottom, full
          // width. Positioned within the scroll container so it tracks scrolling.
          const sR = scroller.getBoundingClientRect()
          indicator.style.top = (tR.top - sR.top + scroller.scrollTop) + 'px'
          indicator.style.height = selected.offsetHeight + 'px'
          indicator.style.left = '0px'
          indicator.style.width = '100%'
        } else {
          indicator.style.left = (tR.left - bR.left) + 'px'
          indicator.style.width = selected.offsetWidth + 'px'
          indicator.style.top = ''
          indicator.style.height = ''
        }
      }
      // Gallery and Settings live outside the scroller and paint their own boxes,
      // so the indicator has nothing to travel from/to across that boundary —
      // sliding there just looks like it flies in from nowhere. Snap instead;
      // project-to-project moves keep the slide.
      const cameFromOwnBox = prevIndicatorTab.current === 'star' || prevIndicatorTab.current === 'menu'
      if (!indicatorMounted.current || (vertical && cameFromOwnBox)) {
        indicator.style.transition = 'none'
        place()
        requestAnimationFrame(() => { indicator.style.transition = ''; indicatorMounted.current = true })
      } else {
        place()
      }
      // Desktop: toggle the edge fade when the list overflows, and scroll a
      // partially-hidden selected tab fully into view (clearing the 12px fade).
      // The indicator's top is content-relative, so it stays put after scrolling.
      if (vertical && scroller) {
        const pad = 12
        const sRect = scroller.getBoundingClientRect()
        const tRect = selected.getBoundingClientRect()
        let delta = 0
        if (tRect.top < sRect.top + pad) delta = tRect.top - (sRect.top + pad)
        else if (tRect.bottom > sRect.bottom - pad) delta = tRect.bottom - (sRect.bottom - pad)
        if (delta) scroller.scrollBy({ top: delta, behavior: 'smooth' })
      }
    }
    requestAnimationFrame(updateIndicator)
    prevIndicatorTab.current = activeTab

    // Re-snap on resize (crossing the desktop breakpoint flips the slide axis)
    const onResize = () => { indicatorMounted.current = false; requestAnimationFrame(updateIndicator) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [activeTab])

  // Desktop nav edges: fade an edge only when there's content beyond it
  useEffect(() => {
    // Desktop scroller is .tabs-scroll (Gallery sits pinned above it)
    const scroller = document.querySelector('.tabs-scroll') || document.querySelector('.tab-scroll')
    if (!scroller) return
    const update = () => {
      const overflow = scroller.scrollHeight - scroller.clientHeight > 1
      scroller.classList.toggle('fade-top', overflow && scroller.scrollTop > 1)
      scroller.classList.toggle('fade-bottom', overflow && scroller.scrollTop < scroller.scrollHeight - scroller.clientHeight - 1)
    }
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      scroller.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [activeTab, categories.length])

  // Update toolbar indicator
  useEffect(() => {
    const updateToolbarIndicator = () => {
      const initBtn = document.querySelector('.toolbar-icon-btn.selected')
      const ind = document.getElementById('toolbarIndicator')
      const right = document.querySelector('.toolbar-right')
      if (initBtn && ind && right) {
        const rightRect = right.getBoundingClientRect()
        const btnRect = initBtn.getBoundingClientRect()
        // Match the selected button's width (tabs can stretch to fill the row)
        ind.style.width = btnRect.width + 'px'
        if (!toolbarIndicatorMounted.current) {
          ind.style.transition = 'none'
          ind.style.left = (btnRect.left - rightRect.left) + 'px'
          requestAnimationFrame(() => { ind.style.transition = ''; toolbarIndicatorMounted.current = true })
        } else {
          ind.style.left = (btnRect.left - rightRect.left) + 'px'
        }
      }
    }
    requestAnimationFrame(updateToolbarIndicator)
  }, [toolbarType, inputFocused])

  // When switching to link mode while the footer is open, focus the title field
  useEffect(() => {
    if (inputFocused && toolbarType === 'link') {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [toolbarType, inputFocused])

  const handleScroll = useCallback((e) => {
    const scrollY = e.target.scrollTop
    const fadeRange = 48
    const opacity = Math.max(0, 1 - scrollY / fadeRange)
    const translate = (1 - opacity) * -16
    setHeaderOpacity(opacity)
    setHeaderTranslate(translate)
    // Content only fades out at the top once there's something above it
    e.target.classList.toggle('scrolled', scrollY > 1)
  }, [])

  const handleTabsScroll = useCallback(() => {
    const selected = document.querySelector('.text-tab.selected, .icon-tab.selected')
    const indicator = document.getElementById('tabIndicator')
    if (!selected || !indicator) return
    requestAnimationFrame(() => {
      // Desktop: the indicator sits inside .tabs-scroll and scrolls with it
      // natively, so nothing to do here.
      if (window.matchMedia('(min-width: 1000px)').matches) return
      const bar = document.querySelector('.tab-bar')
      if (!bar) return
      const bR = bar.getBoundingClientRect()
      const tR = selected.getBoundingClientRect()
      indicator.style.transition = 'none'
      indicator.style.left = (tR.left - bR.left) + 'px'
      indicator.style.width = tR.width + 'px'
      requestAnimationFrame(() => { indicator.style.transition = '' })
    })
  }, [])

  // Clone animation: fly new item from input to card
  useEffect(() => {
    const anim = pendingAnimRef.current
    if (!anim) return
    pendingAnimRef.current = null

    const { id, type, text, inputRect, appRect } = anim
    const selector = type === 'list' ? `.todo-row[data-id="${id}"]` : `.note-row[data-note-id="${id}"]`

    requestAnimationFrame(() => {
      const targetEl = document.querySelector(selector)
      if (!targetEl) return
      const portal = document.getElementById('animation-portal')
      if (!portal) return

      // Hide the entire row wrapper so the card doesn't expand until clone lands
      const swipeRow = targetEl.closest('.swipe-row')
      const rowWrapper = swipeRow?.parentElement
      let naturalHeight = 60
      if (rowWrapper) {
        naturalHeight = rowWrapper.scrollHeight || 60
        rowWrapper.style.overflow = 'hidden'
        rowWrapper.style.maxHeight = '0'
        rowWrapper.style.opacity = '0'
      }

      const targetRect = targetEl.getBoundingClientRect()

      // Build floating clone
      const clone = document.createElement('div')
      clone.style.cssText = [
        'position:absolute',
        `left:${inputRect.left - appRect.left}px`,
        `top:${inputRect.top - appRect.top}px`,
        `width:${inputRect.width}px`,
        `height:${inputRect.height}px`,
        'background:#FAF9F7',
        'border-radius:4px',
        'box-shadow:0 2px 12px rgba(0,0,0,0.10)',
        'display:flex',
        'align-items:center',
        'padding:0 16px',
        "font-family:'Open Sans',system-ui,sans-serif",
        'font-weight:600',
        'font-size:16px',
        'color:#242424',
        'pointer-events:none',
        'overflow:hidden',
        'white-space:nowrap',
        'text-overflow:ellipsis',
        'box-sizing:border-box',
      ].join(';')
      clone.textContent = text
      portal.appendChild(clone)

      // Step 1: scroll to show target (250ms)
      const pageEl = document.getElementById('page-star')
      if (pageEl) {
        const pageRect = pageEl.getBoundingClientRect()
        if (targetRect.bottom > pageRect.bottom - 8) {
          pageEl.scrollTo({ top: pageEl.scrollTop + (targetRect.bottom - pageRect.bottom) + 16, behavior: 'smooth' })
        }
      }

      // Step 2: pause 100ms, animate clone to target
      setTimeout(() => {
        setTimeout(() => {
          const finalRect = targetEl.getBoundingClientRect()
          const finalAppRect = document.getElementById('app')?.getBoundingClientRect() || appRect

          clone.style.transition = [
            'left 280ms cubic-bezier(0.4,0,0.2,1)',
            'top 280ms cubic-bezier(0.4,0,0.2,1)',
            'width 280ms cubic-bezier(0.4,0,0.2,1)',
            'height 280ms cubic-bezier(0.4,0,0.2,1)',
          ].join(',')
          clone.style.left = `${finalRect.left - finalAppRect.left}px`
          clone.style.top = `${finalRect.top - finalAppRect.top}px`
          clone.style.width = `${finalRect.width}px`
          clone.style.height = `${finalRect.height}px`

          // Expand the card during flight — opacity stays 0 so content is hidden
          if (rowWrapper) {
            rowWrapper.style.transition = 'max-height 280ms cubic-bezier(0.4,0,0.2,1)'
            rowWrapper.style.maxHeight = naturalHeight + 'px'
          }

          // When clone lands: remove it and fade content in
          setTimeout(() => {
            clone.remove()
            if (rowWrapper) {
              rowWrapper.style.transition = 'opacity 150ms ease'
              rowWrapper.style.opacity = '1'
              setTimeout(() => {
                rowWrapper.style.maxHeight = ''
                rowWrapper.style.overflow = ''
                rowWrapper.style.transition = ''
                rowWrapper.style.opacity = ''
              }, 150)
            }
          }, 300)
        }, 100)
      }, 250)
    })
  }, [activeTodos, activeNotes])

  // Fly animation for active project items — fires when footer closes after send
  useEffect(() => {
    if (inputFocused) return
    const anim = pendingProjectAnimRef.current
    if (!anim) return

    const { id, type, text, inputRect, appRect } = anim
    const selector = type === 'list' ? `.todo-row[data-id="${id}"]` : `.note-row[data-note-id="${id}"]`

    // Hide the item immediately so it doesn't flash during the footer close
    const targetEl = document.querySelector(selector)
    if (!targetEl) { pendingProjectAnimRef.current = null; return }
    const rowWrapper = targetEl.closest('.swipe-row')?.parentElement
    if (rowWrapper) rowWrapper.style.opacity = '0'
    pendingProjectAnimRef.current = null

    const portal = document.getElementById('animation-portal')
    const appEl = document.getElementById('app')

    // Wait for footer/panel close transitions (~200ms), then fly
    setTimeout(() => {
      const finalTarget = document.querySelector(selector)
      if (!finalTarget || !portal || !appEl) {
        if (rowWrapper) rowWrapper.style.opacity = ''
        return
      }

      const fa = appEl.getBoundingClientRect()

      // Scroll to show target if needed
      const pageEl = document.getElementById('page-star')
      if (pageEl) {
        const targetRect = finalTarget.getBoundingClientRect()
        const pageRect = pageEl.getBoundingClientRect()
        if (targetRect.bottom > pageRect.bottom - 8) {
          pageEl.scrollTo({ top: pageEl.scrollTop + (targetRect.bottom - pageRect.bottom) + 16, behavior: 'smooth' })
        }
      }

      // Create clone at the saved input position
      const clone = document.createElement('div')
      clone.style.cssText = [
        'position:absolute',
        `left:${inputRect.left - appRect.left}px`,
        `top:${inputRect.top - appRect.top}px`,
        `width:${inputRect.width}px`,
        `height:${inputRect.height}px`,
        'background:#FAF9F7',
        'border-radius:4px',
        'box-shadow:0 2px 12px rgba(0,0,0,0.10)',
        'display:flex',
        'align-items:center',
        'padding:0 16px',
        "font-family:'Open Sans',system-ui,sans-serif",
        'font-weight:600',
        'font-size:16px',
        'color:#242424',
        'pointer-events:none',
        'overflow:hidden',
        'white-space:nowrap',
        'text-overflow:ellipsis',
        'box-sizing:border-box',
      ].join(';')
      clone.textContent = text
      portal.appendChild(clone)

      // Pause, then fly to target
      setTimeout(() => {
        const targetRect = finalTarget.getBoundingClientRect()
        const fa2 = document.getElementById('app')?.getBoundingClientRect() || fa
        clone.style.transition = 'left 280ms cubic-bezier(0.4,0,0.2,1), top 280ms cubic-bezier(0.4,0,0.2,1), width 280ms cubic-bezier(0.4,0,0.2,1), height 280ms cubic-bezier(0.4,0,0.2,1)'
        clone.style.left = `${targetRect.left - fa2.left}px`
        clone.style.top = `${targetRect.top - fa2.top}px`
        clone.style.width = `${targetRect.width}px`
        clone.style.height = `${targetRect.height}px`

        setTimeout(() => {
          clone.remove()
          if (rowWrapper) {
            rowWrapper.style.transition = 'opacity 150ms ease'
            rowWrapper.style.opacity = '1'
            setTimeout(() => { rowWrapper.style.transition = ''; rowWrapper.style.opacity = '' }, 150)
          }
        }, 300)
      }, 100)
    }, 260)
  }, [inputFocused]) // eslint-disable-line react-hooks/exhaustive-deps

  // Added somewhere you can't see: a toast above the footer that jumps to it.
  const [addToast, setAddToast] = useState(null)
  const addToastTimer = useRef(null)
  const addToastDelay = useRef(null)
  const addToastHover = useRef(false)
  const addToastPending = useRef(false)   // the 4s is up but the cursor is on it
  const [addToastLeaving, setAddToastLeaving] = useState(false)

  // The exit animation runs to completion once started — hovering can only hold
  // the toast in its resting state, never interrupt either animation.
  const beginToastExit = useCallback(() => {
    addToastPending.current = false
    setAddToastLeaving(true)
    addToastTimer.current = setTimeout(() => { setAddToastLeaving(false); setAddToast(null) }, 200)
  }, [])
  useEffect(() => () => { clearTimeout(addToastTimer.current); clearTimeout(addToastDelay.current) }, [])

  // Drag the toast down to send it away early. Tracked here rather than through
  // the swipe-row helper: this is one element, and a downward drag has to be
  // told apart from the tap that opens the item.
  const toastDragRef = useRef(null)
  const TOAST_DISMISS_PX = 48
  const onToastPointerDown = useCallback((e) => {
    if (addToastLeaving) return
    const el = e.currentTarget
    toastDragRef.current = { id: e.pointerId, y0: e.clientY, x0: e.clientX, dy: 0, dragging: false, el }
  }, [addToastLeaving])

  const onToastPointerMove = useCallback((e) => {
    const d = toastDragRef.current
    if (!d || d.id !== e.pointerId) return
    const dy = e.clientY - d.y0
    const dx = e.clientX - d.x0
    // Only a downward drag counts; a sideways one is left alone.
    if (!d.dragging) {
      if (dy > 6 && dy > Math.abs(dx)) {
        d.dragging = true
        d.el.style.animation = 'none'   // the entry animation would fight the drag
        d.el.style.transition = 'none'
      } else return
    }
    d.dy = Math.max(0, dy)
    // Resist a little past the dismiss point so the throw still feels physical.
    const shown = d.dy > TOAST_DISMISS_PX ? TOAST_DISMISS_PX + (d.dy - TOAST_DISMISS_PX) * 0.4 : d.dy
    d.el.style.transform = `translateY(${shown}px)`
    d.el.style.opacity = String(Math.max(0.25, 1 - d.dy / 220))
  }, [])

  const endToastDrag = useCallback((e) => {
    const d = toastDragRef.current
    if (!d || d.id !== e.pointerId) return null
    toastDragRef.current = null
    if (!d.dragging) return d          // a tap — the caller opens the item
    const el = d.el
    if (d.dy >= TOAST_DISMISS_PX) {
      clearTimeout(addToastTimer.current)
      el.style.transition = 'transform 180ms ease, opacity 180ms ease'
      el.style.transform = 'translateY(140px)'
      el.style.opacity = '0'
      addToastPending.current = false
      addToastTimer.current = setTimeout(() => { setAddToastLeaving(false); setAddToast(null) }, 180)
    } else {
      // Not far enough — spring back and carry on with the normal timeout.
      el.style.transition = 'transform 180ms cubic-bezier(0.2,0.8,0.2,1), opacity 180ms ease'
      el.style.transform = ''
      el.style.opacity = ''
      setTimeout(() => { el.style.transition = '' }, 200)
    }
    return null
  }, [])

  const showAddToast = useCallback((holder, { categoryId, projectId, type, title }) => {
    const catIdx = categories.findIndex(c => c.id === categoryId)
    const accent = catIdx >= 0 ? getCategoryAccent(catIdx) : getHomeAccent()
    const canvasName = categories.find(c => c.id === categoryId)
      ?.projects.find(p => p.id === projectId)?.name || ''
    clearTimeout(addToastTimer.current)
    clearTimeout(addToastDelay.current)
    // Half a second after the add view has closed and the page is back
    setAddToastLeaving(false)
    addToastHover.current = false
    addToastPending.current = false
    addToastDelay.current = setTimeout(() => {
      setAddToast({ key: Date.now(), holder, categoryId, projectId, type, title, canvasName, accent })
      addToastTimer.current = setTimeout(() => {
        // Cursor on it when the time is up: hold until it moves away
        if (addToastHover.current) { addToastPending.current = true; return }
        beginToastExit()
      }, 5000)
    }, 500)
  }, [categories, beginToastExit])

  // A row you just added gets the same treatment as a search result: scrolled
  // into view and flashed. Only when it lands on the page you're looking at —
  // the canvas you're on, or the gallery for something added as Displayed.
  const flashNewRow = useCallback((holder, { categoryId, projectId, type }) => {
    const onHome = activeTab === 'star'
    const focusReq = onHome ? null : { projectId, categoryId, type, expand: true }
    const findRow = () => (holder.id == null
      ? null
      : document.querySelector(`.page:not(.page-exiting) [data-swipe-id="${holder.id}"]`))
    const flash = (row) => {
      row.classList.remove('search-flash')
      void row.offsetWidth
      row.classList.add('search-flash')
      setTimeout(() => row.classList.remove('search-flash'), 1500)
    }
    let tries = 0
    const hunt = setInterval(() => {
      if (focusReq) requestProjectFocus(focusReq)
      if (!findRow()) { if (++tries > 40) clearInterval(hunt); return }
      clearInterval(hunt)
      // Let the add animation and any tab switch settle, scroll, then flash —
      // re-finding the row each time, since its temp id is swapped for the real
      // one as soon as the insert comes back.
      setTimeout(() => {
        scrollRowIntoView(findRow())
        setTimeout(() => { const row = findRow(); if (row) flash(row) }, 500)
      }, 400)
    }, 60)
  }, [activeTab])

  // Will the new row actually be on screen where you are? On a project page,
  // only if it lands on that page's easel. On the Gallery, only if it's
  // Displayed AND its easel is set to show there.
  const landsOnThisScreen = (categoryId) => {
    if (activeTab === 'star') {
      if (!addAsActiveFlag) return false
      return categories.find(c => c.id === categoryId)?.sendToHomescreen !== false
    }
    return activeTab === categoryId
  }

  // A new note from Add item opens straight away — body active, keyboard up (held
  // by keepKeyboardAlive) — wherever you are. When you then close it, you land on
  // its easel, scrolled to its canvas on the Notes tab, and its row flashes.
  const newNoteNavRef = useRef(null)   // { holder, categoryId, projectId }
  const goToNewNote = (holder, categoryId, projectId) => {
    const nav = { holder, categoryId, projectId, flash: null, closed: false }
    newNoteNavRef.current = nav
    // Go to the note's easel / canvas / Notes tab now, so it's already there
    // behind the note; its row flash waits until the note closes.
    openSearchResultRef.current?.(
      { type: 'note', categoryId, projectId, itemId: () => holder.id },
      { deferFlash: (fn) => { if (nav.closed) setTimeout(fn, 150); else nav.flash = fn } },
    )
    setTimeout(() => {
      if (holder.id == null) return
      setAutoEditNoteId(holder.id)
      setOpenDetail({ type: 'note', id: holder.id })
    }, 350)
  }

  const addItem = useCallback(() => {
    // Link mode: requires a URL and a destination project
    if (toolbarType === 'link') {
      const url = linkUrlValue.trim()
      if (!url) return
      if (footerInputMode && saveToProject) {
        const { categoryId, projectId } = saveToProject
        const holder = { id: null }
        holder.id = addProjectLink(categoryId, projectId, inputValue.trim(), url, addAsActiveFlag, null, (rid) => { holder.id = rid })
        lastAddedRef.current = { categoryId, projectId }
        pageAddedRef.current = { tab: activeTab, categoryId, projectId }
        const title = inputValue.trim() || url
        if (landsOnThisScreen(categoryId)) {
          flashNewRow(holder, { categoryId, projectId, type: 'link' })
        } else {
          showAddToast(holder, { categoryId, projectId, type: 'link', title })
        }
      }
      setInputValue('')
      setLinkUrlValue('')
      setToolbarType('list')
      linkUrlRef.current?.blur()
      inputRef.current?.blur()
      // Sending ends the compose session — close Save to and the add item
      // active state even if blur alone doesn't dismiss them
      setInputFocused(false)
      return
    }

    const text = inputValue.trim()
    if (!text) return

    // After a new note flies into place, auto-open its editor. The holder tracks
    // the note's id (temp → real) so we open whichever is current.
    const openNoteSoon = (type, holder) => setTimeout(() => { if (holder.id != null) { setAutoEditNoteId(holder.id); setOpenDetail({ type, id: holder.id }) } }, 750)

    // Homescreen or collapsed category: route into the selected project
    if (footerInputMode && saveToProject) {
      const { categoryId, projectId } = saveToProject
      lastAddedRef.current = { categoryId, projectId }
      pageAddedRef.current = { tab: activeTab, categoryId, projectId }

      if (addAsActiveFlag && (toolbarType === 'list' || toolbarType === 'note')) {
        // Capture input position BEFORE blur for the fly animation
        const inputEl = inputRef.current
        const addRowEl = addRowRef.current
        const appEl = document.getElementById('app')
        const inputRect = inputEl?.getBoundingClientRect()
        const addRowRect = addRowEl?.getBoundingClientRect()
        const appRect = appEl?.getBoundingClientRect()
        const animRect = inputRect && addRowRect
          ? { left: addRowRect.left, top: inputRect.top, width: addRowRect.width, height: inputRect.height }
          : inputRect

        let newId
        const holder = { id: null }
        if (toolbarType === 'list') {
          newId = addProjectTodo(categoryId, projectId, text, true, null, (rid) => { holder.id = rid })
        } else {
          newId = addProjectNote(categoryId, projectId, text, true, null, (rid) => { holder.id = rid })
        }
        holder.id = newId

        if (toolbarType === 'note') {
          goToNewNote(holder, categoryId, projectId)   // navigates, highlights, opens
        } else {
          if (animRect && appRect && newId != null) {
            pendingProjectAnimRef.current = { id: newId, type: toolbarType, text, inputRect: animRect, appRect }
          }
          if (landsOnThisScreen(categoryId)) {
            flashNewRow(holder, { categoryId, projectId, type: toolbarType })
          } else {
            showAddToast(holder, { categoryId, projectId, type: toolbarType, title: text })
          }
        }
      } else {
        // Inactive: add without animation
        const holder = { id: null }
        if (toolbarType === 'list') {
          holder.id = addProjectTodo(categoryId, projectId, text, addAsActiveFlag, null, (rid) => { holder.id = rid })
        } else if (toolbarType === 'note') {
          holder.id = addProjectNote(categoryId, projectId, text, addAsActiveFlag, null, (rid) => { holder.id = rid })
          goToNewNote(holder, categoryId, projectId)   // navigates, highlights, opens
        }
        // An inactive item never shows on the gallery, so only flash it when
        // you're on its own canvas's page — otherwise the toast points at it.
        if (toolbarType === 'note') {
          // handled by goToNewNote
        } else if (landsOnThisScreen(categoryId)) {
          flashNewRow(holder, { categoryId, projectId, type: toolbarType })
        } else {
          showAddToast(holder, { categoryId, projectId, type: toolbarType, title: text })
        }
      }

      setInputValue('')
      // A note opens into edit mode later, on a timer — keep the keyboard up so
      // focus can transfer to the editor when it does.
      if (toolbarType === 'note') keepKeyboardAlive()
      inputRef.current?.blur()
      setInputFocused(false)
      return
    }

    // Fallback applies only on the homescreen (collapsed category with no
    // projects has nowhere to save, so do nothing there)
    if (activeTab !== 'star') { setInputValue(''); inputRef.current?.blur(); setInputFocused(false); return }

    // Fallback: add to local Active-page lists (no project selected)
    const inputEl = inputRef.current
    const addRowEl = inputEl?.parentElement
    const appEl = document.getElementById('app')
    const inputRect = inputEl?.getBoundingClientRect()
    const addRowRect = addRowEl?.getBoundingClientRect()
    const appRect = appEl?.getBoundingClientRect()
    const animRect = inputRect && addRowRect
      ? { left: addRowRect.left, top: inputRect.top, width: addRowRect.width, height: inputRect.height }
      : inputRect

    if (toolbarType === 'list') {
      const newId = addActiveTodo(text)
      if (animRect && appRect) pendingAnimRef.current = { id: newId, type: 'list', text, inputRect: animRect, appRect }
    } else if (toolbarType === 'note') {
      const holder = { id: null }
      const newId = addActiveNote(text, (rid) => { holder.id = rid })
      holder.id = newId
      if (animRect && appRect) pendingAnimRef.current = { id: newId, type: 'note', text, inputRect: animRect, appRect }
      openNoteSoon('local-note', holder)
    }
    if (toolbarType === 'note') keepKeyboardAlive()
    setInputValue('')
    setToolbarType('list')
    inputRef.current?.blur()
    setInputFocused(false)
  }, [inputValue, linkUrlValue, activeTab, footerInputMode, toolbarType, saveToProject, addAsActiveFlag, categories, flashNewRow, showAddToast, addProjectTodo, addProjectNote, addProjectLink, addActiveTodo, addActiveNote, setOpenDetail, setAutoEditNoteId, openSearchResult])

  // Keep the footer "focused" while focus moves between the title and URL fields
  const handleAddInputBlur = useCallback(() => {
    requestAnimationFrame(() => {
      const ae = document.activeElement
      if (ae && addRowRef.current && addRowRef.current.contains(ae)) return
      // Naming a new canvas moves focus into the Save-to panel — that's still
      // the same compose session, so don't dismiss it.
      if (ae && ae.closest && ae.closest('.save-to-panel')) return
      setInputFocused(false)
    })
  }, [])

  const handleKeyDown = useCallback((e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    // In the canvas picker, Return picks the highlighted canvas rather than
    // adding an item.
    if (ccActive) { ccCommit(ccSelectedRef.current); return }
    addItem()
  }, [addItem, ccActive, ccCommit])

  const toggleTodo = useCallback((id) => toggleActiveTodo(id), [toggleActiveTodo])
  const deleteTodo = useCallback((id) => deleteActiveTodo(id), [deleteActiveTodo])
  const deleteNote = useCallback((id) => deleteActiveNote(id), [deleteActiveNote])
  const updateNote = useCallback((id, editorHTML, text) => updateActiveNote(id, editorHTML, text), [updateActiveNote])
  const reorderTodos = useCallback((newOrder) => reorderActiveTodos(newOrder), [reorderActiveTodos])
  const reorderNotes = useCallback((newOrder) => reorderActiveNotes(newOrder), [reorderActiveNotes])

  const hasContent = activeTodos.length > 0 || activeNotes.length > 0

  // Date for the persistent desktop sidebar header (matches the Active page)
  const now = new Date()
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' })
  const monthDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

  // Decoration colour: on a category page use that category's base colour;
  // on the homescreen use the base colour of the category with the most Lists items.
  const decorationColor = useMemo(() => {
    if (activeTab !== 'star' && activeTab !== 'menu') {
      const selIdx = categories.findIndex(c => c.id === activeTab)
      if (selIdx >= 0) return getCategoryAccent(selIdx).base
    }
    const counts = {}
    categories.filter(cat => cat.sendToHomescreen !== false).forEach(cat => {
      cat.projects.forEach(proj => {
        proj.todos.forEach(t => { if (t.activated) counts[cat.id] = (counts[cat.id] || 0) + 1 })
      })
    })
    let domId = null, domMax = 0
    for (const cid in counts) { if (counts[cid] > domMax) { domMax = counts[cid]; domId = cid } }
    const idx = domId ? categories.findIndex(c => c.id === domId) : -1
    return idx >= 0 ? getCategoryAccent(idx).base : getHomeAccent().base
  }, [categories, activeTab])

  // Desktop sidebar (Dots themes): one dot per easel with unchecked active list
  // items, in the easel's colour, most items first — the Gallery header's dots.
  const sidebarDots = useMemo(() => {
    const counts = {}
    categories.filter(cat => cat.sendToHomescreen !== false).forEach(cat => {
      cat.projects.filter(proj => !proj.archived).forEach(proj => {
        proj.todos.forEach(t => { if (t.activated && !t.checked) counts[cat.id] = (counts[cat.id] || 0) + 1 })
      })
    })
    ;(activeTodos || []).forEach(t => { if (t.categoryId) counts[t.categoryId] = (counts[t.categoryId] || 0) + 1 })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([cid]) => {
        const idx = categories.findIndex(c => c.id === cid)
        const acc = idx >= 0 ? getCategoryAccent(idx) : getHomeAccent()
        return { id: cid, color: acc.dot ?? acc.base }
      })
  }, [categories, activeTodos])

  const activeAccent = useMemo(() => {
    if (activeTab === 'star' || activeTab === 'menu') return getHomeAccent()
    const idx = categories.findIndex(c => c.id === activeTab)
    if (idx === -1) return getHomeAccent()
    return getCategoryAccent(idx)
  }, [activeTab, categories])

  // The text box always wears the colour of wherever the item will land — so a
  // destination picked in "Save to…" wins over the page you happen to be on.
  const footerAccent = useMemo(() => {
    if (saveToProject) {
      const catIdx = categories.findIndex(c => c.id === saveToProject.categoryId)
      if (catIdx !== -1) return getCategoryAccent(catIdx)
    }
    return activeAccent
  }, [saveToProject, categories, activeAccent])

  // Footer drop shadow only when the active page actually scrolls
  const pageScrollable = useScrollable(
    () => document.querySelector('#app .page:not(.page-exiting)'),
    [activeTab, categories, activeTodos, activeNotes, inputFocused, footerInputMode]
  )

  // Render the page for a tab. `incoming` renders it as the absolutely-overlaid
  // .drag-incoming page (and drops the duplicate id) during a drag.
  // The key is the tab id regardless of role, so when a drag commits the incoming
  // page keeps the SAME React instance as it becomes active — no remount, so its
  // cards don't replay their intro animation and it never flashes back to the top.
  const renderTabPage = (tabId, { incoming = false } = {}) => {
    const dragClass = incoming
      ? 'drag-incoming tab-drag-to'
      : (dragActive ? 'tab-drag tab-drag-from' : '')
    const animClass = !incoming && isTransitioning
      ? `page-entering page-enter-from-${transitionDir === 'left' ? 'right' : 'left'}`
      : ''
    const pageAnimClass = [dragClass, animClass].filter(Boolean).join(' ')

    if (tabId === 'star') {
      return (
        <ActivePage
          key="star"
          todos={activeTodos}
          notes={activeNotes}
          onToggleTodo={toggleTodo}
          onDeleteTodo={deleteTodo}
          onDeleteNote={deleteNote}
          onUpdateNote={updateNote}
          onReorderTodos={reorderTodos}
          onReorderNotes={reorderNotes}
          onScroll={handleScroll}
          headerOpacity={headerOpacity}
          headerTranslate={headerTranslate}
          pageAnimClass={pageAnimClass}
          isExiting={incoming}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )
    }
    if (categoryIds.includes(tabId)) {
      return (
        <CategoryPage
          key={tabId}
          categoryId={tabId}
          collapsed={getCollapsed(tabId)}
          onToggleCollapsed={() => toggleCollapsed(tabId)}
          onScroll={handleScroll}
          headerOpacity={headerOpacity}
          headerTranslate={headerTranslate}
          pageAnimClass={pageAnimClass}
          isExiting={incoming}
        />
      )
    }
    if (tabId === 'menu') {
      return (
        <MenuPage
          key="menu"
          onSelectTab={handleTabChange}
          pageAnimClass={pageAnimClass}
          isExiting={incoming}
        />
      )
    }
    return (
      <div key={tabId} className={`page active${pageAnimClass ? ` ${pageAnimClass}` : ''}`} id={incoming ? undefined : `page-${tabId}`}>
        <div className="page-header">
          <p className="active-title" style={{ textTransform: 'capitalize' }}>{tabId}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-wrap">
      <div
        className={`phone${inputFocused && footerInputMode ? ' save-panel-open' : ''}${searchOpen ? ' save-panel-open search-panel-open' : ''}${pageMenuOpen ? ' page-menu-open' : ''}${addToast && !addToastLeaving ? ' toast-open' : ''}`}
        id="app"
        style={{
          '--accent-base': activeAccent.base,
          '--accent-dark': activeAccent.dark,
          '--accent-light': activeAccent.light,
          '--accent-base-rgb': activeAccent.baseRgb,
        }}
      >

        {/* Pull-to-refresh spinner (driven by usePullToRefresh) */}
        <div className="pull-spinner" ref={pullSpinnerRef}>
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="var(--accent-dark)" strokeOpacity="0.25" strokeWidth="2"/>
            <path d="M21 12a9 9 0 0 0-9-9" stroke="var(--accent-dark)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>

        {/* First load with nothing cached yet: a spinner in the middle while the
            content arrives. The header, control bar and Add item are already up
            and usable around it. */}
        {loading && categories.length === 0 && (
          <div className="app-loading" aria-label="Loading">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="var(--accent-base)" strokeOpacity="0.25" strokeWidth="2"/>
              <path d="M21 12a9 9 0 0 0-9-9" stroke="var(--accent-base)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
        )}

        {/* Persistent date header — shown in the left sidebar on desktop only */}
        <div className="sidebar-date">
          <p className="active-day-name">{dayName},</p>
          <GalleryDecoration className="active-date-decoration" style={{ color: decorationColor }} />
          <p className="active-month-date">{monthDate}</p>
          {sidebarDots.length > 0 && (
            <div className="active-dots">
              {sidebarDots.map(d => (
                <span key={d.id} className="active-dot" style={{ background: d.color }} />
              ))}
            </div>
          )}
        </div>

        {/* Current page (flex flow) + the incoming carousel column during a drag,
            rendered as one keyed list so React matches pages by key: on commit the
            incoming page keeps its instance as it becomes the active page. */}
        {(dragIncoming
          ? [{ tab: activeTab, incoming: false }, { tab: dragIncoming.tab, incoming: true }]
          : [{ tab: activeTab, incoming: false }]
        ).map(p => renderTabPage(p.tab, { incoming: p.incoming }))}

        {/* Exiting pages — absolutely overlaid, pointer-events:none, play exit animation */}
        {isTransitioning && exitingTab === 'star' && (
          <ActivePage
            key="exit-star"
            todos={activeTodos}
            notes={activeNotes}
            onToggleTodo={toggleTodo}
            onDeleteTodo={deleteTodo}
            onDeleteNote={deleteNote}
            onUpdateNote={updateNote}
            onReorderTodos={reorderTodos}
            onReorderNotes={reorderNotes}
            onScroll={handleScroll}
            headerOpacity={headerOpacity}
            headerTranslate={headerTranslate}
            pageAnimClass={`page-exiting page-exit-to-${transitionDir}`}
            isExiting
          />
        )}
        {isTransitioning && exitingTab !== 'star' && exitingTab !== 'menu' && categoryIds.includes(exitingTab) && (
          <CategoryPage
            key={`exit-${exitingTab}`}
            categoryId={exitingTab}
            collapsed={getCollapsed(exitingTab)}
            onToggleCollapsed={() => toggleCollapsed(exitingTab)}
            onScroll={handleScroll}
            headerOpacity={headerOpacity}
            headerTranslate={headerTranslate}
            pageAnimClass={`page-exiting page-exit-to-${transitionDir}`}
            isExiting
          />
        )}
        {isTransitioning && exitingTab === 'menu' && (
          <MenuPage
            key="exit-menu"
            pageAnimClass={`page-exiting page-exit-to-${transitionDir}`}
            isExiting
          />
        )}

        {/* Save to… panel — homescreen & collapsed category pages, flex sibling to footer */}
        {footerInputMode && (
          <div
            className={`save-to-panel${inputFocused ? ' visible' : ''}`}
            style={{
              '--accent-base': footerAccent.base,
              '--accent-dark': footerAccent.dark,
              '--accent-light': footerAccent.light,
              '--accent-base-rgb': footerAccent.baseRgb,
            }}
          >
            <div className="save-to-card">
              <div className="save-to-header">
                <p className="save-to-title">Save to...</p>
                <button
                  className="save-to-cancel"
                  onMouseDown={e => {
                    e.preventDefault()
                    // Cancel discards the draft — the bar returns to its resting state empty
                    setInputValue('')
                    setLinkUrlValue('')
                    setCcActive(false)
                    setCcPick(null)
                    inputRef.current?.blur()
                    linkUrlRef.current?.blur()
                    // Focus may be elsewhere (e.g. the new-canvas field), so blur
                    // alone can't be relied on to dismiss the panel
                    setInputFocused(false)
                  }}
                >Cancel</button>
              </div>
              <div
                className="save-to-scroll"
                ref={saveToScrollRef}
                onScroll={e => e.currentTarget.classList.toggle('scrolled', e.currentTarget.scrollTop > 4)}
                style={(() => {
                  const idx = categories.findIndex(c => c.id === saveToTab)
                  if (idx < 0) return undefined
                  const a = getCategoryAccent(idx)
                  return { '--cb-base': a.base, '--cb-dark': a.dark, '--cb-light': a.light, '--cb-base-rgb': a.baseRgb }
                })()}
              >
                {ccActive ? (
                  ccMatches.length === 0 ? (
                    <p className="save-to-empty search-empty">No canvases</p>
                  ) : ccMatches.map((m, i) => {
                    const acc = getCategoryAccent(m.accentIdx)
                    const on = ccSelected?.projectId === m.projectId
                    return (
                      <div key={`${m.categoryId}-${m.projectId}`}>
                        {i > 0 && <div className="save-to-divider"/>}
                        <button
                          className={`save-to-option${on ? ' selected' : ''}`}
                          style={{ '--cb-base': acc.base, '--cb-dark': acc.dark, '--cb-light': acc.light, '--cb-base-rgb': acc.baseRgb }}
                          onMouseDown={e => { e.preventDefault(); setCcPick({ categoryId: m.categoryId, projectId: m.projectId }) }}
                        >
                          <div className={`save-to-radio${on ? ' filled' : ''}`}/>
                          <span className="cc-option-text">
                            <span className="cc-option-name">{m.name}</span>
                            <span className="cc-option-page">{m.categoryName}</span>
                          </span>
                        </button>
                      </div>
                    )
                  })
                ) : (() => {
                  const cat = categories.find(c => c.id === saveToTab)
                  const projs = (cat?.projects || []).filter(p => !p.archived)
                  return (
                    <>
                      {projs.map((proj, i) => (
                        <div key={proj.id}>
                          {i > 0 && <div className="save-to-divider"/>}
                          <button
                            className={`save-to-option${saveToProject?.projectId === proj.id ? ' selected' : ''}`}
                            onMouseDown={e => { e.preventDefault(); setSaveToProject({ categoryId: saveToTab, projectId: proj.id }) }}
                          >
                            <div className={`save-to-radio${saveToProject?.projectId === proj.id ? ' filled' : ''}`}/>
                            <span>{proj.name}</span>
                          </button>
                        </div>
                      ))}
                      <AddCanvasRow
                        active={inputFocused}
                        categoryId={saveToTab}
                        onCreated={pick => setSaveToProject(pick)}
                        onDone={() => inputRef.current?.focus({ preventScroll: true })}
                      />
                    </>
                  )
                })()}
              </div>
              {!ccActive && <CardTabs
                categories={categories}
                selected={saveToTab}
                onSelect={(catId) => {
                  setSaveToTab(catId)
                  const cat = categories.find(c => c.id === catId)
                  const proj = cat?.projects.find(p => !p.archived)
                  setSaveToProject(proj ? { categoryId: catId, projectId: proj.id } : null)
                }}
              />}
            </div>
          </div>
        )}

        {/* Search results — same panel chrome as "Save to…" */}
        {searchOpen && (
          <div className="save-to-panel search-panel visible">
            <div className="save-to-card">
              <div className="save-to-header">
                <p className="save-to-title">Search results</p>
                <button
                  className="save-to-cancel"
                  onMouseDown={e => { e.preventDefault(); closeSearch() }}
                >Done</button>
              </div>
              <div
                className="save-to-scroll"
                onScroll={e => e.currentTarget.classList.toggle('scrolled', e.currentTarget.scrollTop > 4)}
              >
                {(() => {
                  const renderRow = (r, showDivider) => (
                    <div key={r.key}>
                      {showDivider && <div className="save-to-divider"/>}
                      <button
                        className="search-result-row"
                        /* The row's accent, for themes that colour the match text */
                        style={{ '--hit-rgb': getCategoryAccent(r.accentIdx).baseRgb }}
                        onMouseDown={e => { e.preventDefault(); openSearchResult(r) }}
                      >
                        <span className="search-result-icon" style={{ color: getCategoryAccent(r.accentIdx).base }}>
                          {r.type === 'list' && (
                            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
                              <circle cx="5" cy="7" r="1.5" fill="currentColor"/>
                              <line x1="9" y1="7" x2="19" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                              <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
                              <line x1="9" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                              <circle cx="5" cy="17" r="1.5" fill="currentColor"/>
                              <line x1="9" y1="17" x2="14" y2="17" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                            </svg>
                          )}
                          {r.type === 'note' && (
                            <svg width="18" height="18" viewBox="0 0 20 22" fill="none">
                              <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" fill="none"/>
                              <path d="M12 3v5h5" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
                              <line x1="5" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                              <line x1="5" y1="16.5" x2="12" y2="16.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                            </svg>
                          )}
                          {r.type === 'canvas' && (
                          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                            <rect x="3.5" y="2.5" width="13" height="9.5" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" fill="currentColor" fillOpacity="0.15"/>
                            <line x1="10" y1="12" x2="10" y2="17.5" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round"/>
                            <line x1="6" y1="12" x2="3.5" y2="17.5" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round"/>
                            <line x1="14" y1="12" x2="16.5" y2="17.5" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round"/>
                          </svg>
                        )}
                        {r.type === 'link' && (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                        <span className="search-result-text">
                          <span className="search-result-title">
                            {highlightMatch(r.title, searchQuery, `rgba(${getCategoryAccent(r.accentIdx).baseRgb}, 0.2)`)}
                          </span>
                          <span className="search-result-meta">
                            {r.type === 'canvas' ? r.categoryName : `${r.categoryName} · ${r.projectName}`}
                          </span>
                        </span>
                      </button>
                    </div>
                  )

                  const { visible, archived } = searchResults
                  if (visible.length === 0 && archived.length === 0) {
                    return <p className="save-to-empty search-empty">{searchQuery.trim() ? 'No matches' : ''}</p>
                  }
                  return (
                    <>
                      {visible.map((r, i) => renderRow(r, i > 0))}
                      {archived.length > 0 && (
                        <div className="search-archived-group">
                          <div className="search-archived-label">Archived</div>
                          {archived.map((r, i) => renderRow(r, i > 0))}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className={`footer${footerInputMode ? '' : ' category-mode'}${inputFocused ? ' keyboard-open' : ''}${searchOpen ? ' search-open' : ''}${pageMenuOpen ? ' easel-open' : ''}${pageScrollable ? ' has-scroll' : ''}`}
          style={{
            '--accent-base': activeAccent.base,
            '--accent-dark': activeAccent.dark,
            '--accent-light': activeAccent.light,
            '--accent-base-rgb': activeAccent.baseRgb,
          }}
        >

          {addToast && (
            <button
              key={addToast.key}
              className={`add-toast${addToastLeaving ? ' leaving' : ''}`}
              onPointerEnter={() => { addToastHover.current = true }}
              onPointerLeave={() => {
                addToastHover.current = false
                if (addToastPending.current) beginToastExit()
              }}
              onPointerMove={onToastPointerMove}
              onPointerCancel={endToastDrag}
              style={{
                '--accent-base': addToast.accent.base,
                '--accent-dark': addToast.accent.dark,
                '--accent-light': addToast.accent.light,
                '--accent-base-rgb': addToast.accent.baseRgb,
              }}
              /* Press to arm, release to go — so sliding off cancels it */
              onPointerDown={e => { e.preventDefault(); e.stopPropagation(); onToastPointerDown(e) }}
              onPointerUp={e => {
                e.preventDefault()
                e.stopPropagation()
                // A downward drag dismisses instead of opening.
                if (!endToastDrag(e)) return
                const t = addToast
                if (!t) return
                clearTimeout(addToastTimer.current)
                clearTimeout(addToastDelay.current)
                setAddToastLeaving(false)
                setAddToast(null)
                openSearchResult({
                  type: t.type,
                  projectId: t.projectId,
                  categoryId: t.categoryId,
                  itemId: t.holder.id,
                })
              }}
            >
              <span className="add-toast-icon"><ToastTypeIcon type={addToast.type}/></span>
              <span className="add-toast-text">
                <span className="add-toast-canvas">Added to {addToast.canvasName}</span>
                <span className="add-toast-title">{addToast.title}</span>
              </span>
              <svg className="add-toast-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h13M12.5 6l6 6-6 6" stroke="var(--accent-dark)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}

          {/* Only the text box follows the Save-to destination; the nav beneath it
              keeps the page's own accent. */}
          <div
            className="add-row"
            ref={addRowRef}
            style={{
              '--accent-base': footerAccent.base,
              '--accent-dark': footerAccent.dark,
              '--accent-light': footerAccent.light,
              '--accent-base-rgb': footerAccent.baseRgb,
            }}
          >
            {/* Mobile floating action bar — leading circle (hidden on desktop).
                Home page: gallery icon → jumps to the first project page.
                Project page: easel icon → jumps back home.
                Long-press opens the full page list. */}
            {/* Swallows every tap while the page menu is open. Sits above the rest
                of the control bar but below the menu itself, so the only live
                targets are the menu's own rows. */}
            {pageMenuOpen && (
              <div
                className="mbar-menu-scrim"
                onPointerDown={e => { e.preventDefault(); e.stopPropagation(); setPageMenuOpen(false); closeAddEasel() }}
                onClick={e => { e.preventDefault(); e.stopPropagation() }}
              />
            )}

            <div className="mbar-gallery-wrap" ref={pageMenuWrapRef}>
              <button
                className={`mbar-circle mbar-gallery${activeTab === 'star' ? ' on-gallery' : ''}${galleryPulse ? ` pulse-active pulse-${galleryPulse}` : ''}`}
                style={pulseVars}
                aria-label={activeTab === 'star' ? 'Projects' : 'Gallery'}
                onMouseDown={e => e.preventDefault()}
                onPointerDown={() => { if (!pageMenuOpen) startPageMenuPress() }}
                onPointerUp={cancelPageMenuPress}
                onPointerLeave={cancelPageMenuPress}
                onPointerCancel={cancelPageMenuPress}
                onContextMenu={e => e.preventDefault()}
                onClick={() => {
                  // A completed long-press already opened the menu — swallow the
                  // click it produces on release. This has to come before the
                  // dismiss branch below, or releasing the press closes the menu
                  // the press just opened.
                  if (pageMenuFiredRef.current) { pageMenuFiredRef.current = false; return }
                  // The button sits above the scrim, so a later tap dismisses too
                  if (pageMenuOpen) { setPageMenuOpen(false); closeAddEasel(); return }
                  // On the gallery page a tap opens the project list; on a project
                  // page it returns to the gallery (long-press opens the list).
                  if (activeTab === 'star') setPageMenuOpen(true)
                  else handleTabChange('star')
                }}
              >
                {activeTab === 'star' ? (
                  /* On the gallery page: easel, in black */
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <rect x="3.5" y="2.5" width="13" height="9.5" stroke="#242424" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                    <line x1="10" y1="12" x2="10" y2="17.5" stroke="#242424" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                    <line x1="6" y1="12" x2="3.5" y2="17.5" stroke="#242424" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                    <line x1="14" y1="12" x2="16.5" y2="17.5" stroke="#242424" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <polyline points="3,6.8 10,2.6 17,6.8" stroke="#242424" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                    <line x1="5" y1="7.6" x2="5" y2="14" stroke="#242424" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                    <line x1="8.33" y1="7.6" x2="8.33" y2="14" stroke="#242424" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                    <line x1="11.67" y1="7.6" x2="11.67" y2="14" stroke="#242424" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                    <line x1="15" y1="7.6" x2="15" y2="14" stroke="#242424" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                    <line x1="3.5" y1="14" x2="16.5" y2="14" stroke="#242424" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                    <line x1="3" y1="17" x2="17" y2="17" stroke="#242424" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                  </svg>
                )}
              </button>

            </div>

            {/* Add-new-easel field. While the Easels menu is open it takes over
                the control bar the way search does — the leading circle folds
                away and this expands in its place. Always mounted (parked when
                closed) so the tap that opens it can focus the input
                synchronously; iOS only raises the keyboard for a focus inside a
                gesture. The Easels menu hangs off this wrapper, which sits where
                the circle used to, so its offsets are unchanged. */}
            <div className={`mbar-easel-wrap${pageMenuOpen ? ' open' : ''}`}>
              <div
                className={`link-input-stack easel-stack${pageMenuOpen ? ' open' : ''}${addEaselOpen ? ' active' : ''}`}
                /* The confirm button's stroke + glow key off --cb-* / --accent-*;
                   use the colour this new easel is about to be given. */
                style={(() => {
                  const a = getCategoryAccent(categories.length)
                  return {
                    '--cb-base': a.base, '--cb-dark': a.dark, '--cb-light': a.light, '--cb-base-rgb': a.baseRgb,
                    '--accent-base': a.base, '--accent-dark': a.dark, '--accent-light': a.light, '--accent-base-rgb': a.baseRgb,
                  }
                })()}
                onMouseDown={e => {
                  if (!pageMenuOpen || addEaselOpen) return
                  if (e.target.closest('button')) return
                  e.preventDefault()
                  flushSync(() => { setAddEaselOpen(true); setAddEaselName('') })
                  addEaselRef.current?.focus()
                }}
              >
                {!addEaselOpen && (
                  <span className="mbar-placeholder" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                      <line x1="10" y1="3.5" x2="10" y2="16.5" stroke="#B5B4B2" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                      <line x1="3.5" y1="10" x2="16.5" y2="10" stroke="#B5B4B2" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    </svg>
                    <span className="mbar-placeholder-label">Add new easel</span>
                  </span>
                )}
                <input
                  ref={addEaselRef}
                  className="add-input easel-input"
                  placeholder={addEaselOpen ? 'Name easel' : ''}
                  value={addEaselName}
                  onChange={e => setAddEaselName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); submitAddEasel() }
                    if (e.key === 'Escape') { e.preventDefault(); closeAddEasel() }
                  }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="words"
                  spellCheck="false"
                  enterKeyHint="done"
                />
                {!addEaselOpen && (
                  <button
                    className="save-to-new-btn easel-close-btn"
                    aria-label="Close easels"
                    /* Resting, the X dismisses the whole Easels menu — the field
                       has nothing of its own to cancel yet. */
                    onPointerDown={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      setPageMenuOpen(false)
                      closeAddEasel()
                    }}
                    onClick={e => { e.preventDefault(); e.stopPropagation() }}
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M6 6 L14 14 M14 6 L6 14" stroke="#959493" strokeWidth="1" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
                {addEaselOpen && (
                  <button
                    className="save-to-new-btn easel-cancel-btn"
                    aria-label="Cancel"
                    /* pointerdown, not mousedown: on touch the synthesized mouse
                       event arrives after the button has already unmounted, and
                       the tap then lands on whatever is underneath. Cancelling
                       only puts the field back to rest — the Easels menu stays
                       open. */
                    onPointerDown={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      addEaselRef.current?.blur()
                      closeAddEasel()
                    }}
                    onClick={e => { e.preventDefault(); e.stopPropagation() }}
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M6 6 L14 14 M14 6 L6 14" stroke="#959493" strokeWidth="1" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
                {addEaselOpen && !!addEaselName.trim() && (
                  <button
                    className="save-to-new-send easel-send-btn"
                    aria-label="Create easel"
                    onPointerDown={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      addEaselRef.current?.blur()
                      submitAddEasel()
                    }}
                    onClick={e => { e.preventDefault(); e.stopPropagation() }}
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5 L8.5 15 L16 5.5" style={{ stroke: 'var(--cb-dark, #43535E)' }} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
              </div>

              <div className={`card-context-menu mbar-page-menu${pageMenuOpen ? ' open' : ''}`}>
                <div className="mbar-page-menu-header">
                  <p className="mbar-page-menu-title">Easels</p>
                  <button
                    className="save-to-cancel mbar-page-menu-close"
                    onMouseDown={e => { e.preventDefault(); setPageMenuOpen(false); closeAddEasel() }}
                  >Close</button>
                </div>

                <div className="mbar-page-menu-list" ref={easelListRef}>
                  {categories.map((cat, idx) => {
                    const acc = getCategoryAccent(idx)
                    const gradId = `easel-page-menu-${cat.id}`
                    return (
                      <div key={cat.id}>
                        <button
                          className="card-context-item"
                          data-cat-id={cat.id}
                          onMouseDown={e => e.preventDefault()}
                          onPointerDown={e => {
                            onEaselDrag(e, cat.id)
                            easelTap.current = { x: e.clientX, y: e.clientY, at: Date.now(), moved: false }
                            const onMove = (e2) => {
                              const t = easelTap.current
                              if (Math.abs(e2.clientX - t.x) > 8 || Math.abs(e2.clientY - t.y) > 8) t.moved = true
                            }
                            const onUp = () => {
                              document.removeEventListener('pointermove', onMove)
                              document.removeEventListener('pointerup', onUp)
                              const t = easelTap.current
                              if (!t.moved && Date.now() - t.at < 250) {
                                setPageMenuOpen(false)
                                closeAddEasel()
                                handleTabChange(cat.id)
                              }
                            }
                            document.addEventListener('pointermove', onMove)
                            document.addEventListener('pointerup', onUp)
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ stroke: acc.dark, marginRight: 2 }}>
                            <defs>
                              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor={acc.base} />
                                <stop offset="100%" stopColor={theme === 'light-dots' ? mixHex(acc.base, '#F0F0F0', 0.72) : acc.light} />
                              </linearGradient>
                            </defs>
                            <rect x="3.5" y="2.5" width="13" height="9.5" fill={`url(#${gradId})`} fillOpacity="0.6" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                            <line x1="10" y1="12" x2="10" y2="17.5" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                            <line x1="6" y1="12" x2="3.5" y2="17.5" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                            <line x1="14" y1="12" x2="16.5" y2="17.5" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                          </svg>
                          <span className="mbar-page-menu-label" style={{ color: acc.dark }}>{cat.name}</span>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Search field. Always mounted (parked offscreen when closed) so the
                Search button can focus it synchronously inside the tap — iOS only
                raises the keyboard for a focus() that happens in a user gesture. */}
            <div className={`link-input-stack search-stack${searchOpen ? ' open' : ''}`}>
                <span className="search-stack-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <circle cx="8.75" cy="8.75" r="5.25" stroke="#242424" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    <line x1="12.6" y1="12.6" x2="16.75" y2="16.75" stroke="#242424" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  </svg>
                </span>
                <input
                  ref={searchInputRef}
                  className="add-input search-input"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') closeSearch() }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  enterKeyHint="search"
                />
                <button
                  className="search-close-btn"
                  aria-label="Close search"
                  onMouseDown={e => { e.preventDefault(); closeSearch() }}
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <line x1="5" y1="5" x2="15" y2="15" stroke="#242424" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    <line x1="15" y1="5" x2="5" y2="15" stroke="#242424" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  </svg>
                </button>
            </div>

            <div
              className={`link-input-stack${searchOpen ? ' add-hidden' : ''}`}
              onPointerDown={e => {
                // Open on release, not on press. The field itself is
                // pointer-events:none while closed (see CSS), so a press can't
                // focus it — we just record the origin so a drag (tab swipe)
                // doesn't count as a tap.
                if (toolbarType === 'link') return
                if (e.target.closest('.send-btn')) return
                addTapRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
              }}
              onPointerUp={e => {
                if (toolbarType === 'link') return
                if (e.target.closest('.send-btn')) return
                const t = addTapRef.current
                addTapRef.current = null
                if (!t || t.id !== e.pointerId) return
                // Moved too far — that was a swipe, not a tap
                if (Math.abs(e.clientX - t.x) > 10 || Math.abs(e.clientY - t.y) > 10) return
                inputRef.current?.focus({ preventScroll: true })
              }}
              onPointerCancel={() => { addTapRef.current = null }}
            >
              {/* Centred "+ Add an item" overlay for the mobile pill (hidden on desktop
                  and while focused). Sits over the real input so the plus and the label
                  centre together as one group. */}
              {ccActive && ccAccent && (
                /* An input can only fill its whole box, so the highlight lives
                   on this mirror of the text; the real input is transparent. */
                <span className="cc-overlay" aria-hidden="true">
                  <span
                    className="cc-overlay-text"
                    style={{ background: `rgba(${ccAccent.baseRgb}, 0.2)`, color: ccAccent.base }}
                  >{inputValue}</span>
                </span>
              )}
              {dotsTheme ? (
                /* Dots themes: the resting Add item pill is three content-type
                   buttons, evenly spaced; tapping one opens Add item on that type.
                   The focus happens inside the tap so iOS raises the keyboard. */
                <span className="mbar-placeholder mbar-type-picks">
                  {[['list', FeatherListIcon, 'Add a list item'], ['note', FeatherFileIcon, 'Add a note'], ['link', FeatherLinkIcon, 'Add a link']].map(([type, Icon, label]) => (
                    <button
                      key={type}
                      type="button"
                      className="mbar-type-pick"
                      aria-label={label}
                      onPointerDown={e => { e.stopPropagation(); e.preventDefault() }}
                      onPointerUp={e => {
                        e.stopPropagation()
                        pendingTypeRef.current = type
                        flushSync(() => setToolbarType(type))
                        inputRef.current?.focus({ preventScroll: true })
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      <Icon size={20} color="#7A7A7A" />
                    </button>
                  ))}
                </span>
              ) : (
              <span className="mbar-placeholder" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <line x1="10" y1="3.5" x2="10" y2="16.5" stroke="#B5B4B2" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <line x1="3.5" y1="10" x2="16.5" y2="10" stroke="#B5B4B2" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </svg>
                <span className="mbar-placeholder-label">Add item</span>
              </span>
              )}
              <input
                ref={inputRef}
                className={`add-input${inputFocused && toolbarType !== 'link' ? ' focused' : ''}${ccActive ? ' cc-token' : ''}`}
                style={ccActive && ccAccent
                  ? { color: 'transparent', caretColor: ccAccent.dark }
                  : undefined}
                placeholder={toolbarType === 'link' && inputFocused ? 'Title your link' : (dotsTheme && !inputFocused ? '' : (isMobileView ? 'Add an item' : 'Scribble something down...'))}
                value={inputValue}
                onChange={e => handleAddInputChange(e.target.value)}
                onFocus={() => setInputFocused(true)}
                onBlur={handleAddInputBlur}
                onKeyDown={e => { if (toolbarType === 'link') { if (e.key === 'Enter') { e.preventDefault(); linkUrlRef.current?.focus() } } else handleKeyDown(e) }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="sentences"
                spellCheck="false"
                /* In the canvas picker the return key selects rather than sends */
                enterKeyHint={toolbarType === 'link' ? 'next' : (ccActive ? 'done' : 'send')}
              />
              <div className={`add-link-url-wrap${toolbarType === 'link' && inputFocused ? ' open' : ''}`}>
                <div className="add-input-divider"/>
                <input
                  ref={linkUrlRef}
                  className="add-input link-url-input"
                  placeholder="Add link"
                  value={linkUrlValue}
                  onChange={e => setLinkUrlValue(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={handleAddInputBlur}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  enterKeyHint="send"
                  inputMode="url"
                  tabIndex={toolbarType === 'link' && inputFocused ? 0 : -1}
                />
                {!!linkUrlValue && (
                  <button
                    className="add-link-clear"
                    aria-label="Clear link"
                    tabIndex={toolbarType === 'link' && inputFocused ? 0 : -1}
                    onMouseDown={e => { e.preventDefault(); setLinkUrlValue(''); linkUrlRef.current?.focus() }}
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M6 6 L14 14 M14 6 L6 14" stroke="#959493" strokeWidth="1" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
                {!linkUrlValue && (
                  <button
                    className="paste-btn"
                    tabIndex={toolbarType === 'link' && inputFocused ? 0 : -1}
                    aria-label="Paste"
                    onMouseDown={e => {
                      e.preventDefault()
                      pasteInto(setLinkUrlValue, linkUrlRef)
                    }}
                  >
                    <span className="paste-btn-label">Paste</span>
                    {/* Clipboard icon — shown instead of the label where the
                        theme makes Paste a round button */}
                    <svg className="paste-btn-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#242424" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" vectorEffect="non-scaling-stroke"/>
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" vectorEffect="non-scaling-stroke"/>
                    </svg>
                  </button>
                )}
              </div>
              <button
                className={`send-btn${inputFocused || inputValue.trim() || (toolbarType === 'link' && linkUrlValue.trim()) ? ' visible' : ''}`}
                onMouseDown={e => { e.preventDefault(); addItem() }}
              >
                <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
                  <path d="M10 16 L10 4" style={{ stroke: 'var(--accent-dark)' }} strokeWidth="1" strokeLinecap="round"/>
                  <path d="M4 9 L10 3 L16 9" style={{ stroke: 'var(--accent-dark)' }} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Mobile floating action bar — trailing Search circle (hidden on desktop) */}
            <button
              className="mbar-circle mbar-search"
              aria-label="Search"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                // Focus first, still inside the gesture, then re-style into place
                searchInputRef.current?.focus({ preventScroll: true })
                setSearchOpen(true)
              }}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <circle cx="8.75" cy="8.75" r="5.25" stroke="#242424" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <line x1="12.6" y1="12.6" x2="16.75" y2="16.75" stroke="#242424" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
            </button>
          </div>

          <div className="tab-area">
            {/* Input toolbar */}
            <div
              className={`input-toolbar${inputFocused ? ' visible' : ''}${toolbarFadedIn ? ' faded-in' : ''}`}
              style={{
                '--accent-base': footerAccent.base,
                '--accent-dark': footerAccent.dark,
                '--accent-light': footerAccent.light,
                '--accent-base-rgb': footerAccent.baseRgb,
              }}
            >
              <div className="toolbar-left">
                <button
                  className={`toolbar-source-btn${addAsActiveFlag ? '' : ' inactive'}`}
                  onMouseDown={e => { e.preventDefault(); setAddAsActiveFlag(v => !v) }}
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" style={{ fill: addAsActiveFlag ? 'rgba(var(--accent-base-rgb),0.3)' : 'none', stroke: addAsActiveFlag ? 'var(--accent-base)' : '#242424' }}>
                    <polyline points="3,6.8 10,2.6 17,6.8" vectorEffect="non-scaling-stroke"/>
                    <line x1="5" y1="7.6" x2="5" y2="14" vectorEffect="non-scaling-stroke"/>
                    <line x1="8.33" y1="7.6" x2="8.33" y2="14" vectorEffect="non-scaling-stroke"/>
                    <line x1="11.67" y1="7.6" x2="11.67" y2="14" vectorEffect="non-scaling-stroke"/>
                    <line x1="15" y1="7.6" x2="15" y2="14" vectorEffect="non-scaling-stroke"/>
                    <line x1="3.5" y1="14" x2="16.5" y2="14" vectorEffect="non-scaling-stroke"/>
                    <line x1="3" y1="17" x2="17" y2="17" vectorEffect="non-scaling-stroke"/>
                  </svg>
                  <span className={`toolbar-source-label${addAsActiveFlag ? '' : ' inactive'}`}>{addAsActiveFlag ? 'Displayed' : 'Display'}</span>
                </button>
              </div>
              <div className="toolbar-divider"></div>
              <div className="toolbar-right">
                <div className="toolbar-indicator" id="toolbarIndicator"></div>
                <button
                  className={`toolbar-icon-btn${toolbarType === 'list' ? ' selected' : ''}`}
                  onMouseDown={e => { e.preventDefault(); setToolbarType('list') }}
                >
                  {featherTabs ? <FeatherListIcon size={toolbarType === 'list' ? 24 : 20} color={toolbarType === 'list' ? 'var(--accent-base)' : '#7A7A7A'}/> : (
                  <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                    <circle cx="5" cy="7" r="1.5" fill={toolbarType === 'list' ? '#607787' : '#3D3D3D'}/>
                    <line x1="9" y1="7" x2="19" y2="7" stroke={toolbarType === 'list' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinecap="round"/>
                    <circle cx="5" cy="12" r="1.5" fill={toolbarType === 'list' ? '#607787' : '#3D3D3D'}/>
                    <line x1="9" y1="12" x2="19" y2="12" stroke={toolbarType === 'list' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinecap="round"/>
                    <circle cx="5" cy="17" r="1.5" fill={toolbarType === 'list' ? '#607787' : '#3D3D3D'}/>
                    <line x1="9" y1="17" x2="14" y2="17" stroke={toolbarType === 'list' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinecap="round"/>
                  </svg>)}
                </button>
                <button
                  className={`toolbar-icon-btn${toolbarType === 'note' ? ' selected' : ''}`}
                  onMouseDown={e => { e.preventDefault(); setToolbarType('note') }}
                >
                  {featherTabs ? <FeatherFileIcon size={toolbarType === 'note' ? 24 : 20} color={toolbarType === 'note' ? 'var(--accent-base)' : '#7A7A7A'}/> : (
                  <svg width="20" height="20" viewBox="0 0 20 22" fill="none">
                    <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" stroke={toolbarType === 'note' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinejoin="round" fill="none"/>
                    <path d="M12 3v5h5" stroke={toolbarType === 'note' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinejoin="round"/>
                    <line x1="5" y1="13" x2="15" y2="13" stroke={toolbarType === 'note' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinecap="round"/>
                    <line x1="5" y1="16.5" x2="12" y2="16.5" stroke={toolbarType === 'note' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinecap="round"/>
                  </svg>)}
                </button>
                <button
                  className={`toolbar-icon-btn${toolbarType === 'link' ? ' selected' : ''}`}
                  onMouseDown={e => {
                    e.preventDefault()
                    // Whatever was typed as a list item / note becomes the URL, and
                    // the title field above it is left empty and focused.
                    if (toolbarType !== 'link') {
                      const carried = inputValue.trim()
                      if (carried) { setLinkUrlValue(carried); setInputValue('') }
                      setCcActive(false)
                      setCcPick(null)
                    }
                    setToolbarType('link')
                  }}
                >
                  {featherTabs ? <FeatherLinkIcon size={toolbarType === 'link' ? 24 : 20} color={toolbarType === 'link' ? 'var(--accent-base)' : '#7A7A7A'}/> : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke={toolbarType === 'link' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke={toolbarType === 'link' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>)}
                </button>
              </div>
            </div>

            <TabBar activeTab={activeTab} onSelectTab={handleTabChange} inputFocused={inputFocused} onTabsScroll={handleTabsScroll} pulse={galleryPulse} pulseVars={pulseVars} />
          </div>


        </div>

        {orphanNote && createPortal(
          <NoteDetailPage
            note={orphanNote.note}
            onClose={() => setOpenDetail(null)}
            onSave={(noteId, html, text) => updateProjectNote(orphanNote.cat.id, orphanNote.proj.id, noteId, html, text)}
            activated={!!orphanNote.note.activated}
            onToggleActive={() => toggleProjectNoteActivated(orphanNote.cat.id, orphanNote.proj.id, orphanNote.note.id)}
            onSchedule={(date) => setProjectNoteScheduled(orphanNote.cat.id, orphanNote.proj.id, orphanNote.note.id, date)}
            onClearSchedule={() => setProjectNoteScheduled(orphanNote.cat.id, orphanNote.proj.id, orphanNote.note.id, null)}
            projectName={orphanNote.proj.name}
            categoryId={orphanNote.cat.id}
            projectId={orphanNote.proj.id}
            archived={!!(orphanNote.note.archived || orphanNote.proj.archived)}
          />,
          document.getElementById('app')
        )}

        {/* Settings sheet — slides up over the homepage. Mobile only (CSS hides it
            above 1000px, where Settings stays a normal nav tab). */}
        {settingsMounted && (
          <div className={`settings-sheet${settingsIn ? ' open' : ''}`}>
            <MenuPage onSelectTab={handleTabChange} onClose={() => setSettingsOpen(false)} />
          </div>
        )}

        {/* Parked, focusable input that holds the keyboard open while a new
            note's editor is still opening. Never receives typed input. */}
        <input
          className="kb-keeper"
          ref={registerKeyboardKeeper}
          tabIndex={-1}
          aria-hidden="true"
          readOnly
        />

        {/* Below the control (z-index 2): the activated row flies under it */}
        {/* Drag the detail panel's left edge to resize it (desktop; the width
            lives on :root so every panel opened this session inherits it). */}
        <div
          className="detail-resize-handle"
          onPointerDown={e => {
            if (e.button !== 0) return
            e.preventDefault()
            const panel = document.querySelector('.note-detail-page')
            const startW = panel ? panel.getBoundingClientRect().width : 500
            const startX = e.clientX
            const onMove = (e2) => {
              const w = Math.max(400, Math.min(750, startW - (e2.clientX - startX)))
              document.documentElement.style.setProperty('--detail-w', w + 'px')
            }
            const onUp = () => {
              document.removeEventListener('pointermove', onMove)
              document.removeEventListener('pointerup', onUp)
              document.body.classList.remove('resizing-detail')
            }
            document.body.classList.add('resizing-detail')
            document.addEventListener('pointermove', onMove)
            document.addEventListener('pointerup', onUp)
          }}
        />

        <div id="animation-portal-under"></div>
        <div id="animation-portal"></div>
        <ArchiveAttachmentsModal />
        <DeleteConfirmModal />
        <MoveAttachmentsModal />
      </div>
    </div>
  )
}

// Bring a row into view by scrolling the PAGE only.
//
// element.scrollIntoView() scrolls every scrollable ancestor — and a box with
// `overflow: hidden` still counts, so it will happily scroll a card's own body.
// That's what leaves a card sitting with its header scrolled out of sight.
function scrollRowIntoView(row) {
  if (!row) return
  const page = row.closest('.page')
  if (!page) return
  // Undo any inner box that a previous scrollIntoView (or a focus) nudged
  for (let el = row.parentElement; el && el !== page; el = el.parentElement) {
    if (el.scrollTop) el.scrollTop = 0
    if (el.scrollLeft) el.scrollLeft = 0
  }
  const pr = page.getBoundingClientRect()
  const rr = row.getBoundingClientRect()
  const top = page.scrollTop + (rr.top - pr.top) - (page.clientHeight - rr.height) / 2
  page.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

// Content-type glyph for the add toast — the same shapes as the footer toolbar.
function ToastTypeIcon({ type, size = 16 }) {
  if (type === 'note') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 22" fill="none">
        <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1" fill="none"/>
        <path d="M12 3v5h5" stroke="currentColor" strokeWidth="1" fill="none"/>
        <line x1="5" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
        <line x1="5" y1="16.5" x2="12" y2="16.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      </svg>
    )
  }
  if (type === 'link') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <circle cx="5" cy="7" r="1.5" fill="currentColor"/>
      <line x1="9" y1="7" x2="19" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
      <line x1="9" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <circle cx="5" cy="17" r="1.5" fill="currentColor"/>
      <line x1="9" y1="17" x2="14" y2="17" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

function AuthGate() {
  const { user } = useAuth()
  if (user === undefined) return null // still loading session
  if (!user) return <AuthScreen />
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}
