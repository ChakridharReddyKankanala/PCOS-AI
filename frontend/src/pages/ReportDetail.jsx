import { useEffect, useState } from 'react'
import AuthGate from '../components/AuthGate'
import Container from '../components/Container'
import ReportActions from '../components/ReportActions'
import ReportView from '../components/ReportView'
import { getAnalysis } from '../lib/api'
import { countEntered } from '../lib/features'
import { toReport } from '../lib/results'
import { Link } from '../lib/router'

function Detail({ id }) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    getAnalysis(id)
      .then((raw) => alive && setState({ status: 'ok', report: toReport(raw) }))
      .catch((e) => alive && setState({ status: 'error', message: e.message }))
    return () => {
      alive = false
    }
  }, [id])

  return (
    <Container className="pb-24 pt-10">
      <Link to="/reports" className="font-semibold text-teal-deep underline underline-offset-4 hover:text-ink">
        ← All results
      </Link>

      {state.status === 'loading' && <p className="mt-10 text-ink-3">Loading the result</p>}
      {state.status === 'error' && (
        <p role="alert" className="mt-10 text-lg font-semibold text-berry">
          {state.message}
        </p>
      )}
      {state.status === 'ok' && (
        <>
          <h1 className="mt-6 text-3xl font-semibold sm:text-4xl">
            Screening result{state.report.patientName ? ` for ${state.report.patientName}` : ''}
          </h1>
          <div className="mt-10">
            <ReportView report={state.report} entered={countEntered(state.report.clinicalInput)}>
              <ReportActions analysisId={state.report.id} />
            </ReportView>
          </div>
        </>
      )}
    </Container>
  )
}

export default function ReportDetail({ params }) {
  return (
    <AuthGate next={`/reports/${params.id}`} title="Sign in to see this result" text="Saved results are only shown to the account that made them, or to a doctor.">
      <Detail id={params.id} />
    </AuthGate>
  )
}
