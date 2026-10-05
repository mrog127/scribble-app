import { useState, useLayoutEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { LIGHT_DOTS_COLORS } from '../theme.js'
import { applyTheme, getTheme } from '../themes.js'

// The seven easel colours the page cycles through
const RING = LIGHT_DOTS_COLORS.slice(1)
const hexRgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const toStop = (c) => ({ base: hexRgb(c.base), light: hexRgb(c.light), rgb: c.baseRgb.split(',').map(Number) })
const CYCLE_MS = 2000
const FADE_MS = 600

// Sign in / sign up. Signed out there's no theme setting to read, so the page
// always wears Light Dots, with its accent cycling through the easel colours
// (looks in layout.css under .auth-*).
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

  // Light Dots while this page is up; the device's own theme comes back after
  useLayoutEffect(() => {
    applyTheme('light-dots')
    return () => applyTheme(getTheme())
  }, [])

  // Every 2s the accent fades to the next easel colour, and the title's dot pops
  const appRef = useRef(null)
  const titleRef = useRef(null)
  useLayoutEffect(() => {
    const el = appRef.current
    if (!el) return
    const paint = (c) => {
      const rgb = (a) => `rgb(${a.map(Math.round).join(',')})`
      el.style.setProperty('--accent-base', rgb(c.base))
      el.style.setProperty('--accent-dark', rgb(c.base))
      el.style.setProperty('--accent-light', rgb(c.light))
      el.style.setProperty('--accent-base-rgb', c.rgb.map(Math.round).join(','))
    }
    const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let idx = 0
    let raf = 0
    paint(toStop(RING[0]))
    const timer = setInterval(() => {
      const from = toStop(RING[idx])
      idx = (idx + 1) % RING.length
      const to = toStop(RING[idx])
      const t = titleRef.current
      if (t && !reduce) { t.classList.remove('dot-pop'); void t.offsetWidth; t.classList.add('dot-pop') }
      if (reduce) { paint(to); return }
      const t0 = performance.now()
      cancelAnimationFrame(raf)
      const step = (now) => {
        const k = Math.min(1, (now - t0) / FADE_MS)
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        paint({ base: mix(from.base, to.base, e), light: mix(from.light, to.light, e), rgb: mix(from.rgb, to.rgb, e) })
        if (k < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, CYCLE_MS)
    return () => { clearInterval(timer); cancelAnimationFrame(raf) }
  }, [])

  return (
    <div className="app-wrap">
      <div className="phone auth-screen" id="app" ref={appRef}>
        <div className="auth-body">
          <p className="auth-title" ref={titleRef}>Easels</p>
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

            <button type="submit" className="mark-complete-btn auth-submit" disabled={loading}>
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
