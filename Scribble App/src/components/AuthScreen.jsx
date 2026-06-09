import { useState } from 'react'
import { supabase } from '../supabaseClient'

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
      <div className="phone" id="app" style={{ justifyContent: 'center', alignItems: 'center', padding: '0 32px' }}>
        <div style={{ width: '100%' }}>
          <p style={{
            fontFamily: "'BaskervilleSemi', 'Baskerville', 'Georgia', serif",
            fontSize: 40,
            fontWeight: 700,
            color: '#242424',
            margin: '0 0 4px 0',
            lineHeight: 1.1,
          }}>
            Scribble
          </p>
          <p style={{
            fontFamily: "'Open Sans', system-ui, sans-serif",
            fontSize: 14,
            fontWeight: 600,
            color: '#959493',
            margin: '0 0 40px 0',
          }}>
            {mode === 'signin' ? 'Sign in to your account' : 'Create an account'}
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              className="add-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <input
              className="add-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{ width: '100%', boxSizing: 'border-box' }}
            />

            {error && (
              <p style={{ fontFamily: "'Open Sans', system-ui, sans-serif", fontSize: 13, color: '#B24A4A', margin: 0 }}>
                {error}
              </p>
            )}
            {message && (
              <p style={{ fontFamily: "'Open Sans', system-ui, sans-serif", fontSize: 13, color: '#3F5999', margin: 0 }}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                height: 48,
                borderRadius: 4,
                background: '#3F5999',
                border: 'none',
                color: '#fff',
                fontFamily: "'Open Sans', system-ui, sans-serif",
                fontSize: 16,
                fontWeight: 600,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.6 : 1,
                marginTop: 4,
              }}
            >
              {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <button
            onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null); setMessage(null) }}
            style={{
              marginTop: 20,
              background: 'none',
              border: 'none',
              fontFamily: "'Open Sans', system-ui, sans-serif",
              fontSize: 14,
              fontWeight: 600,
              color: '#6993FE',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
