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

installPressState()
// Replay any writes that were made while offline
installOutbox()

// The app shell is cached by a service worker, so it opens (and starts) with no
// network. Registration is deliberately after load — it must never delay paint.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* http, or blocked */ })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
