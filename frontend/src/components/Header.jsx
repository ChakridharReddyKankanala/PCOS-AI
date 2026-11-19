import { APP } from '../config'
import { useAuth } from '../lib/auth'
import { Link } from '../lib/router'
import Container from './Container'
import { headerBtn } from './buttons'
import { ScanIcon } from './visuals/Icons'

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
      <path d="M16 3 3 24h26z" fill="var(--color-teal)" />
      <path d="M8 24a10 10 0 0 1 16 0" fill="none" stroke="white" strokeWidth="1.6" />
      <circle cx="16" cy="19" r="2.6" fill="white" />
    </svg>
  )
}

// White bar with the logo on the left, the pages in the middle and the account actions on the right.
export default function Header({ route }) {
  const { user, status, signOut } = useAuth()
  const signedIn = status === 'in' && user
  const isDoctor = user?.role === 'doctor'

  const nav = [
    { to: '/', label: 'Home' },
    { to: '/screen', label: 'Screen' },
    ...(signedIn ? [{ to: '/reports', label: isDoctor ? 'Patients' : 'My reports' }] : []),
    { to: '/about', label: 'About PCOS' },
    { to: '/how-it-works', label: 'How it works' },
  ]
  const current = (to) => route === to || (to === '/reports' && route === '/reports/:id')

  return (
    <header className="border-b border-line bg-white">
      <Container className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 py-4 md:grid md:h-[5.5rem] md:grid-cols-[1fr_auto_1fr] md:py-0">
        <Link to="/" className="order-1 flex items-center gap-3 md:order-none">
          <Mark />
          <span className="text-xl font-bold tracking-tight text-teal md:text-2xl">{APP.name}</span>
        </Link>

        <nav
          aria-label="Main"
          className="order-3 flex w-full flex-wrap gap-x-5 gap-y-1 text-[0.95rem] md:order-none md:w-auto md:justify-center md:gap-x-7 md:text-base"
        >
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              aria-current={current(n.to) ? 'page' : undefined}
              className={`border-b-2 py-1 font-medium transition-colors ${
                current(n.to) ? 'border-teal text-ink' : 'border-transparent text-ink-2 hover:text-ink'
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="order-2 flex items-center justify-end gap-3 md:order-none md:gap-4">
          {signedIn ? (
            <>
              <p className="hidden min-w-0 text-right leading-tight lg:block">
                <span className="block max-w-[11rem] truncate text-sm font-semibold">{user.full_name || 'Signed in'}</span>
                <span className="block text-xs capitalize text-ink-3">{user.role}</span>
              </p>
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-line px-4 py-2 font-semibold text-ink transition-colors hover:border-ink-3"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/sign-in" className="rounded-lg px-3 py-2 font-semibold text-ink-2 transition-colors hover:text-ink">
                Sign in
              </Link>
              <Link to="/screen" className={`${headerBtn} hidden sm:inline-flex`}>
                <ScanIcon className="h-5 w-5" />
                Start screening
              </Link>
            </>
          )}
        </div>
      </Container>
    </header>
  )
}
