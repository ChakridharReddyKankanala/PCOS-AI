import { APP, MIN_CLINICAL_FIELDS } from '../config'
import { bandOf, fmtDate, pct } from '../lib/format'
import { describeModelValue, FEATURES, wasEntered } from '../lib/features'
import { METHOD_TEXT } from '../lib/results'
import FeatureInfluence from './FeatureInfluence'
import ReadoutTracks from './ReadoutTracks'
import AiInsightsCard from './AiInsightsCard'

function Warning({ children, tone = 'berry' }) {
  return (
    <p
      role="note"
      className={`mt-4 max-w-[64ch] border-l-4 pl-4 text-ink-2 ${tone === 'berry' ? 'border-berry' : 'border-teal'}`}
    >
      {children}
    </p>
  )
}

// One analysis, shown the same way right after a run and when it is opened from the history.
//   report     from toReport()
//   entered    how many clinical values were typed in (counted from the saved input for old reports)
//   stale      true when the form changed after this result was produced
export default function ReportView({ report, entered, imageUrl, stale = false, resultsRef, children }) {
  const { combined, clinical, ultrasound } = report
  const p = combined.probability
  const band = p == null ? null : bandOf(p)
  const mostlyDefaults = clinical.usable && entered < MIN_CLINICAL_FIELDS

  const rows = []
  if (ultrasound.usable) {
    rows.push({
      id: 'img',
      label: APP.imaging.label,
      sub: APP.imaging.model,
      p: ultrasound.probability,
      strong: combined.method === 'ultrasound_only',
    })
  }
  if (clinical.usable) {
    rows.push({
      id: 'clin',
      label: APP.clinical.label,
      sub: mostlyDefaults ? `${APP.clinical.model}, mostly defaults` : APP.clinical.model,
      p: clinical.probability,
      strong: combined.method === 'clinical_only',
    })
  }
  if (combined.method === 'dual_modal_weighted_average' && p != null) {
    rows.push({ id: 'fused', label: APP.fusion.label, sub: APP.fusion.model, p, strong: true })
  }

  const importance = report.importance.map((r, i) => ({
    key: `${r.name}-${i}`,
    label: r.feature?.label ?? r.name,
    shown: r.feature ? describeModelValue(r.feature, r.value) : String(r.value ?? ''),
    importance: r.importance,
    shap: r.shap,
    direction: r.direction,
    note: r.feature && report.clinicalInput && !wasEntered(r.feature, report.clinicalInput) ? 'default' : undefined,
  }))

  return (
    <section ref={resultsRef} aria-labelledby="result-h" className="scroll-mt-6">
      <h2 id="result-h" className="sr-only">
        Result
      </h2>

      {stale && (
        <p role="status" className="mb-6 max-w-[64ch] border-l-4 border-berry pl-4 font-semibold text-ink-2">
          The inputs changed after this result. Run the analysis again to update it.
        </p>
      )}

      <div className={`grid gap-14 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-20 ${stale ? 'opacity-55' : ''}`}>
        <div aria-live="polite">
          {report.createdAt && <p className="mb-3 text-sm text-ink-3">{fmtDate(report.createdAt)}</p>}
          {band ? (
            <>
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: band.color }} aria-hidden="true" />
                <p className="font-display text-4xl font-semibold leading-tight text-balance sm:text-5xl">{band.headline}</p>
              </div>
              <p className="mt-3 max-w-[56ch] text-lg text-ink-2">
                <span className="font-semibold" style={{ color: band.color }}>
                  {p >= 0.5 ? 'Positive' : 'Negative'} · {pct(p)}
                </span>
                {' estimate. '}
                Model label: <span className="font-semibold text-ink">{combined.label}</span>, using a 50% threshold.{' '}
                {METHOD_TEXT[combined.method] ?? METHOD_TEXT.legacy}
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-4xl font-semibold leading-tight text-balance sm:text-5xl">No result</p>
              <p className="mt-3 max-w-[56ch] text-lg text-ink-2">{METHOD_TEXT.insufficient_data}</p>
            </>
          )}

          {mostlyDefaults && (
            <Warning>
              Only {entered} of {FEATURES.length} clinical values were entered. The server replaced the rest with
              typical values, so the result mostly reflects those defaults and not this person.
            </Warning>
          )}
          {!clinical.usable && <Warning tone="teal">Clinical model: {clinical.note}</Warning>}
          {!ultrasound.usable && ultrasound.label !== 'NOT_PROVIDED' && (
            <Warning tone="teal">Ultrasound model: {ultrasound.note}</Warning>
          )}
          {ultrasound.usable && clinical.usable && Math.abs(ultrasound.probability - clinical.probability) >= 0.2 && (
            <Warning tone="teal">
              The model probabilities differ by {Math.round(Math.abs(ultrasound.probability - clinical.probability) * 100)}
              percentage points. Review each reading before relying on the combined estimate.
            </Warning>
          )}

          {rows.length > 0 && <ReadoutTracks rows={rows} />}
        </div>

        <div className="space-y-10">
          {(imageUrl || report.heatmapUrl) && (
            <div className="grid gap-5 sm:grid-cols-2">
              {imageUrl && (
                <figure>
                  <img src={imageUrl} alt="The ultrasound scan included in this analysis" className="max-h-80 w-full rounded-lg object-contain" />
                  <figcaption className="mt-2 text-sm text-ink-3">Uploaded ultrasound</figcaption>
                </figure>
              )}
              {report.heatmapUrl ? (
                <figure>
                  <img src={report.heatmapUrl} alt="Grad-CAM++ heatmap overlay showing image regions used by the model" className="max-h-80 w-full rounded-lg object-contain" />
                  <figcaption className="mt-2 text-sm text-ink-3">Grad-CAM++ model attention overlay</figcaption>
                </figure>
              ) : imageUrl ? (
                <p className="self-center text-sm text-ink-3">A heatmap is unavailable for this analysis.</p>
              ) : null}
            </div>
          )}
          <FeatureInfluence rows={importance} />
        </div>
      </div>

      {report.summary.length > 0 && (
        <div className="mt-10 max-w-[70ch] space-y-3 text-lg text-ink-2">
          {report.summary.map((t) => (
            <p key={t}>{t}</p>
          ))}
        </div>
      )}

      {report.aiInsights && (
        <AiInsightsCard
          insights={report.aiInsights}
          analysisId={report.id}
          onOpenChat={(id) => window.dispatchEvent(new CustomEvent('open-pcos-chat', { detail: { analysisId: id } }))}
        />
      )}

      <details className="mt-10 max-w-3xl rounded-xl border border-line bg-paper px-5 py-4 text-ink-2">
        <summary className="cursor-pointer font-semibold text-ink">Technical details</summary>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="font-semibold">Analysis ID</dt>
          <dd className="break-all">{report.id}</dd>
          <dt className="font-semibold">Ultrasound model</dt>
          <dd>
            {ultrasound.version ?? 'n/a'}, {ultrasound.label}
            {ultrasound.probability != null && `, probability ${ultrasound.probability}`}
          </dd>
          <dt className="font-semibold">Clinical model</dt>
          <dd>
            {clinical.version ?? 'n/a'}, {clinical.label}
            {clinical.probability != null && `, probability ${clinical.probability}`}
          </dd>
          <dt className="font-semibold">Combined</dt>
          <dd>
            {combined.version ?? 'n/a'}, {combined.method}
            {combined.confidence != null && `, confidence score ${combined.confidence}`}
          </dd>
        </dl>
        <p className="mt-3 text-sm text-ink-3">
          The confidence score is the larger of the PCOS and non-PCOS probabilities. It is not a calibrated confidence
          interval.
        </p>
      </details>

      {children}
    </section>
  )
}
