import { useId } from 'react'

// A labelled text input in the same style as the clinical form.
export default function TextField({ label, hint, error, className = '', ...input }) {
  const id = useId()
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink-2">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...input}
        className={`mt-1 w-full rounded-lg border bg-paper px-3 py-2.5 text-base text-ink placeholder:text-ink-3 transition-colors hover:border-ink-3 focus:border-teal-deep ${
          error ? 'border-berry' : 'border-line'
        }`}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="mt-1 text-sm font-semibold text-berry">
          {error}
        </p>
      )}
    </div>
  )
}
