// Every call to the FastAPI backend lives here. The pages never call fetch themselves.
//
// Endpoints used (see the Backend Spec):
//   POST /api/auth/register, /verify-registration, /login, /verify-login, /refresh
//   GET  /api/users/me
//   GET  /api/users/available-doctors, /access-requests
//   POST /api/users/patient-access-requests, /doctor-access-requests, /access-requests/{id}/respond
//   POST /api/analysis/run            multipart: clinical_json (text) + ultrasound (optional file)
//   GET  /api/analysis/history, /doctor-history, /{analysis_id}
//   POST /api/reports/{analysis_id}/generate
//   GET  /api/reports
//   POST /api/reports/{report_id}/download/request, /download/verify?otp=...   (PDF)

import { API_URL } from '../config'

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// ---------------------------------------------------------------- tokens

const KEY = 'pcos.session'
let tokens = null
let onExpired = () => {}

try {
  tokens = JSON.parse(localStorage.getItem(KEY) || 'null')
} catch {
  tokens = null
}

export const getTokens = () => tokens

export function setTokens(next) {
  tokens = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage can be blocked (private windows). The session then lasts until the tab closes.
  }
}

export const setExpiredHandler = (fn) => {
  onExpired = fn
}

// ---------------------------------------------------------------- plumbing

// FastAPI sends { detail: "text" } or, for validation errors, { detail: [{ loc, msg }] }.
function readDetail(body, status) {
  const d = body?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) {
    return d
      .map((e) => {
        const field = Array.isArray(e.loc) ? e.loc.filter((x) => x !== 'body').join('.') : ''
        return field ? `${field}: ${e.msg}` : e.msg
      })
      .join('; ')
  }
  if (status === 413) return 'That file is too large.'
  if (status >= 500) return 'The server had a problem. Try again in a moment.'
  return `The server answered ${status}.`
}

async function send(path, { method = 'GET', json, form, query, auth = true, accessToken }) {
  const url = new URL(`${API_URL}${path}`)
  if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v))
  const headers = {}
  let body
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) {
    body = form // the browser sets the multipart boundary itself
  }
  const token = accessToken ?? tokens?.access
  if (auth && token) headers.Authorization = `Bearer ${token}`
  try {
    return await fetch(url, { method, headers, body })
  } catch {
    throw new ApiError(
      `Cannot reach the server at ${API_URL}. Check that the backend is running and that it allows requests from this address (CORS).`,
    )
  }
}

