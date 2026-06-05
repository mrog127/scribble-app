export default function TabBar({ activeTab, onSelectTab, inputFocused, onTabsScroll }) {
  return (
    <div className={`tab-bar${inputFocused ? ' hidden' : ''}`}>
      <div className="tab-indicator" id="tabIndicator"></div>

      <button
        className={`icon-tab${activeTab === 'star' ? ' selected' : ''}`}
        onClick={() => onSelectTab('star')}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <polygon
            points="10,2 12.5,7.5 18.5,8 14,12.5 15.5,18.5 10,15.5 4.5,18.5 6,12.5 1.5,8 7.5,7.5"
            stroke={activeTab === 'star' ? '#3F5999' : '#242424'}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </button>

      <div className="tabs-scroll" onScroll={onTabsScroll}>
        {['personal','family','projects','trips','finances'].map(tab => (
          <button
            key={tab}
            className={`text-tab${activeTab === tab ? ' selected' : ''}`}
            onClick={() => onSelectTab(tab)}
            style={{ textTransform: 'capitalize' }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
