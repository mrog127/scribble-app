import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/layout.css'
import './styles/cards.css'
// Mirrors the desktop hover styles onto .is-pressed for touch — must come last
// so it can override the hover rules it was generated from.
import './styles/touch-press.css'
import { installPressState } from './pressState.js'
import { installOutbox } from './outbox.js'
import { installPushSync } from './push.js'
import { installTheme } from './themes.js'
import { installRowFlashPill } from './rowFlashPill.js'

// Paint in the saved theme before the first render
installTheme()
installPressState()
// Row flashes play on the hover pill in the Dots themes
installRowFlashPill()
// Replay any writes that were made while offline
installOutbox()
// Keep the morning summary's time zone in step with the phone's clock
installPushSync()

// The app shell is cached by a service worker, so it opens (and starts) with no
// network. Registration is deliberately after load — it must never delay paint.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* http, or blocked */ })
  })
  // The page opened from the offline cache and a newer version has since
  // arrived: switch to it — straight away if the app has only just opened and
  // nothing is being typed, otherwise the next time it comes back to the front.
  const loadedAt = Date.now()
  let updatePending = false
  const typing = () => {
    const a = document.activeElement
    return !!(a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName)))
  }
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'app-updated') return
    if (Date.now() - loadedAt < 10000 && !typing()) location.reload()
    else updatePending = true
  })
  document.addEventListener('visibilitychange', () => {
    if (updatePending && document.visibilityState === 'visible' && !typing()) location.reload()
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
