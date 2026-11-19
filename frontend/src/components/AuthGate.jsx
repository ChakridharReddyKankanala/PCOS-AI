import { useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { Link } from '../lib/router'
import Container from './Container'
import { primaryBtn } from './buttons'

// Where to go after signing in. Set when a page asks someone to sign in, read by the sign-in page.
let afterSignIn = '/screen'
export const getAfterSignIn = () => afterSignIn

// Wraps a page that needs an account. While the saved session is checked it shows nothing, so a
// signed-in person does not see the sign-in prompt flash by.
export default function AuthGate({ next, title = 'Sign in to continue', text, role, children }) {
  const { user, status } = useAuth()
  useEffect(() => {
    if (status === 'out') afterSignIn = next
  }, [status, next])
  if (status === 'loading') return <Container className="py-24 text-ink-3">Checking your session</Container>
  if (status === 'in' && (!role || user.role === role)) return children
  if (status === 'in') {
    return (
      <Container className="py-24">
        <h1 className="text-3xl font-semibold">This page is for {role}s</h1>
        <p className="mt-3 max-w-[52ch] text-lg text-ink-2">You are signed in as a {user.role}.</p>
      </Container>
    )
  }
  return (
    <Container className="py-24">
      <div className="max-w-xl">
        <h1 className="text-balance text-4xl font-semibold">{title}</h1>
        <p className="mt-4 text-lg text-ink-2">{text}</p>
        <Link to="/sign-in" className={`${primaryBtn} mt-8`}>
          Sign in or create an account
        </Link>
      </div>
    </Container>
  )
}
