import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)

// supabase-js keeps the session in localStorage. Reading it synchronously means
// the app (header, control bar, cached content) renders on the very first frame
// instead of after getSession() resolves — which, with an expired access token,
// waits on a network refresh. getSession() still runs and corrects this if the
// stored session turns out to be dead.
function storedUser() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!/^sb-.*-auth-token$/.test(k)) continue
      const v = JSON.parse(localStorage.getItem(k) || 'null')
      const u = v?.user || v?.currentSession?.user
      if (u?.id) return u
    }
  } catch { /* fall through */ }
  return undefined
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(storedUser) // undefined = loading, null = not signed in

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
