import { useState, useEffect, useRef, useCallback } from 'react'
import ActivePage from './components/ActivePage.jsx'
import CategoryPage from './components/CategoryPage.jsx'
import TabBar from './components/TabBar.jsx'
import { AppProvider, useAppContext } from './context/AppContext.jsx'

let nextId = 5
let nextNoteId = 4

function AppInner() {
  const { categories, addProjectTodo, addProjectNote, addProjectLink } = useAppContext()
  const categoryIds = categories.map(c => c.id)
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
  const [saveToProject, setSaveToProject] = useState(null)   // { categoryId, projectId }
  const [addAsActiveFlag, setAddAsActiveFlag] = useState(true)

  // Auto-select first available project for "Save to..." panel
  useEffect(() => {
    // Validate current selection
    if (saveToProject) {
      const cat = categories.find(c => c.id === saveToProject.categoryId)
      const proj = cat?.projects.find(p => p.id === saveToProject.projectId)
      if (proj) return // still valid
    }
    const firstCat = categories.find(c => c.projects.length > 0)
    if (firstCat) setSaveToProject({ categoryId: firstCat.id, projectId: firstCat.projects[0].id })
    else setSaveToProject(null)
  }, [categories]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const pendingProjectAnimRef = useRef(null)

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
    const text = inputValue.trim()
    if (!text) return

    // Active page: route into the selected project
    if (activeTab === 'star' && saveToProject) {
      const { categoryId, projectId } = saveToProject

      if (addAsActiveFlag && (toolbarType === 'list' || toolbarType === 'note')) {
        // Capture input position BEFORE blur for the fly animation
        const inputEl = inputRef.current
        const addRowEl = inputEl?.parentElement
        const appEl = document.getElementById('app')
        const inputRect = inputEl?.getBoundingClientRect()
        const addRowRect = addRowEl?.getBoundingClientRect()
        const appRect = appEl?.getBoundingClientRect()
        const animRect = inputRect && addRowRect
          ? { left: addRowRect.left, top: inputRect.top, width: addRowRect.width, height: inputRect.height }
          : inputRect

        const newId = toolbarType === 'list'
          ? addProjectTodo(categoryId, projectId, text, true)
          : addProjectNote(categoryId, projectId, text, true)

        if (animRect && appRect && newId != null) {
          pendingProjectAnimRef.current = { id: newId, type: toolbarType, text, inputRect: animRect, appRect }
        }
      } else {
        // Inactive or link: add without animation
        if (toolbarType === 'list') addProjectTodo(categoryId, projectId, text, addAsActiveFlag)
        else if (toolbarType === 'note') addProjectNote(categoryId, projectId, text, addAsActiveFlag)
        else if (toolbarType === 'link') addProjectLink(categoryId, projectId, text, addAsActiveFlag)
      }

      setInputValue('')
      inputRef.current?.blur()
      return
    }

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
      const newId = nextId++
      setTodos(prev => [...prev, { id: newId, text, checked: false, source: 'Active' }])
      if (animRect && appRect) pendingAnimRef.current = { id: newId, type: 'list', text, inputRect: animRect, appRect }
    } else if (toolbarType === 'note') {
      const newId = nextNoteId++
      setNotes(prev => [...prev, { id: newId, text, source: 'Active', accent: false, editorHTML: null }])
      if (animRect && appRect) pendingAnimRef.current = { id: newId, type: 'note', text, inputRect: animRect, appRect }
    }
    setInputValue('')
    setToolbarType('list')
    inputRef.current?.blur()
  }, [inputValue, activeTab, toolbarType, saveToProject, addAsActiveFlag, addProjectTodo, addProjectNote, addProjectLink])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); addItem() }
  }, [addItem])

  const toggleTodo = useCallback((id) => {
    setTodos(prev => {
      const item = prev.find(t => t.id === id)
      if (!item) return prev
      const toggled = { ...item, checked: !item.checked }
      const rest = prev.filter(t => t.id !== id)
      const unchecked = rest.filter(t => !t.checked)
      const checked = rest.filter(t => t.checked)
      // Checking → top of checked section; Unchecking → bottom of unchecked section
      return [...unchecked, toggled, ...checked]
    })
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
      <div className={`phone${inputFocused && activeTab === 'star' ? ' save-panel-open' : ''}`} id="app">


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

        {activeTab !== 'star' && categoryIds.includes(activeTab) && (
          <CategoryPage
            categoryId={activeTab}
            onScroll={handleScroll}
            headerOpacity={headerOpacity}
            headerTranslate={headerTranslate}
          />
        )}

        {activeTab !== 'star' && !categoryIds.includes(activeTab) && (
          <div className="page active" id={`page-${activeTab}`}>
            <div className="page-header">
              <p className="active-title" style={{ textTransform: 'capitalize' }}>{activeTab}</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className={`footer${activeTab !== 'star' ? ' category-mode' : ''}`}>

          {/* Save to… floating panel — Active page only */}
          {activeTab === 'star' && (
            <div className={`save-to-panel${inputFocused ? ' visible' : ''}`}>
              <div className="save-to-card">
                <p className="save-to-title">Save to...</p>
                {categories.every(c => c.projects.length === 0) && (
                  <p className="save-to-empty">No projects yet</p>
                )}
                {categories.filter(c => c.projects.length > 0).map(cat => (
                  <div key={cat.id}>
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
                ))}
              </div>
            </div>
          )}

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
                <button
                  className={`toolbar-source-btn${addAsActiveFlag ? '' : ' inactive'}`}
                  onMouseDown={e => { e.preventDefault(); setAddAsActiveFlag(v => !v) }}
                >
                  <svg width="16" height="16" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1L7.27 4.27L10.85 4.63L8.3 6.9L9.09 10.4L6 8.5L2.91 10.4L3.7 6.9L1.15 4.63L4.73 4.27L6 1Z" fill={addAsActiveFlag ? 'rgba(105,147,254,0.3)' : 'none'} stroke={addAsActiveFlag ? '#3F5999' : '#959493'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
                  </svg>
                  <span className={`toolbar-source-label${addAsActiveFlag ? '' : ' inactive'}`}>Active</span>
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

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  )
}
