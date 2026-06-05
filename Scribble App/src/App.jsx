import { useState, useEffect, useRef, useCallback } from 'react'
import ActivePage from './components/ActivePage.jsx'
import TabBar from './components/TabBar.jsx'

const TABS = ['star', 'personal', 'family', 'projects', 'trips', 'finances', 'menu']
const ADD_SOURCES = ['Personal', 'Family', 'Projects', 'Trips', 'Finances']

let nextId = 5
let nextNoteId = 4

export default function App() {
  const [todos, setTodos] = useState([])
  const [notes, setNotes] = useState([])
  const [activeTab, setActiveTab] = useState('star')
  const [toolbarType, setToolbarType] = useState('list')
  const [inputFocused, setInputFocused] = useState(false)
  const [toolbarFadedIn, setToolbarFadedIn] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [hideCompleted, setHideCompleted] = useState(false)
  const [headerOpacity, setHeaderOpacity] = useState(1)
  const [headerTranslate, setHeaderTranslate] = useState(0)

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
  const tabBarRef = useRef(null)
  const indicatorRef = useRef(null)
  const toolbarIndicatorRef = useRef(null)
  const indicatorMounted = useRef(false)
  const toolbarIndicatorMounted = useRef(false)
  const pendingAnimRef = useRef(null)

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
      if (!indicatorMounted.current) {
        // Snap on first render, then enable animation
        indicator.style.transition = 'none'
        indicator.style.left = (tR.left - bR.left) + 'px'
        indicator.style.width = selected.offsetWidth + 'px'
        requestAnimationFrame(() => { indicator.style.transition = ''; indicatorMounted.current = true })
      } else {
        indicator.style.left = (tR.left - bR.left) + 'px'
        indicator.style.width = selected.offsetWidth + 'px'
      }
    }
    requestAnimationFrame(updateIndicator)
  }, [activeTab])

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
  }, [todos, notes])

  const addItem = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    const currentTab = activeTab
    const sourceIndex = TABS.indexOf(currentTab) - 1
    const source = sourceIndex >= 0 && sourceIndex < ADD_SOURCES.length
      ? ADD_SOURCES[sourceIndex]
      : 'Active'

    // Capture positions before state update
    const inputEl = inputRef.current
    const appEl = document.getElementById('app')
    const inputRect = inputEl?.getBoundingClientRect()
    const appRect = appEl?.getBoundingClientRect()

    if (toolbarType === 'list') {
      const newId = nextId++
      setTodos(prev => [...prev, { id: newId, text, checked: false, source }])
      if (inputRect && appRect) pendingAnimRef.current = { id: newId, type: 'list', text, inputRect, appRect }
    } else if (toolbarType === 'note') {
      const newId = nextNoteId++
      setNotes(prev => [...prev, { id: newId, text, source, accent: false, editorHTML: null }])
      if (inputRect && appRect) pendingAnimRef.current = { id: newId, type: 'note', text, inputRect, appRect }
    }
    setInputValue('')
    inputRef.current?.focus()
  }, [inputValue, activeTab, toolbarType])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); addItem() }
  }, [addItem])

  const toggleTodo = useCallback((id) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, checked: !t.checked } : t))
  }, [])

  const deleteTodo = useCallback((id) => {
    setTodos(prev => prev.filter(t => t.id !== id))
  }, [])

  const deleteNote = useCallback((id) => {
    setNotes(prev => prev.filter(n => n.id !== id))
  }, [])

  const updateNote = useCallback((id, editorHTML, text) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, editorHTML, text: text || n.text } : n))
  }, [])

  const reorderTodos = useCallback((newOrder) => {
    setTodos(newOrder)
  }, [])

  const reorderNotes = useCallback((newOrder) => {
    setNotes(newOrder)
  }, [])

  const hasContent = todos.length > 0 || notes.length > 0

  return (
    <div className="app-wrap">
      <div className="phone" id="app">


        {/* Active Page */}
        {activeTab === 'star' && (
          <ActivePage
            todos={todos}
            notes={notes}
            hideCompleted={hideCompleted}
            onToggleTodo={toggleTodo}
            onDeleteTodo={deleteTodo}
            onDeleteNote={deleteNote}
            onUpdateNote={updateNote}
            onReorderTodos={reorderTodos}
            onReorderNotes={reorderNotes}
            onToggleHideCompleted={() => setHideCompleted(h => !h)}
            onScroll={handleScroll}
            headerOpacity={headerOpacity}
            headerTranslate={headerTranslate}
          />
        )}

        {activeTab !== 'star' && (
          <div className="page active" id={`page-${activeTab}`}>
            <div className="page-header">
              <p className="active-title" style={{ textTransform: 'capitalize' }}>{activeTab}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="footer">
          <div className="add-row">
            <input
              ref={inputRef}
              className={`add-input${inputFocused ? ' focused' : ''}`}
              placeholder="Scribble something down..."
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={handleKeyDown}
            />
            <button
              className={`send-btn${inputFocused || inputValue.trim() ? ' visible' : ''}`}
              onMouseDown={e => { e.preventDefault(); addItem() }}
            >
              <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
                <path d="M10 16 L10 4" stroke="#3F5999" strokeWidth="2" strokeLinecap="round"/>
                <path d="M4 9 L10 3 L16 9" stroke="#3F5999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <div className="tab-area">
            {/* Input toolbar */}
            <div className={`input-toolbar${inputFocused ? ' visible' : ''}${toolbarFadedIn ? ' faded-in' : ''}`}>
              <div className="toolbar-left">
                <button className="toolbar-source-btn">
                  <svg width="16" height="16" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1L7.27 4.27L10.85 4.63L8.3 6.9L9.09 10.4L6 8.5L2.91 10.4L3.7 6.9L1.15 4.63L4.73 4.27L6 1Z" fill="rgba(105,147,254,0.2)" stroke="#3F5999" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
                  </svg>
                  <span className="toolbar-source-label">Active</span>
                </button>
              </div>
              <div className="toolbar-divider"></div>
              <div className="toolbar-right">
                <div className="toolbar-indicator" id="toolbarIndicator"></div>
                <button
                  className={`toolbar-icon-btn${toolbarType === 'list' ? ' selected' : ''}`}
                  onMouseDown={e => { e.preventDefault(); setToolbarType('list') }}
                >
                  <svg width="24" height="24" viewBox="0 0 22 22" fill="none">
                    <circle cx="5" cy="7" r="1.5" fill={toolbarType === 'list' ? '#3F5999' : '#3D3D3D'}/>
                    <line x1="9" y1="7" x2="19" y2="7" stroke={toolbarType === 'list' ? '#3F5999' : '#3D3D3D'} strokeWidth="2" strokeLinecap="round"/>
                    <circle cx="5" cy="12" r="1.5" fill={toolbarType === 'list' ? '#3F5999' : '#3D3D3D'}/>
                    <line x1="9" y1="12" x2="19" y2="12" stroke={toolbarType === 'list' ? '#3F5999' : '#3D3D3D'} strokeWidth="2" strokeLinecap="round"/>
                    <circle cx="5" cy="17" r="1.5" fill={toolbarType === 'list' ? '#3F5999' : '#3D3D3D'}/>
                    <line x1="9" y1="17" x2="14" y2="17" stroke={toolbarType === 'list' ? '#3F5999' : '#3D3D3D'} strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
                <button
                  className={`toolbar-icon-btn${toolbarType === 'note' ? ' selected' : ''}`}
                  onMouseDown={e => { e.preventDefault(); setToolbarType('note') }}
                >
                  <svg width="24" height="24" viewBox="0 0 20 22" fill="none">
                    <path d="M3 3h9l5 5v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" stroke={toolbarType === 'note' ? '#3F5999' : '#3D3D3D'} strokeWidth="2" strokeLinejoin="round" fill="none"/>
                    <path d="M12 3v5h5" stroke={toolbarType === 'note' ? '#3F5999' : '#3D3D3D'} strokeWidth="2" strokeLinejoin="round"/>
                    <line x1="5" y1="13" x2="15" y2="13" stroke={toolbarType === 'note' ? '#3F5999' : '#3D3D3D'} strokeWidth="2" strokeLinecap="round"/>
                    <line x1="5" y1="16.5" x2="12" y2="16.5" stroke={toolbarType === 'note' ? '#3F5999' : '#3D3D3D'} strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
                <button
                  className={`toolbar-icon-btn${toolbarType === 'link' ? ' selected' : ''}`}
                  onMouseDown={e => { e.preventDefault(); setToolbarType('link') }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke={toolbarType === 'link' ? '#3F5999' : '#3D3D3D'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke={toolbarType === 'link' ? '#3F5999' : '#3D3D3D'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>

            <TabBar activeTab={activeTab} onSelectTab={setActiveTab} inputFocused={inputFocused} onTabsScroll={handleTabsScroll} />
          </div>

          <div className="home-indicator"></div>
        </div>

        <div id="animation-portal"></div>
      </div>
    </div>
  )
}
