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
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { useScrollable } from './useScrollable.js'
import GalleryDecoration from './assets/gallery-page-decoration.svg?react'

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
  const [inputValue, setInputValue] = useState('')
  const [linkUrlValue, setLinkUrlValue] = useState('')
  const [headerOpacity, setHeaderOpacity] = useState(1)
  const [headerTranslate, setHeaderTranslate] = useState(0)
  const [saveToProject, setSaveToProject] = useState(null)   // { categoryId, projectId }
  const [saveToTab, setSaveToTab] = useState(null)           // category whose projects show in the Save to card
  const lastAddedRef = useRef(null)                          // last project saved to (in-memory, until refresh)
  const categoryDefaultRef = useRef(null)                    // scroll-based default project on a category page
  const pendingComposeRef = useRef(null)                     // { categoryId, projectId } from a project-card "Add" button
  const saveToScrollRef = useRef(null)                       // the Save to list scroller
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
        const { tab, target } = computeSaveDefault()
        setSaveToTab(tab)
        setSaveToProject(target)
      }
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
    if (inputFocused) {
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
  }, [inputFocused])

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
  const tabBarRef = useRef(null)
  const indicatorRef = useRef(null)
  const toolbarIndicatorRef = useRef(null)
  const indicatorMounted = useRef(false)
  const toolbarIndicatorMounted = useRef(false)
  const pendingAnimRef = useRef(null)
  const pendingProjectAnimRef = useRef(null)

  // Tab transition state
  const TRANSITION_MS = 260
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

  // Refs for swipe-to-change-tab gesture (avoids re-registering listeners on every state change)
  const activeTabRef = useRef(activeTab)
  const tabOrderRef = useRef(['star', ...categoryIds, 'menu'])
  const handleTabChangeRef = useRef(handleTabChange)
  const dragRef = useRef(null)        // live gesture state (shared with the layout effect)
  const dragFrameRef = useRef(null)   // applies a drag frame; set inside the gesture effect
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  useEffect(() => { tabOrderRef.current = ['star', ...categoryIds, 'menu'] }, [categoryIds])
  useEffect(() => { handleTabChangeRef.current = handleTabChange }, [handleTabChange])

  // Drag/swipe between tabs — a finger-tracked carousel. The current page's
  // content follows the finger and fades out while the adjacent page's content
  // slides in and fades in (headers cross-fade in place). Release past half the
  // screen width — or a fast flick — commits to the new page; otherwise it snaps
  // back. Only the cards travel; per-frame updates are written as CSS custom
  // properties straight onto the page elements (no React re-render per frame).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1000) return  // gesture is for the mobile layout
    const app = document.getElementById('app')
    if (!app) return

    const ANIM_MS = 280
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
      if (animating || dragRef.current) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const t = e.target
      // Rows used to own the horizontal gesture (swipe-to-reveal), so they were
      // excluded here. That's gone — a horizontal drag on a row now switches tabs.
      if (t.closest('.note-detail-page')) return
      // Allow drags that start anywhere on a page (incl. project-card text boxes)
      // or on the footer's text-box row (the add-row), but not the tab bar.
      if (!t.closest('.page') && !t.closest('.add-row')) return
      dragRef.current = { startX: e.clientX, startY: e.clientY, id: e.pointerId, engaged: false, edge: false, dir: null, toTab: null, dx: 0, W: window.innerWidth, step: window.innerWidth + GUTTER, lastX: e.clientX, lastT: performance.now(), v: 0 }
    }

    const onMove = (e) => {
      const s = dragRef.current
      if (!s || e.pointerId !== s.id) return
      const dx = e.clientX - s.startX
      const dy = e.clientY - s.startY
      if (!s.engaged) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { dragRef.current = null; return }  // vertical scroll wins
        if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return
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
      const passedHalf = Math.abs(s.dx) > s.W / 2
      const flick = Math.abs(s.v) > 0.3 && Math.abs(s.dx) > 8 &&
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
      const passedHalf = Math.abs(s.dx) > s.W / 2
      const flick = Math.abs(s.v) > 0.3 && Math.abs(s.dx) > 8 &&
        ((s.dir === 'next' && s.v < 0) || (s.dir === 'prev' && s.v > 0))
      finalize(passedHalf || flick)
    }
    const onWheel = (e) => {
      if (animating) return
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return   // vertical scroll — leave it
      if (dragRef.current && !dragRef.current.wheel) return   // a finger drag owns the gesture
      const t = e.target
      if (t.closest('.swipe-row')) return                     // row swipe handler owns this
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
      const scroller = bar.querySelector('.tab-scroll')
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
      if (!indicatorMounted.current) {
        // Snap on first render, then enable animation
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
    // Re-snap on resize (crossing the desktop breakpoint flips the slide axis)
    const onResize = () => { indicatorMounted.current = false; requestAnimationFrame(updateIndicator) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [activeTab])

  // Desktop nav edges: fade an edge only when there's content beyond it
  useEffect(() => {
    const scroller = document.querySelector('.tab-scroll')
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
    setInputValue('')
    setToolbarType('list')
    inputRef.current?.blur()
  }, [inputValue, linkUrlValue, activeTab, footerInputMode, toolbarType, saveToProject, addAsActiveFlag, addProjectTodo, addProjectNote, addProjectLink, addActiveTodo, addActiveNote, setOpenDetail, setAutoEditNoteId])

  // Keep the footer "focused" while focus moves between the title and URL fields
  const handleAddInputBlur = useCallback(() => {
    requestAnimationFrame(() => {
      const ae = document.activeElement
      if (ae && addRowRef.current && addRowRef.current.contains(ae)) return
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

  const footerAccent = useMemo(() => {
    if (activeTab === 'star' && saveToProject) {
      const catIdx = categories.findIndex(c => c.id === saveToProject.categoryId)
      if (catIdx !== -1) return getCategoryAccent(catIdx)
    }
    return activeAccent
  }, [activeTab, saveToProject, categories, activeAccent])

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
        className={`phone${inputFocused && footerInputMode ? ' save-panel-open' : ''}`}
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
                <button className="save-to-cancel" onMouseDown={e => { e.preventDefault(); inputRef.current?.blur() }}>Cancel</button>
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
                {(() => {
                  const cat = categories.find(c => c.id === saveToTab)
                  const projs = (cat?.projects || []).filter(p => !p.archived)
                  if (projs.length === 0) return <p className="save-to-empty">No projects yet</p>
                  return projs.map((proj, i) => (
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
                  ))
                })()}
              </div>
              <CardTabs
                categories={categories}
                selected={saveToTab}
                onSelect={(catId) => {
                  setSaveToTab(catId)
                  const cat = categories.find(c => c.id === catId)
                  const proj = cat?.projects.find(p => !p.archived)
                  setSaveToProject(proj ? { categoryId: catId, projectId: proj.id } : null)
                }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className={`footer${footerInputMode ? '' : ' category-mode'}${inputFocused ? ' keyboard-open' : ''}${pageScrollable ? ' has-scroll' : ''}`}
          style={{
            '--accent-base': footerAccent.base,
            '--accent-dark': footerAccent.dark,
            '--accent-light': footerAccent.light,
            '--accent-base-rgb': footerAccent.baseRgb,
          }}
        >

          <div className="add-row" ref={addRowRef}>
            <div className="link-input-stack">
              <input
                ref={inputRef}
                className={`add-input${inputFocused && toolbarType !== 'link' ? ' focused' : ''}`}
                placeholder={toolbarType === 'link' && inputFocused ? 'Title your link' : 'Scribble something down...'}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
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
          </div>

          <div className="tab-area">
            {/* Input toolbar */}
            <div className={`input-toolbar${inputFocused ? ' visible' : ''}${toolbarFadedIn ? ' faded-in' : ''}`}>
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

            <TabBar activeTab={activeTab} onSelectTab={handleTabChange} inputFocused={inputFocused} onTabsScroll={handleTabsScroll} />
          </div>


        </div>

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
