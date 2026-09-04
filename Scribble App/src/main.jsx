import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/layout.css'
import './styles/cards.css'
// Mirrors the desktop hover styles onto .is-pressed for touch — must come last
// so it can override the hover rules it was generated from.
import './styles/touch-press.css'
import { installPressState } from './pressState.js'

installPressState()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
