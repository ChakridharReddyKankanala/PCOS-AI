import { pct } from '../lib/format'

// One shared 0-100% scale for every model, shaded by band so position alone tells the story.
// Teal = low, grey = borderline, berry = high. A thin line marks the model's 50% decision threshold. The band names are written out as well.
// `compact` always stacks the track under its label, for narrow columns.
const ZONES =
  'linear-gradient(to right, var(--color-teal-tint) 0 35%, var(--color-mid-tint) 35% 65%, var(--color-berry-tint) 65% 100%)'

export default function ReadoutTracks({ rows, compact = false, className = 'mt-8' }) {
  const rowGrid = compact
    ? 'grid-cols-[minmax(0,1fr)_auto]'
    : 'grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[10rem_minmax(0,1fr)_8rem] sm:gap-x-4'
  const trackPos = compact ? 'order-3 col-span-2' : 'order-3 col-span-2 sm:order-none sm:col-span-1'
  const valuePos = compact ? 'order-2' : 'order-2 sm:order-none'
  const axisInset = compact ? '' : 'sm:ml-[11rem] sm:mr-[5.5rem]'

  return (
    <div className={className}>
      <div className="space-y-6">
        {rows.map((r) => {
          const size = r.strong ? 26 : 20
          return (
            <div
              key={r.id}
              role="group"
              aria-label={`${r.label}, ${r.p >= 0.5 ? 'Positive' : 'Negative'}, ${pct(r.p)}`}
              className={`grid items-start gap-x-3 gap-y-3 sm:items-center ${rowGrid}`}
            >
              <div className="min-w-0">
                <p className={`font-display ${r.strong ? 'text-lg font-semibold' : 'text-base font-medium'}`}>{r.label}</p>
                <p className="break-words text-sm text-ink-3">{r.sub}</p>
              </div>
              <div className={`relative ${trackPos}`} style={{ height: r.strong ? 18 : 12 }}>
                <div className="absolute inset-0 rounded-full" style={{ background: ZONES }} />
                <span className="absolute inset-y-[-3px] left-1/2 w-px bg-ink-3/60" aria-hidden="true" />
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-paper bg-ink shadow-sm transition-[left] duration-500 motion-reduce:transition-none"
                  style={{ left: `${r.p * 100}%`, width: size, height: size }}
                />
              </div>
              <p className={`flex items-baseline justify-end gap-2 whitespace-nowrap text-right font-display font-semibold ${valuePos}`}>
                <span className="text-xs font-semibold text-ink-2">{r.p >= 0.5 ? 'Positive' : 'Negative'}</span>
                <span className={r.strong ? 'text-3xl' : 'text-xl'}>{pct(r.p)}</span>
              </p>
            </div>
          )
        })}
      </div>

      <div className={`relative mt-3 h-10 text-sm text-ink-2 ${axisInset}`} aria-hidden="true">
        <span className="absolute left-0 w-[35%] text-center">Low</span>
        <span className="absolute left-[35%] w-[30%] text-center">Borderline</span>
        <span className="absolute left-[65%] w-[35%] text-center">High</span>
        <span className="absolute left-[35%] top-5 -translate-x-1/2 text-xs text-ink-3">35%</span>
        <span className="absolute left-[65%] top-5 -translate-x-1/2 text-xs text-ink-3">65%</span>
        <span className="absolute left-1/2 top-5 -translate-x-1/2 text-xs font-semibold text-ink-2">50%</span>
      </div>
    </div>
  )
}
