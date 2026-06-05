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
  const [inputValue, setInputValue] = useState('')
  const [hideCompleted, setHideCompleted] = useState(false)
  const [headerOpacity, setHeaderOpacity] = useState(1)
  const [headerTranslate, setHeaderTranslate] = useState(0)

  const inputRef = useRef(null)
  const tabBarRef = useRef(null)
  const indicatorRef = useRef(null)
  const toolbarIndicatorRef = useRef(null)

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
      indicator.style.transition = 'none'
      indicator.style.left = (tR.left - bR.left) + 'px'
      indicator.style.width = selected.offsetWidth + 'px'
      requestAnimationFrame(() => { indicator.style.transition = '' })
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
        ind.style.transition = 'none'
        ind.style.left = (btnRect.left - rightRect.left) + 'px'
        requestAnimationFrame(() => { ind.style.transition = '' })
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

  const addItem = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    const currentTab = activeTab
    const sourceIndex = TABS.indexOf(currentTab) - 1
    const source = sourceIndex >= 0 && sourceIndex < ADD_SOURCES.length
      ? ADD_SOURCES[sourceIndex]
      : 'Active'

    if (toolbarType === 'list') {
      setTodos(prev => [...prev, { id: nextId++, text, checked: false, source }])
    } else if (toolbarType === 'note') {
      setNotes(prev => [...prev, { id: nextNoteId++, text, source, accent: false, editorHTML: null }])
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

        {/* Decoration SVG */}
        <svg className="decoration" style={{ opacity: headerOpacity }} width="232" height="173" viewBox="0 0 232 173" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M81.5927 45.3708C81.4055 45.8299 82.404 47.9204 83.424 49.9373C85.1558 50.6521 86.5938 52.8344 88.4935 54.3317C89.8229 55.3871 91.2534 56.4362 92.7188 57.4413C97.2805 60.5903 101.688 63.299 104.785 64.873C106.776 65.8805 107.437 66.1146 108.144 66.3636C108.494 66.4788 108.819 66.5702 109.336 66.6732C109.905 66.7909 110.426 66.841 112.647 67.1995C112.476 67.1671 112.308 67.1428 112.153 67.1261C111.277 67.0377 110.988 67.1974 111.307 67.1306C111.611 67.0772 112.403 66.8245 113.348 66.3957C113.29 66.5719 115.03 65.405 116.345 64.1396C116.374 64.4104 116.298 64.7828 116.293 65.081C117.792 63.5471 119.59 61.5419 121.346 59.4724C121.782 58.9586 122.349 58.6107 122.641 58.2492C124.808 55.5676 126.466 53.0278 128.801 50.2449C129.11 49.876 129.43 49.5037 129.763 49.1259C131.903 47.282 132.039 48.1239 134.836 44.598C134.18 44.882 133.498 45.1926 132.854 45.4591C134.72 43.2614 136.817 41.221 138.617 39.0209C139.641 37.769 140.353 36.4809 140.944 35.731C145.944 29.4037 149.185 26.2482 153.92 22.5065C154.431 21.7781 154.99 21.0153 155.57 20.258C156.932 18.6363 158.534 17.1095 160.282 15.7914C164.062 13.6608 168.163 12.5333 171.82 12.1315C169.681 12.172 167.368 12.436 165.022 13.0281C169.735 11.0784 172.512 11.1376 176.193 10.9191C178.693 10.8475 179.264 10.586 181.823 10.7311C183.458 10.84 185.024 11.0201 186.389 11.1956C194.152 12.4847 197.408 15.6999 200.289 17.9511C203.071 20.3491 205.131 22.6204 207.021 24.8082C206.797 25.0411 206.555 25.2574 206.316 25.4748C208.216 27.3658 209.95 29.2284 211.622 31.0928C213.667 34.4048 215.323 36.1992 216.084 40.7169C217.626 42.6894 219.042 42.5116 221.75 46.7676C223.073 48.7996 223.533 48.5667 225.552 51.6336C226.199 52.6185 227.071 53.9669 228.036 55.4862C230.469 59.2187 233.092 64.6817 234.113 68.3382C235.84 74.3381 235.643 77.9432 235.969 82.1734C236.348 92.2805 234.41 99.2511 229.74 106.641C228.63 108.58 224.133 113.15 222.731 114.039C221.636 116.395 216.009 120.78 213.858 122.6C211.718 124.484 214.192 123.333 211.301 125.591C208.189 127.089 207.308 127.934 204.478 129.876C204.007 130.206 203.574 130.54 203.485 130.599C199.845 135.025 195.969 138.256 193.677 138.915C192.51 139.519 191.02 140.289 188.72 141.17C184.166 143.468 180.054 143.904 176.239 144.08C166.408 144.772 157.907 143.751 149.02 140.74C144.425 139.347 140.318 136.058 138.178 133.364C131.986 126.799 130.91 121.413 130.682 117.371C130.497 112.937 131.078 109.654 131.488 106.858C134.633 93.1041 140.907 89.8879 144.871 85.3897C149.655 80.8876 152.664 78.4598 156.188 75.0422C159.875 73.1389 162.417 72.2255 164.445 71.8339C168.88 68.6367 170.356 69.0477 173.322 68.4911C176.751 67.9318 175.413 67.6101 179.553 67.2791C181.24 67.1208 188.154 67.1277 191.793 67.27C198.357 67.4691 205.407 67.8676 213.061 68.8787C219.438 69.6375 226.745 72.1872 226.57 73.484C225.233 73.5491 226.508 74.2835 228.76 75.8508C228.8 76.2522 219.525 73.8768 219.361 74.8516C213.738 73.0018 207.585 73.2359 214.528 74.5694C217.072 74.9652 227.239 76.4062 229.474 77.0989C231.297 77.1845 231.137 76.7134 230.752 76.144C228.311 74.0341 230.145 73.9902 231.51 74.3872C234.189 75.1882 240.994 77.6676 242.366 78.2677C244.743 79.2978 244.761 79.6097 246.12 80.292C248.591 81.5333 248.962 81.2544 251.538 82.498C254.491 83.9244 257.489 85.8617 260.969 87.2815C256.947 89.8482 263.15 88.5052 267.253 89.8482C270.667 92.1033 272.126 92.6933 274.818 93.7625C276.965 95.1392 279.312 97.1056 279.546 97.5715C278.658 97.6003 272.578 94.3829 271.58 95.8753C270.756 96.2669 271.298 96.8589 272.36 97.4628C278.865 98.7889 280.325 97.9613 280.101 97.1134C280.344 96.5608 280.292 96.4612 280.455 96.2267C279.303 95.9854 277.699 95.9618 276.507 96.2307C275.319 96.4856 274.224 97.0074 273.923 97.2065C274.335 97.6732 274.623 97.7633 274.176 97.3004C275.047 95.5955 275.651 93.4968 277.026 89.3445C277.787 85.1405 277.364 84.3032 277.706 78.3572C277.831 76.3574 278.464 69.3576 278.633 64.1811C278.568 63.7 278.269 63.6804 277.979 62.7633C277.319 60.5822 275.101 56.276 276.332 56.3973C274.986 55.2711 273.861 55.3565 271.412 50.8243C265.055 44.2668 258.752 38.629 255.506 35.8197C253.976 34.7302 252.657 34.7309 251.802 34.2591C249.492 32.9055 248.396 32.1128 248.674 32.0568C252.123 31.8267 253.351 31.2206 256.096 30.3047C256.776 29.4355 256.618 29.8299 256.027 29.5745C255.874 31.3263 255.503 33.3156 254.891 38.1519C254.567 40.9658 254.746 44.8282 254.059 48.4554C254.126 49.8549 254.497 46.0742 252.911 45.3317C251.492 43.7326 251.349 43.6412 253.264 44.6108C255.804 45.6352 263.595 47.4965 263.583 48.1375C266.684 47.2287 269.45 48.0503 272.082 48.5258C278.455 49.3942 281.389 49.4514 287.131 50.3341C288.493 49.6346 289.562 48.653 289.422 48.1947C292.018 46.9612 294.116 44.7409 299.39 38.013C303.385 36.0663 307.169 30.6624 313.141 26.4609C316.405 24.7273 321.022 23.8117 325.343 24.7814C329.876 26.3768 333.523 28.5442 335.99 30.7539C340.182 35.304 342.09 38.4436 344.201 43.5077C347.861 54.3301 347.795 55.8627 347.991 57.438C348.801 66.906 349.253 66.4219 349.008 72.6515C345.77 85.7151 343.636 89.8424 340.411 99.1328C335.779 105.395 332.444 110.303 327.348 115.9C323.392 119.772 322.828 120.349 322.312 120.955C322.884 120.011 322.915 120.195 322.145 122.281C323.009 120.734 322.801 119.709 319.613 116.784C321.859 117.295 330.784 117.295 333.535 116.245C337.043 117.295 338.427 116.336 341.245 115.014C342.286 114.632 344.946 113.62 349.903 111.371C353.338 108.673 358.403 104.652 362.163 101.756C366.447 98.7472 368.287 96.2903 371.956 92.8926C374.263 91.5793 376.001 89.8813 377.708 88.1518C382.546 82.737 384.256 80.4776 385.225 78.8003C386.317 78.945 383.949 81.2406 382.348 83.7499C383.316 84.1657 385.418 81.7979 386.799 79.9304C385.864 78.4628 379.324 77.9878 374.892 75.9706C370.298 73.8209 365.454 71.76 360.252 69.4674C355.425 67.1251 354.621 66.6627 352.533 65.3019C349.065 62.6408 347.652 58.685C346.197 54.066 347.568 50.846 348.18 49.3971C349.525 47.028 351.126 45.0057 352.723 43.6068C357.331 39.8643 362.964 37.443 366.396 35.8852C369.668 33.5746 373.892 31.3864 379.007 29.3755C382.316 27.5813 388.925 23.8683 400.174 18.8677C408.298 15.9186 415.874 14.7664 422.449 14.3536C428.773 12.3189 430.523 12.7687 435.522 12.6386C440.141 12.0335 444.43 12.6232 450.227 13.8065C454.757 14.7598 457.789 17.2532 459.541 19.3235C461.582 24.1268 461.838 25.4484 462.219 29.9519C461.878 34.2241 460.745 35.2372 460.045 36.6404C459.19 40.006 457.379 41.8664 452.956 46.0134C447.55 51.3071 446.054 53.1637 441.69 57.1487C436.854 62.7261 435.03 64.3501 432.562 66.8951C428.755 71.2914 426.726 75.0948 425.976 79.0629C425.429 74.228 423.499 72.3642 423.371 72.2931C423.977 72.533 425.42 72.8491 428.71 73.4458C436.303 73.5563 440.708 72.9306 446.159 72.6561C451.076 72.5349 456.06 72.2931 458.426 72.025C462.249 71.5324 468.692 71.8564 473.763 75.1426C477.082 77.1247 478.409 79.942 479.056 81.5175C481.377 88.8617 481.016 91.2072 481.674 96.0381C482.408 99.1422 482.621 106.044 482.972 108.583C483.317 114.034 483.037 116.078 483.157 121.757C483.708 131.76 483.755 132.257 483.752 132.314C484.271 135.86 488.203 142.233 492.398 146.165C497.057 149.325 500.185 151.555 502.772 152.502C505.352 153.431 507.293 153.645 510.061 156.185C511.467 157.446 513.198 161.058 513.252 162.598C513.031 163.421 514.966 163.731 516.908 164.034C518.707 165.73 517.183 166.178 516.843 166.498C517.609 167.362 516.574 167.784 516.166 168.301C514.194 168.499 511.571 168.204 509.546 167.692C507.668 167.162 506.452 166.548 506.307 166.06C501.319 164.707 495.135 162.785 492.342 161.111C486.549 159.533 483.704 157.341 482.731 156.567C480.347 153.952 480.521 153.636 477.164 150.138C471.528 138.187 472.661 143.704 472.169 143.643C476.409 150.087 478.936 152.785 479.459 158.253C481.853 159.551 484.467 160.787 487.445 161.13C489.543 161.815 491.08 163.567 491.494 145.442C492.424 146.113 494.07 147.252 497.057 149.325C504.668 153.431 507.512 170.811 511.119 163.124C513.031 163.421 516.158 165.285 518.707 165.73Z" fill="#6993FE" fillOpacity="0.1"/>
        </svg>

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
              className={`send-btn${inputValue.trim() ? ' visible' : ''}`}
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
            <div className={`input-toolbar${inputFocused ? ' visible' : ''}${inputFocused ? ' faded-in' : ''}`}>
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
