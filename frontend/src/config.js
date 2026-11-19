// One place to rename things and tune thresholds.

export const APP = {
  name: 'PCOS Screen',
  imaging: { label: 'Ultrasound', model: 'EfficientNetB0 + gated attention' },
  clinical: { label: 'Clinical', model: 'Random Forest' },
  fusion: { label: 'Combined', model: 'Equal-weight average' },
}

// Where the FastAPI backend lives. Set VITE_API_URL in .env.local to change it, for example
//   VITE_API_URL=https://api.example.org
export const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
export const MAX_UPLOAD_MB = 10

// Retained to warn on older saved reports created before incomplete clinical inputs were blocked.
export const MIN_CLINICAL_FIELDS = 8

// How Yes/No answers are sent in the clinical JSON: true/false (default) or the strings "yes"/"no".
// The backend maps true/yes/1 to 1 and false/no to 0. If your ClinicalInput schema declares these
// fields as strings and the server answers 422, change this to 'string'.
export const YES_NO_FORMAT = 'boolean'

// Probability bands used by every readout. `max` is exclusive.
// The backend itself labels a result "PCOS" at 50% or above. The band between 35% and 65% is only a
// display aid: it marks results close to that threshold.
export const BANDS = [
  { key: 'low', max: 0.35, label: 'Low', headline: 'Lower likelihood of PCOS', color: 'var(--color-teal)' },
  { key: 'mid', max: 0.65, label: 'Borderline', headline: 'Close to the decision threshold', color: 'var(--color-ink-3)' },
  { key: 'high', max: 1.0001, label: 'High', headline: 'Higher likelihood of PCOS', color: 'var(--color-berry)' },
]
