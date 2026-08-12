import { useRef } from 'react'
import { useAppContext } from '../context/AppContext.jsx'
import { ACCENT_COLORS, getCategoryAccent } from '../theme.js'

export default function TabBar({ activeTab, onSelectTab, inputFocused, onTabsScroll, pulse = '', pulseVars }) {
  const { categories } = useAppContext()
  const tabsScrollRef = useRef(null)

  return (
    <div className={`tab-bar${inputFocused ? ' hidden' : ''}${activeTab === 'star' ? ' star-active' : ''}${activeTab === 'menu' ? ' menu-active' : ''}`}>
      {/* Home + categories live in one scrollable, bottom-anchored container */}
      <div className="tab-scroll">
        <button
          className={`icon-tab tab-home${activeTab === 'star' ? ' selected' : ''}${pulse ? ` pulse-active pulse-${pulse}` : ''}`}
          style={{ '--tab-light': ACCENT_COLORS[0].light, ...(pulseVars || {}) }}
          onClick={() => {
            // Always send the category list back to the top, whatever was selected
            tabsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
            onSelectTab('star')
          }}
        >
          {/* Own layer for the orbiting inner glow: the button element itself is
              already driving the pulse sequence animation, and `animation` is a
              single property. */}
          <span className="tab-glow" aria-hidden="true" />
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <polyline className="museum" points="3,6.8 10,2.6 17,6.8" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            <line className="museum" x1="5" y1="7.6" x2="5" y2="14" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            <line className="museum" x1="8.33" y1="7.6" x2="8.33" y2="14" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            <line className="museum" x1="11.67" y1="7.6" x2="11.67" y2="14" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            <line className="museum" x1="15" y1="7.6" x2="15" y2="14" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            <line className="museum" x1="3.5" y1="14" x2="16.5" y2="14" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            <line className="museum" x1="3" y1="17" x2="17" y2="17" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          </svg>
        </button>

        <div className="tabs-scroll" onScroll={onTabsScroll} ref={tabsScrollRef}>
          {/* One easel, carried by the sliding indicator so it travels with the
              box instead of cross-fading per tab. Colours come from the page
              accent vars, so they change exactly when the box does. */}
          <div className="tab-indicator" id="tabIndicator">
            <svg className="tab-indicator-easel" width="18" height="18" viewBox="0 0 20 20" fill="none">
              <defs>
                <linearGradient id="tab-indicator-easel-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--accent-base)" />
                  <stop offset="100%" stopColor="var(--accent-light)" />
                </linearGradient>
              </defs>
              <rect x="3.5" y="2.5" width="13" height="9.5" fill="url(#tab-indicator-easel-grad)" fillOpacity="0.5" stroke="var(--accent-dark)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              <line x1="10" y1="12" x2="10" y2="17.5" stroke="var(--accent-dark)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              <line x1="6" y1="12" x2="3.5" y2="17.5" stroke="var(--accent-dark)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              <line x1="14" y1="12" x2="16.5" y2="17.5" stroke="var(--accent-dark)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            </svg>
          </div>
          {categories.map((cat, idx) => {
            const acc = getCategoryAccent(idx)
            return (
              <button
                key={cat.id}
                className={`text-tab${activeTab === cat.id ? ' selected' : ''}`}
                style={{ '--tab-light': acc.light }}
                onClick={() => onSelectTab(cat.id)}
              >
                <span className="tab-label">{cat.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      <button
        className={`icon-tab tab-pages${activeTab === 'menu' ? ' selected' : ''}`}
        style={{ '--tab-light': ACCENT_COLORS[0].light }}
        onClick={() => {
          tabsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
          onSelectTab('menu')
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3.2" style={{ stroke: '#242424' }} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <path
            d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.6 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
            style={{ stroke: '#242424' }} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
          />
        </svg>
      </button>
    </div>
  )
}