let refreshing = null
function refreshAccess() {
  if (!tokens?.refresh) return Promise.resolve(null)
  refreshing ??= (async () => {
    try {
      const res = await send('/api/auth/refresh', { method: 'POST', json: { refresh_token: tokens.refresh }, auth: false })
      if (!res.ok) return null
      const data = await res.json()
      setTokens({ ...tokens, access: data.access_token })
      return data.access_token
    } catch {
      return null
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

async function request(path, opts = {}) {
  let res = await send(path, opts)
  const wantsAuth = opts.auth !== false
  // FastAPI's bearer scheme answers a missing or malformed header with 403 "Not authenticated".
  // That and a 401 both mean the session needs renewing. Other 403s are real permission errors.
  let needsAuth = res.status === 401
  if (!needsAuth && res.status === 403) {
    const body = await res.clone().json().catch(() => null)
    needsAuth = body?.detail === 'Not authenticated'
  }
  if (wantsAuth && needsAuth) {
    const fresh = await refreshAccess()
    if (fresh) res = await send(path, { ...opts, accessToken: fresh })
    if (!fresh || res.status === 401) {
      setTokens(null)
      onExpired()
      throw new ApiError('Your session has expired. Sign in again.', 401)
    }
  }
  if (!res.ok) {
    let body = null
    try {
      body = await res.json()
    } catch {
      // not JSON
    }
    throw new ApiError(readDetail(body, res.status), res.status)
  }
  return opts.blob ? res.blob() : res.json()
}

// ---------------------------------------------------------------- account

export const register = (data) => request('/api/auth/register', { method: 'POST', json: data, auth: false })
export const verifyRegistration = (user_id, otp) =>
  request('/api/auth/verify-registration', { method: 'POST', json: { user_id, otp }, auth: false })
export const login = (email, password) =>
  request('/api/auth/login', { method: 'POST', json: { email, password }, auth: false })
export const verifyLogin = (user_id, otp) =>
  request('/api/auth/verify-login', { method: 'POST', json: { user_id, otp }, auth: false })
export const getMe = () => request('/api/users/me')

export const getAvailableDoctors = () => request('/api/users/available-doctors')
export const requestDoctorAccess = (doctorId) =>
  request('/api/users/patient-access-requests', { method: 'POST', json: { doctor_id: doctorId } })
export const requestPatientAccess = (patientEmail) =>
  request('/api/users/doctor-access-requests', { method: 'POST', json: { patient_email: patientEmail } })
export const getAccessRequests = () => request('/api/users/access-requests')
export const respondToAccessRequest = (requestId, action) =>
  request(`/api/users/access-requests/${encodeURIComponent(requestId)}/respond`, {
    method: 'POST',
    json: { action },
  })
export const getDoctorPatients = () => request('/api/users/doctor-patients')
export const getDoctorDashboardSummary = () => request('/api/users/doctor-dashboard-summary')
export const getPatientAuthorizedDoctors = () => request('/api/users/patient-authorized-doctors')
export const revokePatientDoctorAccess = (doctorId) =>
  request(`/api/users/patient-authorized-doctors/${encodeURIComponent(doctorId)}`, { method: 'DELETE' })
export const revokeDoctorPatientAccess = (patientId) =>
  request(`/api/users/doctor-patients/${encodeURIComponent(patientId)}`, { method: 'DELETE' })
export const getDoctorCarePlan = (patientId) =>
  request(`/api/users/doctor-patients/${encodeURIComponent(patientId)}/care-plan`)
export const saveDoctorCarePlan = (patientId, data) =>
  request(`/api/users/doctor-patients/${encodeURIComponent(patientId)}/care-plan`, { method: 'PUT', json: data })
export const getPatientCarePlans = () => request('/api/users/patient-care-plans')

// ---------------------------------------------------------------- analysis

// `clinical` is the payload object from buildPayload(); `image` is an optional File.
export function runAnalysis({ clinical, image }) {
  const form = new FormData()
  form.append('clinical_json', JSON.stringify(clinical ?? {}))
  if (image) form.append('ultrasound', image, image.name)
  return request('/api/analysis/run', { method: 'POST', form })
}

export const getHistory = () => request('/api/analysis/history')
export const getDoctorHistory = () => request('/api/analysis/doctor-history')
export const getAnalysis = (id) => request(`/api/analysis/${encodeURIComponent(id)}`)

// ---------------------------------------------------------------- reports

export const generateReport = (analysisId) =>
  request(`/api/reports/${encodeURIComponent(analysisId)}/generate`, { method: 'POST' })
export const listReports = () => request('/api/reports')
export const requestDownload = (reportId) =>
  request(`/api/reports/${encodeURIComponent(reportId)}/download/request`, { method: 'POST' })
export const verifyDownload = (reportId, otp) =>
  request(`/api/reports/${encodeURIComponent(reportId)}/download/verify`, {
    method: 'POST',
    query: { otp },
    blob: true,
  })

// ---------------------------------------------------------------- assistant / llm

export const getAssistantStatus = () => request('/api/assistant/status')
export const askAssistant = ({ message, history = [], analysisId = null }) =>
  request('/api/assistant/chat', {
    method: 'POST',
    json: { message, history, analysis_id: analysisId },
  })
export const getAnalysisInsights = (analysisId) =>
  request(`/api/assistant/insights/${encodeURIComponent(analysisId)}`, { method: 'POST' })
