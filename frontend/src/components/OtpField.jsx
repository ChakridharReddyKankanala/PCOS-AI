import { useId } from 'react'

// A single box for the 6-character code from the email. Used for sign-in and for report downloads.
export default function OtpField({ value, onChange, label = 'Verification code', autoFocus = false }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink-2">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\s/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        maxLength={6}
        spellCheck={false}
        placeholder="000000"
        className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-center font-display text-2xl font-semibold tracking-[0.4em] text-ink placeholder:text-ink-3/60 hover:border-ink-3 focus:border-teal-deep sm:w-48"
      />
    </div>
  )
}
