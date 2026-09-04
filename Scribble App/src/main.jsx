import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/layout.css'
import './styles/cards.css'
// Mirrors the desktop hover styles onto :active for touch — must come last so
// it can override the hover rules it was generated from.
import './styles/touch-press.css'

// iOS only applies :active to non-interactive elements when the document has a
// touch handler, so give the body an empty one.
document.body.setAttribute('ontouchstart', '')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
