import { useEffect, useId, useMemo, useState } from 'react'
import { APP } from '../config'
import { COMPUTED, FEATURES, GROUPS, parseClinical } from '../lib/features'

const fieldBase =
  'w-full rounded-lg border bg-paper py-2.5 pl-3 text-base text-ink placeholder:text-ink-3 transition-colors hover:border-ink-3 focus:border-teal-deep'

function NumberField({ feature: f, value, error, onChange }) {
  const id = useId()
  const describedBy = [error && `${id}-err`, f.hint && `${id}-hint`].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink-2">
        {f.label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={f.min}
          max={f.max}
          step={f.step}
          value={value}
          onChange={(e) => onChange(f.key, e.target.value)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          className={`${fieldBase} ${error ? 'border-berry' : 'border-line'} ${f.unit ? 'pr-20' : 'pr-3'}`}
        />
        {f.unit && (
          <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-ink-3">
            {f.unit}
          </span>
        )}
      </div>
      {f.hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-ink-3">
          {f.hint}
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

function SelectField({ feature: f, value, onChange }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink-2">
        {f.label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(f.key, e.target.value)}
        className={`${fieldBase} mt-1 border-line pr-3`}
      >
        <option value="">Not entered</option>
        {f.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

const YES_NO = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
]

// A short row of radio buttons styled as one segmented control. "Not entered" keeps the value blank.
function Choice({ feature: f, value, onChange }) {
  const name = useId()
  const options = [{ value: '', label: 'Not entered' }, ...(f.kind === 'yesno' ? YES_NO : f.options)]
  return (
    <fieldset className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:col-span-2">
      <legend className="sr-only">{f.label}</legend>
      <span aria-hidden="true" className="text-base font-semibold text-ink-2">
        {f.label}
      </span>
      <div className="inline-flex overflow-hidden rounded-lg border border-line bg-paper">
        {options.map((o) => (
          <label key={o.value || 'none'} className="relative cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(f.key, o.value)}
              className="peer sr-only"
            />
            <span className="block px-3.5 py-2 text-sm font-semibold text-ink-2 transition-colors hover:bg-gel peer-checked:bg-ink peer-checked:text-paper peer-focus-visible:outline-3 peer-focus-visible:-outline-offset-3 peer-focus-visible:outline-teal">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

// Values the server calculates from the ones above. Shown so people can check them.
function Calculated({ values, keys }) {
  const n = (k) => (values[k] === '' || values[k] == null ? undefined : Number(values[k]))
  const v = Object.fromEntries(FEATURES.filter((f) => f.kind === 'number').map((f) => [f.key, n(f.key)]))
  const rows = COMPUTED.filter((c) => keys.includes(c.key)).map((c) => ({ c, value: c.compute(v) })).filter((r) => r.value != null && Number.isFinite(r.value))
  if (!rows.length) return null
  return (
    <p className="mt-4 text-sm text-ink-3">
      Calculated by the server:{' '}
      {rows.map((r, i) => (
        <span key={r.c.key}>
          {i > 0 && ', '}
          <span className="font-semibold text-ink-2">
            {r.c.label} {r.value.toFixed(r.c.key === 'bmi' ? 1 : 2)}
            {r.c.unit && ` ${r.c.unit}`}
          </span>
        </span>
      ))}
      .
    </p>
  )
}

function Group({ group, fields, values, errors, onChange, defaultOpen }) {
  const entered = fields.filter((f) => values[f.key] !== '' && values[f.key] != null).length
  const hasError = fields.some((f) => errors[f.key])
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => {
    if (hasError) setOpen(true)
  }, [hasError])

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group rounded-xl border border-line bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-lg font-semibold">{group.title}</span>
          <span className="block text-sm text-ink-3">{group.note}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span
            className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${
              entered ? 'bg-teal-tint text-teal-deep' : 'bg-paper text-ink-3'
            }`}
          >
            {entered} of {fields.length}
          </span>
          <svg viewBox="0 0 20 20" className="h-5 w-5 text-ink-3 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 8 5 5 5-5" />
          </svg>
        </span>
      </summary>
      <div className="border-t border-line px-5 pb-6 pt-5">
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
          {fields.map((f) => {
            if (f.kind === 'number')
              return <NumberField key={f.key} feature={f} value={values[f.key]} error={errors[f.key]} onChange={onChange} />
            if (f.kind === 'select') return <SelectField key={f.key} feature={f} value={values[f.key]} onChange={onChange} />
            return <Choice key={f.key} feature={f} value={values[f.key]} onChange={onChange} />
          })}
        </div>
        {group.id === 'body' && <Calculated values={values} keys={['bmi', 'waist_hip_ratio']} />}
        {group.id === 'labs' && <Calculated values={values} keys={['fsh_lh']} />}
      </div>
    </details>
  )
}

export default function ClinicalForm({ values, onChange, provided }) {
  const { errors } = useMemo(() => parseClinical(values), [values])
  return (
    <section aria-labelledby="clin-h">
      <h2 id="clin-h" className="text-2xl font-semibold">
        Clinical values
      </h2>
      <p className="mt-1 max-w-[58ch] text-ink-2">
        {APP.clinical.model} reads these. Fill in what you have. Anything left blank is replaced by a typical value on the
        server, so the more you enter, the more the clinical result reflects the person.{' '}
        <span className="text-ink-3">
          {provided} of {FEATURES.length} entered.
        </span>
      </p>

      <div className="mt-6 space-y-3">
        {GROUPS.map((g, i) => (
          <Group
            key={g.id}
            group={g}
            fields={FEATURES.filter((f) => f.group === g.id)}
            values={values}
            errors={errors}
            onChange={onChange}
            defaultOpen={i === 0}
          />
        ))}
      </div>
    </section>
  )
}
