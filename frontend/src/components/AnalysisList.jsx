import { bandOf, fmtDate, pct } from '../lib/format'
import { reviewIndicators } from '../lib/review'
import { toReport } from '../lib/results'
import { Link } from '../lib/router'

function Stat({ label, report }) {
  return (
    <div className="min-w-[5.5rem]">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className="font-semibold">{report.usable ? pct(report.probability) : <span className="font-normal text-ink-3">none</span>}</p>
    </div>
  )
}

// A list of saved analyses (history items from the API). Each row links to its full result.
export default function AnalysisList({ items, showPatient = false, linked = new Set(), empty = 'Nothing here yet.' }) {
  if (!items.length) return <p className="mt-4 text-ink-3">{empty}</p>
  return (
    <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
      {items.map((raw) => {
        const r = toReport(raw)
        const p = r.combined.probability
        const band = p == null ? null : bandOf(p)
        const hasCombined = raw.combined !== undefined
        const review = showPatient ? reviewIndicators(raw).labels : []
        return (
          <li key={r.id} className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
            <div className="min-w-[10rem] flex-1">
              {showPatient && (
                <p className="font-semibold">
                  {r.patientName || 'Patient'}
                  {linked.has(r.patientId) && (
                    <span className="ml-2 rounded-full bg-teal-tint px-2 py-0.5 align-middle text-xs font-semibold text-teal-deep">
                      Access code used
                    </span>
                  )}
                </p>
              )}
              <p className={showPatient ? 'text-sm text-ink-3' : 'font-semibold'}>{fmtDate(r.createdAt)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Stat label="Ultrasound" report={r.ultrasound} />
              <Stat label="Clinical" report={r.clinical} />
              {hasCombined && (
                <div className="min-w-[8rem]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Combined</p>
                  <p className="flex items-center gap-2 font-semibold">
                    {band && <span className="h-2.5 w-2.5 rounded-full" style={{ background: band.color }} aria-hidden="true" />}
                    {p == null ? <span className="font-normal text-ink-3">none</span> : `${pct(p)} · ${r.combined.label}`}
                  </p>
                </div>
              )}
            </div>
            {review.length > 0 && (
              <ul aria-label="Review indicators" className="flex w-full flex-wrap gap-2 text-sm text-ink-2">
                {review.map((label) => (
                  <li key={label} className="rounded-full bg-paper px-3 py-1">{label}</li>
                ))}
              </ul>
            )}
            <Link to={`/reports/${r.id}`} className="font-semibold text-teal-deep underline underline-offset-4 hover:text-ink">
              Open<span className="sr-only"> the result from {fmtDate(r.createdAt)}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
