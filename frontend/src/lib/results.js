// Turns the backend's analysis JSON into one shape the screens can rely on.
//
// Backend fields:
//   clinical, ultrasound   { prediction, probability, model_version, error? }
//   combined               { prediction, probability, confidence_score, method, model_version }
//   explainability         { clinical: { method, status, feature_importance: [{ feature, importance, value }] }, ... }
//
// A model result counts as usable only when it has a probability and a real PCOS/Normal label.
// Fallback labels such as UNAVAILABLE, NOT_AVAILABLE, NOT_PROVIDED and ERROR are shown as notes.

import { featureForColumn } from './features'

const LABELS = new Set(['PCOS', 'Normal'])

function modality(m) {
  if (!m) return { usable: false, probability: null, label: 'NOT_AVAILABLE', note: 'Not available' }
  const p = typeof m.probability === 'number' ? m.probability : null
  const usable = p !== null && LABELS.has(m.prediction)
  let note = ''
  if (!usable) {
    if (m.message) note = m.message
    else if (m.prediction === 'NOT_AVAILABLE' || m.prediction === 'NOT_PROVIDED') note = 'Not available'
    else if (m.prediction === 'ERROR') note = m.error ? `The model failed: ${m.error}` : 'The model failed on this input.'
    else note = 'The model was not available.'
  }
  return { usable, probability: p, label: m.prediction, version: m.model_version, note }
}

function readImportance(clinicalExplain) {
  const list = clinicalExplain?.top_features ?? clinicalExplain?.feature_importance
  if (!Array.isArray(list)) return []
  return list
    .filter((r) => r && (typeof r.shap === 'number' || typeof r.importance === 'number'))
    .map((r) => ({
      feature: featureForColumn(r.feature) ?? null,
      name: r.feature,
      importance: typeof r.shap === 'number' ? Math.abs(r.shap) : r.importance,
      shap: typeof r.shap === 'number' ? r.shap : undefined,
      direction: r.direction,
      value: r.value,
    }))
}

// build_explanation() adds some summary text. Its key names are not documented, so any plain string
// directly under `explainability` is shown as a paragraph.
function readSummary(explain) {
  if (!explain || typeof explain !== 'object') return []
  return Object.entries(explain)
    .filter(([k, v]) => k !== 'clinical' && k !== 'ultrasound' && typeof v === 'string' && v.trim())
    .map(([, v]) => v.trim())
}

export function toReport(raw) {
  const explain = raw.explainability ?? {}
  const c = raw.combined ?? {}
  return {
    id: raw.analysis_id,
    createdAt: raw.created_at,
    patientId: raw.patient_id,
    patientName: raw.patient_name,
    clinicalInput: raw.clinical_input ?? null,
    clinical: modality(raw.clinical ?? raw.clinical_report),
    ultrasound: modality(raw.ultrasound ?? raw.ultrasound_report),
    combined: {
      probability: typeof c.probability === 'number' ? c.probability : null,
      label: c.prediction,
      confidence: typeof c.confidence_score === 'number' ? c.confidence_score : null,
      method: c.method ?? 'insufficient_data',
      version: c.model_version,
    },
    importance: readImportance(explain.clinical),
    importanceStatus: explain.clinical?.status,
    importanceMethod: explain.clinical?.method,
    heatmapUrl: explain.ultrasound?.heatmap_overlay_png_base64
      ? `data:image/png;base64,${explain.ultrasound.heatmap_overlay_png_base64}`
      : null,
    summary: readSummary(explain),
    aiInsights: raw.ai_insights ?? null,
    hasExplanation: Boolean(raw.explainability),
  }
}

export const METHOD_TEXT = {
  dual_modal_weighted_average: 'Equal-weight average of the clinical and ultrasound probabilities.',
  clinical_only: 'Based on the clinical values provided.',
  ultrasound_only: 'Based on the ultrasound image.',
  legacy: 'Saved result from an earlier analysis version.',
  insufficient_data: 'There was not enough data to produce a combined result.',
}
