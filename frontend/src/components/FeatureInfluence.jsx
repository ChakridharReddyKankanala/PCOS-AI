// Bars for the clinical features the Random Forest relies on most.
//
// These are the forest's overall importances, the same for every person. They show which markers
// matter to the model in general, not why this particular result came out as it did, so the text
// says so. Each row is { key, label, shown, importance (0..1), note }.
// heading/intro can be turned off when the list is shown as an illustration.

const share = (v) => `${(v * 100).toFixed(1)}%`

export default function FeatureInfluence({ rows, heading = true, intro = true, limit = 8 }) {
  const list = [...rows].sort((a, b) => b.importance - a.importance).slice(0, limit)
  if (!list.length) return null
  const max = Math.max(...list.map((r) => r.importance), 0.001)
  const hasLocalEffects = list.some((r) => typeof r.shap === 'number')

  return (
    <section aria-labelledby={heading ? 'infl-h' : undefined} aria-label={heading ? undefined : 'Clinical feature importance'}>
      {heading && (
        <>
          <h3 id="infl-h" className="text-xl font-semibold">
            {hasLocalEffects ? 'What influenced this result' : 'What the clinical model relies on most'}
          </h3>
          {intro && (
            <p className="mt-1 max-w-[52ch] text-ink-2">
              {hasLocalEffects
                ? 'SHAP values show how each feature moved this patient’s model estimate. Positive values raise the estimate; negative values lower it. They describe model behavior, not medical causation.'
                : 'Longer bars are features the Random Forest uses more across all people. They do not show why this result came out as it did. The value shown is what the model was given for this person.'}
            </p>
          )}
        </>
      )}

      <ul className={`${heading ? 'mt-5' : ''} space-y-3.5`}>
        {list.map((r) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_3.25rem] items-center gap-x-3">
            <span className="leading-tight">
              <span className="block text-sm font-semibold">{r.label}</span>
              <span className="block text-sm text-ink-3">
                {r.shown}
                {r.note && <span className="ml-1.5 rounded bg-paper px-1.5 py-0.5 text-xs font-semibold text-ink-2">{r.note}</span>}
                {r.direction && <span className="mt-0.5 block text-xs text-ink-3">{r.direction}</span>}
              </span>
            </span>
            <span className="relative block h-2.5 rounded-full bg-paper" aria-hidden="true">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-teal"
                style={{ width: `${Math.max((r.importance / max) * 100, 3)}%` }}
              />
            </span>
            <span className="text-right text-sm font-semibold">
              {typeof r.shap === 'number' ? `${r.shap > 0 ? '+' : ''}${r.shap.toFixed(3)}` : share(r.importance)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
