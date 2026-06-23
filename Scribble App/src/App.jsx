import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ACCENT_COLORS, getCategoryAccent } from './theme.js'
import ActivePage from './components/ActivePage.jsx'
import CategoryPage from './components/CategoryPage.jsx'
import TabBar from './components/TabBar.jsx'
import AuthScreen from './components/AuthScreen.jsx'
import MenuPage from './components/MenuPage.jsx'
import ArchiveAttachmentsModal from './components/ArchiveAttachmentsModal.jsx'
import { AppProvider, useAppContext } from './context/AppContext.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { useScrollable } from './useScrollable.js'
import GalleryDecoration from './assets/gallery-page-decoration.svg?react'

function AppInner() {
  const {
    categories, activeTodos, activeNotes,
    addActiveTodo, addActiveNote, toggleActiveTodo, deleteActiveTodo, deleteActiveNote, updateActiveNote, reorderActiveTodos, reorderActiveNotes,
    addProjectTodo, addProjectNote, addProjectLink,
    setOpenDetail, setAutoEditNoteId,
  } = useAppContext()
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
  // The footer shows its text box on the homescreen and on collapsed category pages.
  const footerInputMode = activeTab === 'star' || activeCategoryCollapsed

  // Reset to star tab if active category tab is deleted
  useEffect(() => {
    if (activeTab !== 'star' && activeTab !== 'menu' && !categories.some(c => c.id === activeTab)) {
      setActiveTab('star')
    }
  }, [categories]) // eslint-disable-line

  // Auto-select an available project for the "Save to..." panel.
  // On a collapsed category page the selection is constrained to that category.
  useEffect(() => {
    if (activeCategoryCollapsed) {
      const cat = categories.find(c => c.id === activeTab)
      if (!cat || cat.projects.length === 0) return
      const valid = saveToProject?.categoryId === activeTab && cat.projects.some(p => p.id === saveToProject.projectId)
      if (!valid) setSaveToProject({ categoryId: cat.id, projectId: cat.projects[0].id })
      return
    }
    // Validate current selection
    if (saveToProject) {
      const cat = categories.find(c => c.id === saveToProject.categoryId)
      const proj = cat?.projects.find(p => p.id === saveToProject.projectId)
      if (proj) return // still valid
    }
    const firstCat = categories.find(c => c.projects.length > 0)
    if (firstCat) setSaveToProject({ categoryId: firstCat.id, projectId: firstCat.projects[0].id })
    else setSaveToProject(null)
  }, [categories, activeTab, activeCategoryCollapsed]) // eslint-disable-line react-hooks/exhaustive-deps

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
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  useEffect(() => { tabOrderRef.current = ['star', ...categoryIds, 'menu'] }, [categoryIds])
  useEffect(() => { handleTabChangeRef.current = handleTabChange }, [handleTabChange])

  // Swipe left/right on non-row areas to navigate tabs
  useEffect(() => {
    const phone = document.getElementById('app')
    if (!phone) return
    let startX = 0, startY = 0, tracking = false

    const onPointerDown = (e) => {
      // Ignore swipes that start on a swipe row, input, or contenteditable
      if (e.target.closest('.swipe-row')) return
      if (e.target.closest('input, textarea, [contenteditable]')) return
      // Ignore swipes inside a full-screen detail page (note or list item)
      if (e.target.closest('.note-detail-page')) return
      startX = e.clientX
      startY = e.clientY
      tracking = true
    }

    const onPointerUp = (e) => {
      if (!tracking) return
      tracking = false
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      // Require 60px horizontal; only cancel if vertical clearly dominates
      if (Math.abs(dx) < 60) return
      if (Math.abs(dy) > Math.abs(dx) * 3) return

      const tabs = tabOrderRef.current
      const currentIdx = tabs.indexOf(activeTabRef.current)
      if (currentIdx === -1) return

      if (dx < 0 && currentIdx < tabs.length - 1) {
        handleTabChangeRef.current(tabs[currentIdx + 1])
      } else if (dx > 0 && currentIdx > 0) {
        handleTabChangeRef.current(tabs[currentIdx - 1])
      }
    }

    const onPointerCancel = () => { tracking = false }

    phone.addEventListener('pointerdown', onPointerDown)
    phone.addEventListener('pointerup', onPointerUp)
    phone.addEventListener('pointercancel', onPointerCancel)
    return () => {
      phone.removeEventListener('pointerdown', onPointerDown)
      phone.removeEventListener('pointerup', onPointerUp)
      phone.removeEventListener('pointercancel', onPointerCancel)
    }
  }, []) // eslint-disable-line

  // Close swipe rows when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.swipe-action-btn')) {
        document.querySelectorAll('.swipe-row.swiped-left, .swipe-row.swiped-right').forEach(r => {
          r.classList.remove('swiped-left', 'swiped-right')
          const content = r.querySelector('.swipe-content')
          if (content) { content.style.transition = ''; content.style.transform = '' }
        })
      }
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [])

  // Two-finger (trackpad) horizontal swipe over a row reveals the Active/Delete
  // buttons, mirroring the one-finger pointer swipe. Trackpad swipes arrive as
  // horizontal wheel events, so accumulate deltaX and snap when the gesture ends.
  useEffect(() => {
    const app = document.getElementById('app')
    if (!app) return
    let active = null
    let endTimer = null

    const closeRow = (r) => {
      r.classList.remove('swiped-left', 'swiped-right')
      const c = r.querySelector('.swipe-content')
      if (c) { c.style.transition = ''; c.style.transform = '' }
    }

    const finish = () => {
      if (!active) return
      const { row, content, offset } = active
      active = null
      content.style.transition = ''
      if (offset < -36 || offset > 36) {
        document.querySelectorAll('.swipe-row.swiped-left, .swipe-row.swiped-right').forEach(r => { if (r !== row) closeRow(r) })
        row.classList.add(offset < 0 ? 'swiped-left' : 'swiped-right')
        row.classList.remove(offset < 0 ? 'swiped-right' : 'swiped-left')
      } else {
        row.classList.remove('swiped-left', 'swiped-right')
      }
      content.style.transform = ''
    }

    const onWheel = (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return  // vertical scroll — ignore
      const row = e.target.closest('.swipe-row')
      if (!row) return
      const content = row.querySelector('.swipe-content')
      if (!content) return
      e.preventDefault()
      if (active && active.row !== row) finish()
      if (!active) {
        const base = row.classList.contains('swiped-left') ? -84 : row.classList.contains('swiped-right') ? 84 : 0
        active = { row, content, offset: base }
        content.style.transition = 'none'
      }
      active.offset = Math.max(-84, Math.min(84, active.offset - e.deltaX))
      content.style.transform = `translateX(${active.offset}px)`
      // Reveal the button live (its opacity is tied to the swiped class) so it
      // appears as you cross the threshold instead of waiting for the gesture —
      // and trackpad momentum — to fully settle.
      if (active.offset < -36) { row.classList.add('swiped-left'); row.classList.remove('swiped-right') }
      else if (active.offset > 36) { row.classList.add('swiped-right'); row.classList.remove('swiped-left') }
      else { row.classList.remove('swiped-left', 'swiped-right') }
      clearTimeout(endTimer)
      endTimer = setTimeout(finish, 120)
    }

    app.addEventListener('wheel', onWheel, { passive: false })
    return () => { app.removeEventListener('wheel', onWheel); clearTimeout(endTimer) }
  }, [])

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

        {/* Persistent date header — shown in the left sidebar on desktop only */}
        <div className="sidebar-date">
          <p className="active-today-label">Today is</p>
          <p className="active-day-name">{dayName},</p>
          <GalleryDecoration className="active-date-decoration" style={{ color: decorationColor }} />
          <p className="active-month-date">{monthDate}</p>
        </div>

        {/* Entering pages — normal flex flow */}
        {activeTab === 'star' && (
          <ActivePage
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
            pageAnimClass={isTransitioning ? `page-entering page-enter-from-${transitionDir === 'left' ? 'right' : 'left'}` : ''}
          />
        )}
        {activeTab !== 'star' && activeTab !== 'menu' && categoryIds.includes(activeTab) && (
          <CategoryPage
            categoryId={activeTab}
            collapsed={getCollapsed(activeTab)}
            onToggleCollapsed={() => toggleCollapsed(activeTab)}
            onScroll={handleScroll}
            headerOpacity={headerOpacity}
            headerTranslate={headerTranslate}
            pageAnimClass={isTransitioning ? `page-entering page-enter-from-${transitionDir === 'left' ? 'right' : 'left'}` : ''}
          />
        )}
        {activeTab === 'menu' && (
          <MenuPage
            onSelectTab={handleTabChange}
            pageAnimClass={isTransitioning ? `page-entering page-enter-from-${transitionDir === 'left' ? 'right' : 'left'}` : ''}
          />
        )}
        {activeTab !== 'star' && activeTab !== 'menu' && !categoryIds.includes(activeTab) && (
          <div className="page active" id={`page-${activeTab}`}>
            <div className="page-header">
              <p className="active-title" style={{ textTransform: 'capitalize' }}>{activeTab}</p>
            </div>
          </div>
        )}

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
              <div className="save-to-scroll">
                {(activeTab === 'star' ? categories : categories.filter(c => c.id === activeTab)).every(c => c.projects.length === 0) && (
                  <p className="save-to-empty">No projects yet</p>
                )}
                {(activeTab === 'star' ? categories : categories.filter(c => c.id === activeTab)).filter(c => c.projects.length > 0).map(cat => {
                  const catIdx = categories.findIndex(c2 => c2.id === cat.id)
                  const accent = getCategoryAccent(catIdx)
                  return (
                  <div key={cat.id} style={{ '--cb-base': accent.base, '--cb-dark': accent.dark, '--cb-light': accent.light, '--cb-base-rgb': accent.baseRgb }}>
                    <div className="save-to-category">{cat.name}</div>
                    {cat.projects.map((proj, i) => (
                      <div key={proj.id}>
                        {i > 0 && <div className="save-to-divider"/>}
                        <button
                          className={`save-to-option${saveToProject?.projectId === proj.id ? ' selected' : ''}`}
                          onMouseDown={e => { e.preventDefault(); setSaveToProject({ categoryId: cat.id, projectId: proj.id }) }}
                        >
                          <div className={`save-to-radio${saveToProject?.projectId === proj.id ? ' filled' : ''}`}/>
                          <span>{proj.name}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                  )
                })}
              </div>
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
                onFocus={() => setInputFocused(true)}
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
                  <svg width="16" height="16" viewBox="0 0 20 20" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" style={{ fill: addAsActiveFlag ? 'rgba(var(--accent-base-rgb),0.3)' : 'none', stroke: addAsActiveFlag ? 'var(--accent-dark)' : '#242424' }}>
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
