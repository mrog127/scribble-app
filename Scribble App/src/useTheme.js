import { useSyncExternalStore } from 'react'
import { getTheme, subscribeTheme } from './themes.js'

// Re-renders the component when the theme changes. Only for layout that
// differs between themes — anything purely visual belongs in CSS.
export function useTheme() {
  return useSyncExternalStore(subscribeTheme, getTheme, () => getTheme())
}
