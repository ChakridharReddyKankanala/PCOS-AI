import { useEffect, useState } from 'react'
import AnalysisList from '../components/AnalysisList'
import AuthGate from '../components/AuthGate'
import Container from '../components/Container'
import ReportDownload from '../components/ReportDownload'
import TextField from '../components/TextField'
import { primaryBtn } from '../components/buttons'
import {
  getAccessRequests,
  getAvailableDoctors,
  getDoctorCarePlan,
  getDoctorDashboardSummary,
  getDoctorHistory,
  getDoctorPatients,
  getHistory,
  getPatientAuthorizedDoctors,
  getPatientCarePlans,
  listReports,
  requestDoctorAccess,
  requestPatientAccess,
  respondToAccessRequest,
  revokeDoctorPatientAccess,
  revokePatientDoctorAccess,
  saveDoctorCarePlan,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { fmtDate, parseDate } from '../lib/format'
import { reviewIndicators } from '../lib/review'
import { Link } from '../lib/router'

const smallBtn =
  'rounded-lg border border-line bg-white px-5 py-2.5 font-semibold text-ink shadow-sm transition-colors hover:border-ink-3 disabled:opacity-60'
const accessRequestStatus = {
  pending: 'Awaiting response',
  approved: 'Approved',
  declined: 'Declined',
}

function Section({ id, title, text, children }) {
  return (
    <section aria-labelledby={id} className="mt-14 first:mt-0">
      <h2 id={id} className="text-2xl font-semibold">
        {title}
      </h2>
      {text && <p className="mt-1 max-w-[62ch] text-ink-2">{text}</p>}
      {children}
    </section>
  )
}

function PatientDoctorDirectory({ reloadKey, onChange }) {
  const state = useLoad(getAvailableDoctors, reloadKey)
  const [requesting, setRequesting] = useState('')
  const [error, setError] = useState('')

  const request = async (doctor) => {
    setRequesting(doctor.doctor_id)
    setError('')
    try {
      await requestDoctorAccess(doctor.doctor_id)
      onChange()
    } catch (e) {
      setError(e.message)
    } finally {
      setRequesting('')
    }
  }

  return (
    <Section
      id="available-doctors-h"
      title="Available doctors"
      text="Select a doctor to send an access request. They must accept before they can view your reports. Doctor credentials are not verified by this prototype."
    >
      {state.status === 'loading' && <p className="mt-4 text-ink-3">Loading</p>}
      {state.status === 'error' && (
        <p role="alert" className="mt-4 font-semibold text-berry">{state.message}</p>
      )}
      {state.status === 'ok' && !state.data.length && <p className="mt-4 text-ink-3">No doctor accounts are available yet.</p>}
      {state.status === 'ok' && state.data.length > 0 && (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {state.data.map((doctor) => (
            <li key={doctor.doctor_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-[12rem] flex-1">
                <p className="font-semibold">{doctor.full_name}</p>
                {!doctor.credential_verified && <p className="text-sm text-berry">Professional credentials not verified</p>}
              </div>
              <button
                type="button"
                onClick={() => request(doctor)}
                disabled={Boolean(requesting) || doctor.access_granted || doctor.request_pending}
                className="rounded-lg bg-teal px-4 py-2 font-semibold text-white hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-60"
              >
                {requesting === doctor.doctor_id
                  ? 'Sending'
                  : doctor.access_granted
                    ? 'Access granted'
                    : doctor.request_pending
                      ? 'Request pending'
                      : 'Request access'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 font-semibold text-berry">{error}</p>}
    </Section>
  )
}

function PatientDoctorAccess({ reloadKey, onChange }) {
  const state = useLoad(getPatientAuthorizedDoctors, reloadKey)
  const [revoking, setRevoking] = useState('')
  const [error, setError] = useState('')

  const revoke = async (doctor) => {
    if (!window.confirm(`Revoke ${doctor.full_name}'s access to your reports?`)) return
    setRevoking(doctor.doctor_id)
    setError('')
    try {
      await revokePatientDoctorAccess(doctor.doctor_id)
      onChange()
    } catch (e) {
      setError(e.message)
    } finally {
      setRevoking('')
    }
  }

  return (
    <Section
      id="authorized-doctors-h"
      title="Doctors with access"
      text="These doctors can view your saved reports. You can revoke access at any time."
    >
      {state.status === 'loading' && <p className="mt-4 text-ink-3">Loading</p>}
      {state.status === 'error' && <p role="alert" className="mt-4 font-semibold text-berry">{state.message}</p>}
      {state.status === 'ok' && !state.data.length && <p className="mt-4 text-ink-3">No doctors currently have access.</p>}
      {state.status === 'ok' && state.data.length > 0 && (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {state.data.map((doctor) => (
            <li key={doctor.doctor_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <span className="min-w-[10rem] flex-1 font-semibold">{doctor.full_name}</span>
              <button
                type="button"
                onClick={() => revoke(doctor)}
                disabled={Boolean(revoking)}
                className="font-semibold text-berry underline underline-offset-4 hover:text-ink disabled:opacity-60"
              >
                {revoking === doctor.doctor_id ? 'Revoking' : 'Revoke access'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 font-semibold text-berry">{error}</p>}
    </Section>
  )
}

function AccessRequestInbox({ isDoctor, reloadKey, onChange }) {
  const state = useLoad(getAccessRequests, reloadKey)
  const [responding, setResponding] = useState('')
  const [error, setError] = useState('')

  const respond = async (request, action) => {
    setResponding(request.request_id)
    setError('')
    try {
      await respondToAccessRequest(request.request_id, action)
      onChange()
    } catch (e) {
      setError(e.message)
    } finally {
      setResponding('')
    }
  }

  const requests = state.status === 'ok'
    ? state.data.filter((request) => request.status === 'pending')
    : []

  return (
    <Section
      id="access-requests-h"
      title={isDoctor ? 'Patient access requests' : 'Doctor access requests'}
      text={isDoctor
        ? 'Patients who requested access will appear here. Accepting lets you view their saved reports.'
        : 'A doctor request does not grant access unless you accept it.'}
    >
      {state.status === 'loading' && <p className="mt-4 text-ink-3">Loading</p>}
      {state.status === 'error' && <p role="alert" className="mt-4 font-semibold text-berry">{state.message}</p>}
      {state.status === 'ok' && !requests.length && <p className="mt-4 text-ink-3">No pending requests.</p>}
      {requests.length > 0 && (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {requests.map((request) => {
            const sentByCurrentUser = (isDoctor && request.requested_by === 'doctor')
              || (!isDoctor && request.requested_by === 'patient')
            const name = isDoctor ? request.patient_name : request.doctor_name
            return (
              <li key={request.request_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-[12rem] flex-1">
                  <p className="font-semibold">{name}</p>
                  <p className="text-sm text-ink-3">
                    {sentByCurrentUser ? 'You sent this request' : 'They requested access'}
                    {request.created_at && ` · ${fmtDate(request.created_at)}`}
                  </p>
                </div>
                {sentByCurrentUser ? (
                  <span className="text-sm font-semibold text-ink-3">{accessRequestStatus[request.status]}</span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => respond(request, 'decline')}
                      disabled={Boolean(responding)}
                      className="font-semibold text-berry underline underline-offset-4 disabled:opacity-60"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => respond(request, 'accept')}
                      disabled={Boolean(responding)}
                      className="rounded-lg bg-teal px-4 py-2 font-semibold text-white hover:bg-teal-deep disabled:opacity-60"
                    >
                      {responding === request.request_id ? 'Saving' : 'Accept'}
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 font-semibold text-berry">{error}</p>}
    </Section>
  )
}

function DoctorRequestAccess({ onChange }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return setError('Enter your patient’s account email.')
    setBusy(true)
    setError('')
    setDone('')
    try {
      const res = await requestPatientAccess(email.trim())
      setDone(res.message)
      setEmail('')
      onChange()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="request-patient-h" title="Request a patient’s access" text="Enter one patient’s account email. We don’t provide a directory of patient accounts. The patient must approve before you can view any reports.">
      <form onSubmit={submit} className="mt-4 flex max-w-lg flex-wrap items-end gap-3" noValidate>
        <TextField
          label="Patient email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="min-w-[12rem] flex-1"
        />
        <button type="submit" disabled={busy} className="rounded-lg bg-teal px-6 py-3 font-semibold text-white transition-colors hover:bg-teal-deep disabled:opacity-60">
          {busy ? 'Sending' : 'Send request'}
        </button>
      </form>
      {done && (
        <p role="status" className="mt-3 font-semibold text-teal-deep">
          {done}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 font-semibold text-berry">
          {error}
        </p>
      )}
    </Section>
  )
}

function useLoad(load, refreshKey) {
  const [state, setState] = useState({ status: 'loading', data: [] })
  useEffect(() => {
    let alive = true
    setState({ status: 'loading', data: [] })
    load()
      .then((data) => alive && setState({ status: 'ok', data }))
      .catch((e) => alive && setState({ status: 'error', data: [], message: e.message }))
    return () => {
      alive = false
    }
  }, [load, refreshKey])
  return state
}

function DashboardSummary({ refreshKey }) {
  const state = useLoad(getDoctorDashboardSummary, refreshKey)
  if (state.status === 'loading') return <p className="mb-10 text-ink-3">Loading dashboard summary</p>
  if (state.status === 'error') {
    return <p role="alert" className="mb-10 font-semibold text-berry">{state.message}</p>
  }

  const cards = [
    ['Authorized patients', state.data.authorized_patients],
    ['Saved screenings', state.data.saved_screenings],
    ['Screenings in the last 7 days', state.data.screenings_last_7_days],
    ['Near model display threshold', state.data.near_display_threshold],
    ['Follow-ups due in 7 days', state.data.follow_ups_due_soon],
    ['Overdue follow-ups', state.data.overdue_follow_ups],
  ]

  return (
    <dl className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-line bg-white p-5">
          <dt className="text-sm font-semibold text-ink-3">{label}</dt>
          <dd className="mt-1 font-display text-3xl font-semibold text-teal">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

const CARE_PLAN_STATUS_LABELS = {
  needs_review: 'Needs review',
  follow_up_scheduled: 'Follow-up scheduled',
  follow_up_complete: 'Follow-up complete',
}

function CarePlanEditor({ patientId }) {
  const [state, setState] = useState({ status: 'idle' })
  const [form, setForm] = useState({ clinician_note: '', follow_up_date: '', status: 'needs_review' })
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    if (!patientId) {
      setState({ status: 'idle' })
      return () => {
        alive = false
      }
    }
    setState({ status: 'loading' })
    getDoctorCarePlan(patientId)
      .then((plan) => {
        if (!alive) return
        setForm({
          clinician_note: plan.clinician_note || '',
          follow_up_date: plan.follow_up_date || '',
          status: plan.status || 'needs_review',
        })
        setState({ status: 'ready' })
      })
      .catch((e) => alive && setState({ status: 'error', message: e.message }))
    return () => {
      alive = false
    }
  }, [patientId])

  const save = async (e) => {
    e.preventDefault()
    setState({ status: 'saving' })
    setError('')
    try {
      await saveDoctorCarePlan(patientId, {
        ...form,
        follow_up_date: form.follow_up_date || null,
      })
      setState({ status: 'saved' })
    } catch (e) {
      setError(e.message)
      setState({ status: 'ready' })
    }
  }

  if (!patientId) return null

  return (
    <Section
      id="care-plan-h"
      title="Follow-up plan"
      text="Notes and follow-up details are shared with the patient."
    >
      {state.status === 'loading' && <p className="mt-4 text-ink-3">Loading follow-up plan</p>}
      {state.status === 'error' && (
        <p role="alert" className="mt-4 font-semibold text-berry">
          {state.message}
        </p>
      )}
      {['ready', 'saving', 'saved'].includes(state.status) && (
        <form onSubmit={save} className="mt-4 max-w-2xl space-y-4">
          <div>
            <label htmlFor="care-note" className="block text-sm font-semibold text-ink-2">
              Clinician note
            </label>
            <textarea
              id="care-note"
              maxLength={4000}
              rows={4}
              value={form.clinician_note}
              onChange={(e) => setForm((current) => ({ ...current, clinician_note: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-base text-ink focus:border-teal-deep"
              aria-describedby="care-note-hint"
            />
            <p id="care-note-hint" className="mt-1 text-sm text-ink-3">
              Up to 4,000 characters. Visible to the patient.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="follow-up-date" className="block text-sm font-semibold text-ink-2">
                Follow-up date
              </label>
              <input
                id="follow-up-date"
                type="date"
                value={form.follow_up_date}
                onChange={(e) => setForm((current) => ({ ...current, follow_up_date: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-base text-ink"
              />
            </div>
            <div>
              <label htmlFor="follow-up-status" className="block text-sm font-semibold text-ink-2">
                Follow-up status
              </label>
              <select
                id="follow-up-status"
                value={form.status}
                onChange={(e) => setForm((current) => ({ ...current, status: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-base text-ink"
              >
                {Object.entries(CARE_PLAN_STATUS_LABELS).map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={state.status === 'saving'} className={primaryBtn}>
              {state.status === 'saving' ? 'Saving' : 'Save follow-up plan'}
            </button>
            {state.status === 'saved' && <p role="status" className="font-semibold text-teal-deep">Plan saved.</p>}
            {error && <p role="alert" className="font-semibold text-berry">{error}</p>}
          </div>
        </form>
      )}
    </Section>
  )
}

function PatientCarePlans() {
  const state = useLoad(getPatientCarePlans)
  return (
    <Section id="care-plans-h" title="Care team follow-ups" text="Notes and follow-up details shared by your doctors.">
      {state.status === 'loading' && <p className="mt-4 text-ink-3">Loading</p>}
      {state.status === 'error' && (
        <p role="alert" className="mt-4 font-semibold text-berry">{state.message}</p>
      )}
      {state.status === 'ok' && !state.data.length && (
        <p className="mt-4 text-ink-3">No follow-up plans have been shared yet.</p>
      )}
      {state.status === 'ok' && state.data.length > 0 && (
        <ul className="mt-4 space-y-4">
          {state.data.map((plan, index) => (
            <li key={`${plan.doctor_name}-${plan.updated_at}-${index}`} className="rounded-xl border border-line bg-white p-5">
              <h3 className="font-semibold">From {plan.doctor_name}</h3>
              <p className="mt-1 text-sm text-ink-3">{CARE_PLAN_STATUS_LABELS[plan.status] || 'Needs review'}</p>
              {plan.follow_up_date && (
                <p className="mt-3">Follow-up date: {new Date(`${plan.follow_up_date}T00:00:00`).toLocaleDateString()}</p>
              )}
              {plan.clinician_note ? (
                <p className="mt-3 whitespace-pre-wrap">{plan.clinician_note}</p>
              ) : (
                <p className="mt-3 text-ink-3">No note provided.</p>
              )}
              {plan.updated_at && <p className="mt-3 text-sm text-ink-3">Updated {fmtDate(plan.updated_at)}</p>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function PatientRoster({ reloadKey, selectedPatientId, onSelect, onChange, onPatientsLoaded }) {
  const [state, setState] = useState({ status: 'loading', data: [] })
  const [revoking, setRevoking] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setState({ status: 'loading', data: [] })
    getDoctorPatients()
      .then((patients) => {
        if (!alive) return
        setState({ status: 'ok', data: patients })
        onPatientsLoaded(new Set(patients.map((patient) => patient.patient_id)))
      })
      .catch((e) => alive && setState({ status: 'error', data: [], message: e.message }))
    return () => {
      alive = false
    }
  }, [reloadKey, onPatientsLoaded])

  const revoke = async (patient) => {
    if (!window.confirm(`Revoke access to ${patient.full_name}'s screenings?`)) return
    setRevoking(patient.patient_id)
    setError('')
    try {
      await revokeDoctorPatientAccess(patient.patient_id)
      onSelect('')
      onChange()
    } catch (e) {
      setError(e.message)
    } finally {
      setRevoking('')
    }
  }

  return (
    <Section
      id="patients-h"
      title="Authorized patients"
      text="Only patients who approved your access request appear here. Access remains active until either of you revokes it."
    >
      {state.status === 'loading' && <p className="mt-4 text-ink-3">Loading</p>}
      {state.status === 'error' && (
        <p role="alert" className="mt-4 font-semibold text-berry">
          {state.message}
        </p>
      )}
      {state.status === 'ok' && !state.data.length && (
        <p className="mt-4 text-ink-3">No patients have shared access yet.</p>
      )}
      {state.status === 'ok' && state.data.length > 0 && (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {state.data.map((patient) => (
            <li key={patient.patient_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <span className="min-w-[10rem] flex-1 font-semibold">{patient.full_name}</span>
              <button
                type="button"
                onClick={() => onSelect(patient.patient_id)}
                aria-pressed={selectedPatientId === patient.patient_id}
                className="font-semibold text-teal-deep underline underline-offset-4 hover:text-ink"
              >
                {selectedPatientId === patient.patient_id ? 'Timeline selected' : 'View timeline'}
              </button>
              <button
                type="button"
                onClick={() => revoke(patient)}
                disabled={Boolean(revoking)}
                className="font-semibold text-berry underline underline-offset-4 hover:text-ink disabled:opacity-60"
              >
                {revoking === patient.patient_id ? 'Revoking' : 'Revoke access'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-3 font-semibold text-berry">
          {error}
        </p>
      )}
    </Section>
  )
}

function Results({ isDoctor, linked, selectedPatientId, onClearPatient, refreshKey }) {
  const state = useLoad(isDoctor ? getDoctorHistory : getHistory, refreshKey)
  const [query, setQuery] = useState('')
  const [dateWindow, setDateWindow] = useState('all')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [sortOrder, setSortOrder] = useState('newest')
  let items = isDoctor
    ? state.data.filter((r) => {
        const matchesName = (r.patient_name || '').toLowerCase().includes(query.trim().toLowerCase())
        return matchesName && (!selectedPatientId || r.patient_id === selectedPatientId)
      })
    : state.data
  if (isDoctor && dateWindow !== 'all') {
    const cutoff = Date.now() - Number(dateWindow) * 24 * 60 * 60 * 1000
    items = items.filter((item) => {
      const created = parseDate(item.created_at)
      return created && created.getTime() >= cutoff
    })
  }
  if (isDoctor && reviewOnly) {
    items = items.filter((item) => reviewIndicators(item).labels.length > 0)
  }
  if (isDoctor) {
    items = [...items].sort((a, b) => {
      const aTime = parseDate(a.created_at)?.getTime() ?? 0
      const bTime = parseDate(b.created_at)?.getTime() ?? 0
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime
    })
  }

  return (
    <Section
      id="results-h"
      title={isDoctor ? (selectedPatientId ? 'Patient screening timeline' : 'Saved results') : 'Your screenings'}
      text={isDoctor ? `Screenings are shown ${sortOrder === 'newest' ? 'newest' : 'oldest'} first.` : 'Every screening you saved, newest first.'}
    >
      {isDoctor && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <TextField
            label="Search by patient name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-sm"
            autoComplete="off"
          />
          {selectedPatientId && (
            <button type="button" onClick={onClearPatient} className="pb-3 font-semibold text-teal-deep underline underline-offset-4 hover:text-ink">
              Show all patients
            </button>
          )}
        </div>
      )}
      {isDoctor && (
        <div className="mt-4 flex flex-wrap gap-4">
          <div>
            <label htmlFor="screening-date-window" className="block text-sm font-semibold text-ink-2">Date range</label>
            <select
              id="screening-date-window"
              value={dateWindow}
              onChange={(e) => setDateWindow(e.target.value)}
              className="mt-1 rounded-lg border border-line bg-paper px-3 py-2.5 text-base text-ink"
            >
              <option value="all">Any time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </select>
          </div>
          <div>
            <label htmlFor="screening-sort" className="block text-sm font-semibold text-ink-2">Sort</label>
            <select
              id="screening-sort"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="mt-1 rounded-lg border border-line bg-paper px-3 py-2.5 text-base text-ink"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-semibold text-ink-2">
            <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} />
            Show items with review indicators
          </label>
        </div>
      )}
      {state.status === 'loading' && <p className="mt-4 text-ink-3">Loading</p>}
      {state.status === 'error' && (
        <p role="alert" className="mt-4 font-semibold text-berry">
          {state.message}
        </p>
      )}
      {state.status === 'ok' && (
        <AnalysisList
          items={items}
          showPatient={isDoctor}
          linked={linked}
          empty={
            isDoctor && (query || selectedPatientId || dateWindow !== 'all' || reviewOnly)
              ? 'No screenings match the selected filters.'
              : isDoctor
                ? 'No screenings have been saved yet.'
                : 'You have not saved a screening yet.'
          }
        />
      )}
      {!isDoctor && state.status === 'ok' && (
        <Link to="/screen" className={`${primaryBtn} mt-6`}>
          Start a screening
        </Link>
      )}
    </Section>
  )
}

function Pdfs({ isDoctor, refreshKey }) {
  const state = useLoad(listReports, refreshKey)
  return (
    <Section id="pdf-h" title="PDF reports" text="Reports you made from a result. Downloading one needs a code that is emailed to your account.">
      {state.status === 'loading' && <p className="mt-4 text-ink-3">Loading</p>}
      {state.status === 'error' && (
        <p role="alert" className="mt-4 font-semibold text-berry">
          {state.message}
        </p>
      )}
      {state.status === 'ok' &&
        (state.data.length === 0 ? (
          <p className="mt-4 text-ink-3">No reports yet. Open a result and choose Create PDF report.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
            {state.data.map((r) => (
              <li key={r.report_id} className="flex flex-wrap items-start gap-x-8 gap-y-2 px-5 py-4">
                <div className="min-w-[12rem] flex-1">
                  {isDoctor && <p className="font-semibold">{r.patient_name}</p>}
                  <p className={isDoctor ? 'text-sm text-ink-3' : 'font-semibold'}>{fmtDate(r.created_at)}</p>
                </div>
                <Link to={`/reports/${r.analysis_id}`} className="font-semibold text-teal-deep underline underline-offset-4 hover:text-ink">
                  View result
                </Link>
                <ReportDownload reportId={r.report_id} />
              </li>
            ))}
          </ul>
        ))}
    </Section>
  )
}

function Dashboard() {
  const { user } = useAuth()
  const isDoctor = user.role === 'doctor'
  const [linked, setLinked] = useState(() => new Set())
  const [reloadRoster, setReloadRoster] = useState(0)
  const [selectedPatientId, setSelectedPatientId] = useState('')

  return (
    <>
      <div className="border-b border-line bg-paper">
        <Container className="py-12 sm:py-14">
          <h1 className="text-4xl font-semibold text-teal">{isDoctor ? 'Patients' : 'My reports'}</h1>
          <p className="mt-2 max-w-[60ch] text-lg text-ink-2">
            {isDoctor
              ? 'Request access to a patient by email, then review screenings shared with you.'
              : 'Review your saved screenings, choose a doctor, and approve or decline access requests.'}
          </p>
        </Container>
      </div>
      <Container className="py-12 pb-24">
        {isDoctor ? (
          <>
            <DashboardSummary refreshKey={reloadRoster} />
            <DoctorRequestAccess onChange={() => setReloadRoster((key) => key + 1)} />
            <AccessRequestInbox
              isDoctor
              reloadKey={reloadRoster}
              onChange={() => setReloadRoster((key) => key + 1)}
            />
            <PatientRoster
              reloadKey={reloadRoster}
              selectedPatientId={selectedPatientId}
              onSelect={setSelectedPatientId}
              onChange={() => setReloadRoster((key) => key + 1)}
              onPatientsLoaded={setLinked}
            />
          </>
        ) : (
          <>
            <PatientDoctorDirectory
              reloadKey={reloadRoster}
              onChange={() => setReloadRoster((key) => key + 1)}
            />
            <AccessRequestInbox
              isDoctor={false}
              reloadKey={reloadRoster}
              onChange={() => setReloadRoster((key) => key + 1)}
            />
            <PatientDoctorAccess
              reloadKey={reloadRoster}
              onChange={() => setReloadRoster((key) => key + 1)}
            />
            <PatientCarePlans />
          </>
        )}
        {isDoctor && <CarePlanEditor patientId={selectedPatientId} />}
        <Results
          isDoctor={isDoctor}
          linked={linked}
          selectedPatientId={selectedPatientId}
          onClearPatient={() => setSelectedPatientId('')}
          refreshKey={reloadRoster}
        />
        <Pdfs isDoctor={isDoctor} refreshKey={reloadRoster} />
      </Container>
    </>
  )
}

export default function Reports() {
  return (
    <AuthGate next="/reports" title="Sign in to see your reports" text="Your saved screenings and reports are kept on your account.">
      <Dashboard />
    </AuthGate>
  )
}
