import { useState } from 'react'
import { supabase } from '../supabaseClient'

// Sign in / sign up. Its looks live in layout.css under .auth-* — the original
// cream design by default, with Dark Dots and Light Dots versions keyed off
// <html data-theme>, which is set before this first renders (themes.js).
export default function AuthScreen() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage('Check your email to confirm your account.')
    }

    setLoading(false)
  }

  return (
    <div className="app-wrap">
      <div className="phone auth-screen" id="app">
        <div className="auth-body">
          <p className="auth-title">Easels</p>
          <p className="auth-subtitle">
            {mode === 'signin' ? 'Sign in to your account' : 'Create an account'}
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <input
              className="add-input auth-input"
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input
              className="add-input auth-input"
              type="password"
              placeholder="Password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />

            {error && <p className="auth-note auth-error">{error}</p>}
            {message && <p className="auth-note auth-message">{message}</p>}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <button
            type="button"
            className="auth-switch"
            onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null); setMessage(null) }}
          >
            {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
