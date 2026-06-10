import { useAppContext } from '../context/AppContext.jsx'

export default function TabBar({ activeTab, onSelectTab, inputFocused, onTabsScroll }) {
  const { categories } = useAppContext()

  return (
    <div className={`tab-bar${inputFocused ? ' hidden' : ''}${activeTab === 'star' ? ' star-active' : ''}`}>
      <div className="tab-indicator" id="tabIndicator"></div>

      <button
        className={`icon-tab${activeTab === 'star' ? ' selected' : ''}`}
        onClick={() => onSelectTab('star')}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <polygon
            points="10,2 12.5,7.5 18.5,8 14,12.5 15.5,18.5 10,15.5 4.5,18.5 6,12.5 1.5,8 7.5,7.5"
            strokeWidth="1"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <div className="tabs-scroll" onScroll={onTabsScroll}>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`text-tab${activeTab === cat.id ? ' selected' : ''}`}
            onClick={() => onSelectTab(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <button
        className={`icon-tab${activeTab === 'menu' ? ' selected' : ''}`}
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
