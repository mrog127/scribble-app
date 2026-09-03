import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { ACCENT_COLORS, getCategoryAccent } from './theme.js'
import ActivePage from './components/ActivePage.jsx'
import CategoryPage from './components/CategoryPage.jsx'
import TabBar from './components/TabBar.jsx'
import AuthScreen from './components/AuthScreen.jsx'
import MenuPage from './components/MenuPage.jsx'
import ArchiveAttachmentsModal from './components/ArchiveAttachmentsModal.jsx'
import DeleteConfirmModal from './components/DeleteConfirmModal.jsx'
import MoveAttachmentsModal from './components/MoveAttachmentsModal.jsx'
import CardTabs from './components/CardTabs.jsx'
import { AppProvider, useAppContext } from './context/AppContext.jsx'
import { requestProjectFocus, setOpenInCanvas } from './searchFocus.js'
import AddCanvasRow from './components/AddCanvasRow.jsx'
import { subscribeGalleryPulse, setOrderHold } from './galleryPulse.js'
import { registerKeyboardKeeper, keepKeyboardAlive } from './keyboardKeeper.js'
import { pasteInto } from './clipboard.js'

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

// Pull-to-refresh: pull down at the top of the active page to re-fetch data.
// Touch-only; drives a spinner via direct DOM for smoothness.
function usePullToRefresh(onRefresh) {
  const spinnerRef = useRef(null)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    const app = document.getElementById('app')
    if (!app) return
    const THRESHOLD = 64, MAX = 96
    const s = { active: false, startY: 0, page: null, dist: 0, refreshing: false }

    const setSpinner = (dist) => {
      const el = spinnerRef.current
      if (!el) return
      const t = Math.min(dist, MAX)
      el.style.opacity = String(Math.min(1, dist / THRESHOLD))
      el.style.transform = `translateX(-50%) translateY(${Math.min(t, 56) - 40}px) rotate(${dist * 2.5}deg)`
    }
    const reset = () => {
      s.active = false; s.dist = 0
      const el = spinnerRef.current
      if (!el) return
      el.style.transition = 'transform 250ms ease, opacity 250ms ease'
      el.style.transform = 'translateX(-50%) translateY(-40px)'
      el.style.opacity = '0'
      el.classList.remove('spinning')
      setTimeout(() => { if (el) el.style.transition = '' }, 250)
    }
    const onStart = (e) => {
      if (s.refreshing) return
      if (e.target.closest('.note-detail-page') || e.target.closest('.footer') || e.target.closest('.save-to-panel')) return
      const page = document.querySelector('#app .page:not(.page-exiting)')
      if (!page || page.scrollTop > 0) return
      s.page = page; s.startY = e.touches[0].clientY; s.active = true; s.dist = 0
      const el = spinnerRef.current; if (el) el.style.transition = ''
    }
    const onMove = (e) => {
      if (!s.active || s.refreshing) return
      if (!s.page || s.page.scrollTop > 0) { s.active = false; setSpinner(0); return }
      const dy = e.touches[0].clientY - s.startY
      if (dy <= 0) { s.dist = 0; setSpinner(0); return }
      s.dist = dy * 0.5
      e.preventDefault()
      setSpinner(s.dist)
    }
    const startRefresh = () => {
      s.refreshing = true; s.active = false; wheelDist = 0
      const el = spinnerRef.current
      if (el) {
        el.style.transition = 'transform 200ms ease, opacity 200ms ease'
        el.style.transform = 'translateX(-50%) translateY(16px)'
        el.style.opacity = '1'
        el.classList.add('spinning')
        setTimeout(() => { if (el) el.style.transition = '' }, 200)
      }
      const done = () => setTimeout(() => { s.refreshing = false; reset() }, 500)
      Promise.resolve(onRefreshRef.current && onRefreshRef.current()).then(done, done)
    }
    const onEnd = () => {
      if (!s.active || s.refreshing) return
      if (s.dist >= THRESHOLD) startRefresh()
      else reset()
    }

    // Desktop trackpad: a pull only counts after the page has come to REST at the top
    // (no wheel activity for 300ms while at scrollTop 0), then a deliberate scroll-up.
    // Momentum from scrolling up into the top keeps resetting the idle timer, so it
    // never arms — preventing accidental refreshes just from reaching the top.
    let wheelDist = 0, wheelTimer = null, idleTimer = null, topIdle = true
    const scheduleIdle = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        if (s.refreshing) return
        const p = document.querySelector('#app .page:not(.page-exiting)')
        if (p && p.scrollTop <= 0) topIdle = true
      }, 300)
    }
    const onWheel = (e) => {
      if (s.refreshing) return
      if (e.target.closest('.note-detail-page') || e.target.closest('.footer') || e.target.closest('.save-to-panel')) return
      const page = document.querySelector('#app .page:not(.page-exiting)')
      if (!page) return
      const atTop = page.scrollTop <= 0
      if (!atTop) topIdle = false
      const pulling = atTop && topIdle && e.deltaY < 0 && Math.abs(e.deltaY) >= Math.abs(e.deltaX)
      if (!pulling) {
        if (wheelDist > 0) { wheelDist = 0; setSpinner(0) }
        scheduleIdle()
        return
      }
      e.preventDefault()
      wheelDist += (-e.deltaY) * 0.5
      setSpinner(wheelDist)
      clearTimeout(wheelTimer)
      wheelTimer = setTimeout(() => {
        if (wheelDist >= THRESHOLD) startRefresh()
        else { wheelDist = 0; reset() }
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
    categories, activeTodos, activeNotes,
    addActiveTodo, addActiveNote, toggleActiveTodo, deleteActiveTodo, deleteActiveNote, updateActiveNote, reorderActiveTodos, reorderActiveNotes,
    addProjectTodo, addProjectNote, addProjectLink,
    setOpenDetail, setAutoEditNoteId, refresh,
    registerComposeHandler,
  } = useAppContext()
  const pullSpinnerRef = usePullToRefresh(refresh)
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

    const clone = document.createElement('div')
    clone.style.cssText = [
      'position:absolute',
      `left:${from.left - appR.left}px`,
      `top:${from.top - appR.top}px`,
      `width:${from.width}px`,
      `height:${from.height}px`,
      'overflow:hidden',
      'pointer-events:none',
      'background:#F7F6F3',
      'border:1px solid #C2C1BF',
      'border-radius:8px',
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
  // canvas search: the `@` drops away, what follows becomes a highlighted token,
  // and the Save-to list shows matching canvases from every page. Space commits
  // the highlighted one.
  const [ccActive, setCcActive] = useState(false)
  const [ccPick, setCcPick] = useState(null)   // { categoryId, projectId } | null

  const ccMatches = useMemo(() => {
    if (!ccActive) return []
    const q = inputValue.trim().toLowerCase()
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
      // Space commits; anything else refines the search.
      if (/\s/.test(raw)) { ccCommit(ccSelectedRef.current); return }
      if (raw === '') { setCcActive(false); setCcPick(null) }
      setInputValue(raw)
      return
    }
    // Only the very start of an empty field can open the picker.
    if (/^@/.test(raw)) {
      setCcActive(true)
      setCcPick(null)
      setInputValue(raw.slice(1))   // the "@" itself drops away
      return
    }
    setInputValue(raw)
  }, [ccActive, ccCommit])

  const [saveToProject, setSaveToProject] = useState(null)   // { categoryId, projectId }
  const [saveToTab, setSaveToTab] = useState(null)           // category whose projects show in the Save to card
  const lastAddedRef = useRef(null)                          // last project saved to (in-memory, until refresh)
  const categoryDefaultRef = useRef(null)                    // scroll-based default project on a category page
  const pendingComposeRef = useRef(null)                     // { categoryId, projectId } from a project-card "Add" button
  const saveToScrollRef = useRef(null)                       // the Save to list scroller
  const lastPickedRef = useRef(null)                         // { tab, target } last canvas chosen on this page (cleared on page change)

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
  const toggleCollapsed = useCallback((catId) => {
    setCollapsedMap(prev => {
      const cur = catId in prev ? prev[catId] : readCollapsedLS(catId)
      const next = !cur
      try { localStorage.setItem(`cat-collapsed-${catId}`, next ? 'true' : 'false') } catch {}
      return { ...prev, [catId]: next }
    })
  }, [])

  const activeCategoryCollapsed = categoryIds.includes(activeTab) && getCollapsed(activeTab)
  // The footer text box is available on the homescreen and on every category page
  // (items are always added from the footer); only the Menu page has none.
  const footerInputMode = activeTab === 'star' || categoryIds.includes(activeTab)

  // A canvas chosen in "Save to..." is remembered only for as long as we stay on
  // the same page; changing pages drops it so the page's own default takes over.
  useEffect(() => { lastPickedRef.current = null }, [activeTab])

  // Reset to star tab if active category tab is deleted
  useEffect(() => {
    if (activeTab !== 'star' && activeTab !== 'menu' && !categories.some(c => c.id === activeTab)) {
      setActiveTab('star')
    }
  }, [categories]) // eslint-disable-line

  // Which project card is the scroll-based default on an expanded category page:
  // the top card when scrolled to top, the bottom card when scrolled to bottom,
  // otherwise the card most centered in the view. Read from the live DOM, so it
  // must be called on focus, before the Save to panel collapses the page. Returns
  // a project id (string) or null (e.g. a collapsed page has no project cards).
  const measureCategoryDefault = (categoryId) => {
    const page = document.getElementById(`page-${categoryId}`)
    if (!page) return null
    // Non-archived project cards are wrapped in [data-project-id]; archived ones
    // use [data-archived-id], so this is exactly the addable cards.
    const cards = [...page.querySelectorAll('[data-project-id]')]
    if (!cards.length) return null
    const atTop = page.scrollTop <= 4
    const atBottom = page.scrollTop + page.clientHeight >= page.scrollHeight - 4
    let chosen
    if (atTop) chosen = cards[0]
    else if (atBottom) chosen = cards[cards.length - 1]
    else {
      const pr = page.getBoundingClientRect()
      const center = pr.top + pr.height / 2
      let best = cards[0], bestDist = Infinity
      for (const c of cards) {
        const r = c.getBoundingClientRect()
        const d = Math.abs((r.top + r.height / 2) - center)
        if (d < bestDist) { bestDist = d; best = c }
      }
      chosen = best
    }
    return chosen.getAttribute('data-project-id')
  }

  // The default destination for the "Save to..." card, by context:
  //  - any category page → that category's tab; the project follows the scroll
  //    position captured into categoryDefaultRef (collapsed pages fall back to the
  //    top project, since they show no project cards)
  //  - homescreen → the project last added to this session, else the first project
  //    of the first tab. Archived projects are never offered.
  const computeSaveDefault = useCallback(() => {
    const firstActive = (cat) => cat?.projects.find(p => !p.archived) || null
    if (categoryIds.includes(activeTab)) {
      // Last canvas picked while on this page wins over the scroll-based default.
      const picked = lastPickedRef.current
      if (picked?.target) {
        const pc = categories.find(c => c.id === picked.target.categoryId)
        if (pc?.projects.some(p => p.id === picked.target.projectId && !p.archived)) {
          return { tab: picked.tab, target: picked.target }
        }
      }
      const cat = categories.find(c => c.id === activeTab)
      const measured = categoryDefaultRef.current
      let proj = null
      if (measured && measured.categoryId === activeTab && measured.projectId != null) {
        proj = cat?.projects.find(p => String(p.id) === String(measured.projectId) && !p.archived) || null
      }
      if (!proj) proj = firstActive(cat)
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
        setToolbarType('list')     // every fresh open starts on the list type
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

  const openSearchResult = useCallback((r) => {
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
    handleTabChange(r.categoryId)
    // Wait for the destination canvas + its content tab to render, scroll the row
    // itself into view, then flash it once the smooth scroll has actually settled.
    let tries = 0
    const hunt = setInterval(() => {
      requestProjectFocus(focusReq)
      const scope = document.querySelector(`[data-project-id="${r.projectId}"]`)
        || document.querySelector(`[data-archived-id="${r.projectId}"]`)
      // Canvas results flash the whole card; item results flash their row.
      const row = isCanvas
        ? scope?.querySelector('.card')
        : scope?.querySelector(`.swipe-row[data-swipe-id="${r.itemId}"]`)
      if (!row) {
        if (++tries > 40) clearInterval(hunt)
        return
      }
      clearInterval(hunt)

      const flash = () => {
        row.classList.remove('search-flash')
        void row.offsetWidth
        row.classList.add('search-flash')
        setTimeout(() => row.classList.remove('search-flash'), 1500)
      }

      // Revealing the item changes the card's height (expand animation, plus rows
      // that were hidden), so one scroll pass lands against a moving layout.
      // Scroll, let it settle, then correct and only then flash.
      const settleAndScroll = () => {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
            row.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
  }, [closeSearch, handleTabChange])

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
        if (isTileDragging()) { dragRef.current = null; return }
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

  const addItem = useCallback(() => {
    // Link mode: requires a URL and a destination project
    if (toolbarType === 'link') {
      const url = linkUrlValue.trim()
      if (!url) return
      if (footerInputMode && saveToProject) {
        addProjectLink(saveToProject.categoryId, saveToProject.projectId, inputValue.trim(), url, addAsActiveFlag)
        lastAddedRef.current = { categoryId: saveToProject.categoryId, projectId: saveToProject.projectId }
      }
      setInputValue('')
      setLinkUrlValue('')
      setToolbarType('list')
      linkUrlRef.current?.blur()
      inputRef.current?.blur()
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
        if (toolbarType === 'list') {
          newId = addProjectTodo(categoryId, projectId, text, true)
        } else {
          const holder = { id: null }
          newId = addProjectNote(categoryId, projectId, text, true, null, (rid) => { holder.id = rid })
          holder.id = newId
          openNoteSoon('note', holder)
        }

        if (animRect && appRect && newId != null) {
          pendingProjectAnimRef.current = { id: newId, type: toolbarType, text, inputRect: animRect, appRect }
        }
      } else {
        // Inactive: add without animation
        if (toolbarType === 'list') addProjectTodo(categoryId, projectId, text, addAsActiveFlag)
        else if (toolbarType === 'note') {
          const holder = { id: null }
          holder.id = addProjectNote(categoryId, projectId, text, addAsActiveFlag, null, (rid) => { holder.id = rid })
          openNoteSoon('note', holder)
        }
      }

      setInputValue('')
      // A note opens into edit mode later, on a timer — keep the keyboard up so
      // focus can transfer to the editor when it does.
      if (toolbarType === 'note') keepKeyboardAlive()
      inputRef.current?.blur()
      return
    }

    // Fallback applies only on the homescreen (collapsed category with no
    // projects has nowhere to save, so do nothing there)
    if (activeTab !== 'star') { setInputValue(''); inputRef.current?.blur(); return }

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
  }, [inputValue, linkUrlValue, activeTab, footerInputMode, toolbarType, saveToProject, addAsActiveFlag, addProjectTodo, addProjectNote, addProjectLink, addActiveTodo, addActiveNote, setOpenDetail, setAutoEditNoteId])

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
    if (e.key === 'Enter') { e.preventDefault(); addItem() }
  }, [addItem])

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
    return idx >= 0 ? getCategoryAccent(idx).base : ACCENT_COLORS[0].base
  }, [categories, activeTab])

  const activeAccent = useMemo(() => {
    if (activeTab === 'star' || activeTab === 'menu') return ACCENT_COLORS[0]
    const idx = categories.findIndex(c => c.id === activeTab)
    if (idx === -1) return ACCENT_COLORS[0]
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
        className={`phone${inputFocused && footerInputMode ? ' save-panel-open' : ''}${searchOpen ? ' save-panel-open search-panel-open' : ''}${pageMenuOpen ? ' page-menu-open' : ''}`}
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

        {/* Persistent date header — shown in the left sidebar on desktop only */}
        <div className="sidebar-date">
          <p className="active-today-label">Today is</p>
          <p className="active-day-name">{dayName},</p>
          <GalleryDecoration className="active-date-decoration" style={{ color: decorationColor }} />
          <p className="active-month-date">{monthDate}</p>
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
                            onMouseDown={e => {
                              e.preventDefault()
                              const pick = { categoryId: saveToTab, projectId: proj.id }
                              setSaveToProject(pick)
                              lastPickedRef.current = { tab: saveToTab, target: pick }
                            }}
                          >
                            <div className={`save-to-radio${saveToProject?.projectId === proj.id ? ' filled' : ''}`}/>
                            <span>{proj.name}</span>
                          </button>
                        </div>
                      ))}
                      <AddCanvasRow
                        active={inputFocused}
                        categoryId={saveToTab}
                        onCreated={pick => { setSaveToProject(pick); lastPickedRef.current = { tab: saveToTab, target: pick } }}
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
                  const pick = proj ? { categoryId: catId, projectId: proj.id } : null
                  setSaveToProject(pick)
                  lastPickedRef.current = { tab: catId, target: pick }
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
          className={`footer${footerInputMode ? '' : ' category-mode'}${inputFocused ? ' keyboard-open' : ''}${searchOpen ? ' search-open' : ''}${pageScrollable ? ' has-scroll' : ''}`}
          style={{
            '--accent-base': activeAccent.base,
            '--accent-dark': activeAccent.dark,
            '--accent-light': activeAccent.light,
            '--accent-base-rgb': activeAccent.baseRgb,
          }}
        >

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
                onPointerDown={e => { e.preventDefault(); e.stopPropagation(); setPageMenuOpen(false) }}
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
                  if (pageMenuOpen) { setPageMenuOpen(false); return }
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

              {/* Long-press page list — Gallery on top, then every project page */}
              <div className={`card-context-menu mbar-page-menu${pageMenuOpen ? ' open' : ''}`}>
                {categories.map((cat, idx) => {
                  const acc = getCategoryAccent(idx)
                  const gradId = `easel-canvas-${cat.id}`
                  return (
                    <button
                      key={cat.id}
                      className="card-context-item"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setPageMenuOpen(false); handleTabChange(cat.id) }}
                    >
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ stroke: acc.dark }}>
                        <defs>
                          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={acc.base} />
                            <stop offset="100%" stopColor={acc.light} />
                          </linearGradient>
                        </defs>
                        <rect x="3.5" y="2.5" width="13" height="9.5" fill={`url(#${gradId})`} fillOpacity="0.5" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                        <line x1="10" y1="12" x2="10" y2="17.5" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                        <line x1="6" y1="12" x2="3.5" y2="17.5" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                        <line x1="14" y1="12" x2="16.5" y2="17.5" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                      </svg>
                      <span className="mbar-page-menu-label">{cat.name}</span>
                    </button>
                  )
                })}
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
              <span className="mbar-placeholder" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <line x1="10" y1="3.5" x2="10" y2="16.5" stroke="#B5B4B2" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <line x1="3.5" y1="10" x2="16.5" y2="10" stroke="#B5B4B2" strokeWidth="1" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </svg>
                <span className="mbar-placeholder-label">Add item</span>
              </span>
              <input
                ref={inputRef}
                className={`add-input${inputFocused && toolbarType !== 'link' ? ' focused' : ''}${ccActive ? ' cc-token' : ''}`}
                style={ccActive && ccAccent
                  ? { color: 'transparent', caretColor: ccAccent.dark }
                  : undefined}
                placeholder={toolbarType === 'link' && inputFocused ? 'Title your link' : (isMobileView ? 'Add an item' : 'Scribble something down...')}
                value={inputValue}
                onChange={e => handleAddInputChange(e.target.value)}
                onFocus={() => {
                  // Capture the scroll-based default project before the page collapses.
                  categoryDefaultRef.current = categoryIds.includes(activeTab)
                    ? { categoryId: activeTab, projectId: measureCategoryDefault(activeTab) }
                    : null
                  setInputFocused(true)
                }}
                onBlur={handleAddInputBlur}
                onKeyDown={e => { if (toolbarType === 'link') { if (e.key === 'Enter') { e.preventDefault(); linkUrlRef.current?.focus() } } else handleKeyDown(e) }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="sentences"
                spellCheck="false"
                enterKeyHint={toolbarType === 'link' ? 'next' : 'send'}
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
                    onMouseDown={e => {
                      e.preventDefault()
                      pasteInto(setLinkUrlValue, linkUrlRef)
                    }}
                  >Paste</button>
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
                  <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                    <circle cx="5" cy="7" r="1.5" fill={toolbarType === 'list' ? '#607787' : '#3D3D3D'}/>
                    <line x1="9" y1="7" x2="19" y2="7" stroke={toolbarType === 'list' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinecap="round"/>
                    <circle cx="5" cy="12" r="1.5" fill={toolbarType === 'list' ? '#607787' : '#3D3D3D'}/>
                    <line x1="9" y1="12" x2="19" y2="12" stroke={toolbarType === 'list' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinecap="round"/>
                    <circle cx="5" cy="17" r="1.5" fill={toolbarType === 'list' ? '#607787' : '#3D3D3D'}/>
                    <line x1="9" y1="17" x2="14" y2="17" stroke={toolbarType === 'list' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinecap="round"/>
                  </svg>
                </button>
                <button
                  className={`toolbar-icon-btn${toolbarType === 'note' ? ' selected' : ''}`}
                  onMouseDown={e => { e.preventDefault(); setToolbarType('note') }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 22" fill="none">
                    <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" stroke={toolbarType === 'note' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinejoin="round" fill="none"/>
                    <path d="M12 3v5h5" stroke={toolbarType === 'note' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinejoin="round"/>
                    <line x1="5" y1="13" x2="15" y2="13" stroke={toolbarType === 'note' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinecap="round"/>
                    <line x1="5" y1="16.5" x2="12" y2="16.5" stroke={toolbarType === 'note' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinecap="round"/>
                  </svg>
                </button>
                <button
                  className={`toolbar-icon-btn${toolbarType === 'link' ? ' selected' : ''}`}
                  onMouseDown={e => { e.preventDefault(); setToolbarType('link') }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke={toolbarType === 'link' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke={toolbarType === 'link' ? '#607787' : '#3D3D3D'} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>

            <TabBar activeTab={activeTab} onSelectTab={handleTabChange} inputFocused={inputFocused} onTabsScroll={handleTabsScroll} pulse={galleryPulse} pulseVars={pulseVars} />
          </div>


        </div>

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
