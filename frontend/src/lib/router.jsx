import { useEffect, useState } from 'react'

// A tiny hash router: links look like #/about. It needs no server setup, so the built site
// works from any static host or even a plain folder.
//
// Routes are listed in ROUTES. A route ending in "/:id" matches any single segment after it and
// passes it on as params.id, for example #/reports/12661ac5-... matches '/reports/:id'.

export const ROUTES = {
  '/': 'Home',
  '/screen': 'Screen',
  '/reports': 'My reports',
  '/reports/:id': 'Report',
  '/sign-in': 'Sign in',
  '/about': 'About PCOS',
  '/how-it-works': 'How it works',
}

const patterns = Object.keys(ROUTES).map((route) => ({
  route,
  parts: route.split('/').filter(Boolean),
}))

function match(path) {
  const segs = path.split('/').filter(Boolean)
  for (const { route, parts } of patterns) {
    if (parts.length !== segs.length) continue
    const params = {}
    const ok = parts.every((p, i) => {
      if (p.startsWith(':')) {
        params[p.slice(1)] = decodeURIComponent(segs[i])
        return true
      }
      return p === segs[i]
    })
    if (ok) return { route, params }
  }
  return { route: '/', params: {} }
}

const read = () => match(window.location.hash.replace(/^#/, '').split('?')[0] || '/')

export function useRoute() {
  const [state, setState] = useState(read)
  useEffect(() => {
    const onChange = () => {
      setState(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return state
}

export const navigate = (to) => {
  window.location.hash = to
}

export function Link({ to, children, ...rest }) {
  return (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  )
}
