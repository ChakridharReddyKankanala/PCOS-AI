import { BANDS } from '../config'

export const bandOf = (p) => BANDS.find((b) => p < b.max) ?? BANDS[BANDS.length - 1]

export const pct = (p) => `${Number((p * 100).toFixed(2))}%`

// The server sometimes sends times without a timezone (MongoDB returns naive UTC values).
// Treat those as UTC so every date is shown in the viewer's own time zone.
export function parseDate(value) {
  if (!value) return null
  const s = String(value)
  const d = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(s) ? s : `${s}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function fmtDate(value) {
  const d = parseDate(value)
  if (!d) return ''
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
