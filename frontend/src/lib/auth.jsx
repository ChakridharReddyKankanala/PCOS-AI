import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getMe, getTokens, setExpiredHandler, setTokens } from './api'

// Who is signed in. `status` is 'loading' while a saved session is being checked, then 'in' or 'out'.
// user = { user_id, role: 'patient' | 'doctor', full_name, email? }

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(() => (getTokens()?.access ? 'loading' : 'out'))

  const signOut = useCallback(() => {
    setTokens(null)
    setUser(null)
    setStatus('out')
  }, [])

  // The API layer calls this when a token can no longer be refreshed.
  useEffect(() => {
    setExpiredHandler(() => {
      setUser(null)
      setStatus('out')
    })
  }, [])

  // Restore a saved session on page load.
  useEffect(() => {
    if (!getTokens()?.access) return
    let alive = true
    getMe()
      .then((me) => {
        if (!alive) return
        setUser({ user_id: me.user_id, role: me.role, full_name: me.full_name, email: me.email })
        setStatus('in')
      })
      .catch(() => {
        if (alive) signOut()
      })
    return () => {
      alive = false
    }
  }, [signOut])

  // `data` is the body of verify-registration / verify-login.
  const signIn = useCallback((data) => {
    setTokens({ access: data.access_token, refresh: data.refresh_token })
    setUser({ user_id: data.user_id, role: data.role, full_name: data.full_name })
    setStatus('in')
  }, [])

  const value = useMemo(() => ({ user, status, signIn, signOut }), [user, status, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
