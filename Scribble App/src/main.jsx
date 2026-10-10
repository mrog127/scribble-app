import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/layout.css'
import './styles/cards.css'
// Mirrors the desktop hover styles onto .is-pressed for touch — must come last
// so it can override the hover rules it was generated from.
import './styles/touch-press.css'
import { installPressState } from './pressState.js'
import { installOutbox, inFlight } from './outbox.js'
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
  // A newer build is out: switch to it. Two ways to find out —
  //  1. The page opened from the offline cache and the service worker then
  //     fetched a different page (it posts 'app-updated').
  //  2. The app has simply been left open (a dock app can run for days without
  //     ever reloading), so it checks the live page itself whenever it comes
  //     back to the front, and every 15 minutes.
  // It reloads straight away if it has only just opened, otherwise at a quiet
  // moment — while the window is in the background, or the moment it's
  // switched away from — never mid-typing or with a save still in flight.
  const loadedAt = Date.now()
  let updatePending = false
  const typing = () => {
    const a = document.activeElement
    return !!(a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName)))
  }
  const quiet = () => !typing() && inFlight() === 0
  const reloadIfQuiet = () => { if (updatePending && quiet()) location.reload() }
  const markUpdated = () => {
    if (updatePending) return
    updatePending = true
    if ((Date.now() - loadedAt < 10000 || document.visibilityState === 'hidden') && quiet()) location.reload()
  }
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'app-updated') markUpdated()
  })

  // The build's entry script is content-hashed, so a different name on the
  // live page means a new deploy
  const currentEntry = () => {
    const s = document.querySelector('script[type="module"][src*="/assets/"]')
    return s ? new URL(s.src, location.href).pathname : null
  }
  let lastCheck = 0
  const checkForUpdate = async () => {
    if (updatePending || !navigator.onLine) return
    if (Date.now() - lastCheck < 60000) return
    lastCheck = Date.now()
    const mine = currentEntry()
    if (!mine) return   // dev server: nothing to compare
    try {
      const res = await fetch('/index.html?v=' + Date.now(), { cache: 'no-store' })
      if (!res.ok) return
      const html = await res.text()
      const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/) || html.match(/<script[^>]+src="([^"]*\/assets\/[^"]+\.js)"/)
      if (m && new URL(m[1], location.href).pathname !== mine) markUpdated()
    } catch { /* offline or blocked: try again later */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') reloadIfQuiet()
    else checkForUpdate()
  })
  window.addEventListener('focus', checkForUpdate)
  window.addEventListener('blur', reloadIfQuiet)
  setInterval(checkForUpdate, 15 * 60 * 1000)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
