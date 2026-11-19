import { useState } from 'react'
import { getAfterSignIn } from '../components/AuthGate'
import Container from '../components/Container'
import OtpField from '../components/OtpField'
import TextField from '../components/TextField'
import { login, register, verifyLogin, verifyRegistration } from '../lib/api'
import { useAuth } from '../lib/auth'
import { HERO } from '../content/images'
import { Link, navigate } from '../lib/router'

const submitBtn =
  'rounded-lg bg-teal px-8 py-3 text-lg font-semibold text-white shadow-lg shadow-teal/25 transition-colors hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-60'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignIn() {
  const { signIn, status, user } = useAuth()
  const [mode, setMode] = useState('signin') // signin | register
  const [pending, setPending] = useState(null) // { userId, kind: 'login' | 'registration' } once a code was sent
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', role: 'patient' })
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  if (status === 'in' && user) {
    return (
      <Container className="py-24">
        <h1 className="text-3xl font-semibold">You are signed in</h1>
        <p className="mt-3 text-lg text-ink-2">Signed in as {user.full_name || 'your account'} ({user.role}).</p>
        <Link to="/screen" className="mt-6 inline-block font-semibold text-teal-deep underline underline-offset-4">
          Go to the screening page
        </Link>
      </Container>
    )
  }

  const validate = () => {
    const e = {}
    if (mode === 'register' && form.full_name.trim().length < 2) e.full_name = 'Enter your full name.'
    if (!EMAIL.test(form.email.trim())) e.email = 'Enter a valid email address.'
    if (mode === 'register' ? form.password.length < 8 : !form.password) e.password = mode === 'register' ? 'Use at least 8 characters.' : 'Enter your password.'
    setFieldErrors(e)
    return Object.keys(e).length === 0
  }

  const sendCode = async (e) => {
    e?.preventDefault()
    if (!validate()) return
    setBusy(true)
    setError('')
    setInfo('')
    try {
      if (mode === 'register') {
        const res = await register({
          email: form.email.trim(),
          password: form.password,
          full_name: form.full_name.trim(),
          role: form.role,
          phone: form.phone.trim() || null,
        })
        setPending({ userId: res.user_id, kind: 'registration' })
      } else {
        const res = await login(form.email.trim(), form.password)
        setPending({ userId: res.user_id, kind: res.requires_verification ? 'registration' : 'login' })
      }
      setOtp('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setBusy(true)
    setError('')
    try {
      // Signing in again sends a fresh code, for new and returning accounts alike.
      const res = await login(form.email.trim(), form.password)
      setPending({ userId: res.user_id, kind: res.requires_verification ? 'registration' : 'login' })
      setInfo('A new code was sent.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e) => {
    e.preventDefault()
    if (otp.length < 6) return setError('Enter the 6-character code.')
    setBusy(true)
    setError('')
    try {
      const data =
        pending.kind === 'registration'
          ? await verifyRegistration(pending.userId, otp)
          : await verifyLogin(pending.userId, otp)
      signIn(data)
      navigate(getAfterSignIn())
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (m) => {
    setMode(m)
    setError('')
    setFieldErrors({})
  }

  return (
    <Container className="py-14 sm:py-20">
      <div className="grid items-stretch gap-14 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-20">
        <div>
          {!pending ? (
            <>
              <h1 className="text-4xl font-semibold">{mode === 'signin' ? 'Sign in' : 'Create your account'}</h1>
              <p className="mt-3 max-w-[48ch] text-lg text-ink-2">
                {mode === 'signin'
                  ? 'Your screenings and reports are saved to your account. We email you a code each time you sign in.'
                  : 'An account keeps your screenings and lets you make PDF reports. We email you a code to confirm the address.'}
              </p>

              <div className="mt-8 inline-flex overflow-hidden rounded-lg border border-line" role="group" aria-label="Sign in or create an account">
                {[
                  ['signin', 'Sign in'],
                  ['register', 'Create account'],
                ].map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    aria-pressed={mode === m}
                    className={`px-5 py-2 font-semibold transition-colors ${
                      mode === m ? 'bg-ink text-paper' : 'bg-white text-ink-2 hover:bg-paper'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form onSubmit={sendCode} noValidate className="mt-6 space-y-5">
                {mode === 'register' && (
                  <TextField label="Full name" value={form.full_name} onChange={set('full_name')} autoComplete="name" error={fieldErrors.full_name} />
                )}
                <TextField label="Email" type="email" value={form.email} onChange={set('email')} autoComplete="email" error={fieldErrors.email} />
                {mode === 'register' && (
                  <TextField
                    label="Phone (optional)"
                    type="tel"
                    value={form.phone}
                    onChange={set('phone')}
                    autoComplete="tel"
                  />
                )}
                <TextField
                  label="Password"
                  type="password"
                  value={form.password}
                  onChange={set('password')}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  hint={mode === 'register' ? 'At least 8 characters.' : undefined}
                  error={fieldErrors.password}
                />
                {mode === 'register' && (
                  <fieldset>
                    <legend className="text-sm font-semibold text-ink-2">I am a</legend>
                    <div className="mt-2 flex gap-3">
                      {[
                        ['patient', 'Patient', 'Run screenings and keep your own reports.'],
                        ['doctor', 'Doctor', 'Review the screenings of patients who share a code.'],
                      ].map(([value, label, text]) => (
                        <label
                          key={value}
                          className={`flex-1 cursor-pointer rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-teal ${
                            form.role === value ? 'border-teal bg-teal-tint/40' : 'border-line bg-white hover:border-ink-3'
                          }`}
                        >
                          <input
                            type="radio"
                            name="role"
                            value={value}
                            checked={form.role === value}
                            onChange={set('role')}
                            className="sr-only"
                          />
                          <span className="block font-semibold">{label}</span>
                          <span className="mt-0.5 block text-sm text-ink-2">{text}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}

                {error && (
                  <p role="alert" className="font-semibold text-berry">
                    {error}
                  </p>
                )}
                <button type="submit" disabled={busy} className={submitBtn}>
                  {busy ? 'Please wait' : mode === 'signin' ? 'Send me a code' : 'Create account'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-4xl font-semibold">Check your email</h1>
              <p className="mt-3 max-w-[48ch] text-lg text-ink-2">
                We sent a 6-character code to <span className="font-semibold text-ink">{form.email.trim()}</span>. It expires in a
                few minutes.
              </p>
              <form onSubmit={verify} className="mt-8 space-y-5">
                <OtpField value={otp} onChange={setOtp} autoFocus />
                {info && (
                  <p role="status" className="text-ink-2">
                    {info}
                  </p>
                )}
                {error && (
                  <p role="alert" className="font-semibold text-berry">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <button type="submit" disabled={busy} className={submitBtn}>
                    {busy ? 'Checking' : pending.kind === 'registration' ? 'Verify and continue' : 'Sign in'}
                  </button>
                  <button type="button" onClick={resend} disabled={busy} className="font-semibold text-teal-deep underline underline-offset-4 hover:text-ink">
                    Send a new code
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPending(null)
                      setError('')
                      setInfo('')
                    }}
                    className="font-semibold text-ink-2 hover:text-ink"
                  >
                    Back
                  </button>
                </div>
              </form>
              <p className="mt-8 max-w-[52ch] text-sm text-ink-3">
                Developing locally? If the server has no email settings, it prints the code in its console instead of
                sending it.
              </p>
            </>
          )}
        </div>

        <div
          className="relative hidden min-h-[30rem] overflow-hidden rounded-2xl bg-paper lg:block"
          aria-hidden="true"
          style={{
            backgroundImage: `url(${HERO.signin.src})`,
            backgroundSize: 'cover',
            backgroundPosition: HERO.signin.position,
          }}
        >
        </div>
      </div>
    </Container>
  )
}
