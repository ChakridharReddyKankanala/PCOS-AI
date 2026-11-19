import { useCallback, useEffect, useState } from 'react'
import { generateReport, listReports } from '../lib/api'
import { fmtDate } from '../lib/format'
import ReportDownload from './ReportDownload'

// The PDF side of one saved analysis: the reports already made for it, and a button to make one.
export default function ReportActions({ analysisId }) {
  const [reports, setReports] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const all = await listReports()
      setReports(all.filter((r) => r.analysis_id === analysisId))
    } catch (e) {
      setReports([])
      setError(e.message)
    }
  }, [analysisId])

  useEffect(() => {
    load()
  }, [load])

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      await generateReport(analysisId)
      await load()
    } catch (e) {
      setError(e.status === 404 ? 'This result was not saved on the server, so a PDF cannot be made from it.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="pdf-h" className="mt-14 border-t border-line pt-8">
      <h3 id="pdf-h" className="text-xl font-semibold">
        PDF report
      </h3>
      <p className="mt-1 max-w-[60ch] text-ink-2">
        Make a PDF of this result. Downloading it needs a code that is emailed to your account.
      </p>

      {reports === null ? (
        <p className="mt-4 text-ink-3">Loading reports</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {reports.map((r) => (
            <li key={r.report_id} className="flex flex-wrap items-start gap-x-6 gap-y-1">
              <span className="text-ink-2">Report made {fmtDate(r.created_at)}</span>
              <ReportDownload reportId={r.report_id} />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={create}
        disabled={busy}
        className="mt-5 rounded-lg border border-line bg-white px-5 py-2.5 font-semibold text-ink shadow-sm transition-colors hover:border-ink-3 disabled:opacity-60"
      >
        {busy ? 'Creating' : reports?.length ? 'Create another PDF' : 'Create PDF report'}
      </button>
      {error && (
        <p role="alert" className="mt-2 font-semibold text-berry">
          {error}
        </p>
      )}
    </section>
  )
}
