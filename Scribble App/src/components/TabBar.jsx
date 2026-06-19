import { useAppContext } from '../context/AppContext.jsx'
import { ACCENT_COLORS, getCategoryAccent } from '../theme.js'

export default function TabBar({ activeTab, onSelectTab, inputFocused, onTabsScroll }) {
  const { categories } = useAppContext()

  return (
    <div className={`tab-bar${inputFocused ? ' hidden' : ''}${activeTab === 'star' ? ' star-active' : ''}`}>
      {/* Home + categories live in one scrollable, bottom-anchored container */}
      <div className="tab-scroll">
        <div className="tab-indicator" id="tabIndicator"></div>

        <button
          className={`icon-tab tab-home${activeTab === 'star' ? ' selected' : ''}`}
          style={{ '--tab-light': ACCENT_COLORS[0].light }}
          onClick={() => onSelectTab('star')}
        >
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

        <div className="tabs-scroll" onScroll={onTabsScroll}>
          {categories.map((cat, idx) => (
            <button
              key={cat.id}
              className={`text-tab${activeTab === cat.id ? ' selected' : ''}`}
              style={{ '--tab-light': getCategoryAccent(idx).light }}
              onClick={() => onSelectTab(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <button
        className={`icon-tab tab-pages${activeTab === 'menu' ? ' selected' : ''}`}
        style={{ '--tab-light': ACCENT_COLORS[0].light }}
        onClick={() => onSelectTab('menu')}
      >
        <div className="hamburger-icon">
          <div className="mline-el"></div>
          <div className="mline-el"></div>
          <div className="mline-el"></div>
        </div>
      </button>
    </div>
  )
}
