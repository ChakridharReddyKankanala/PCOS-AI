import { MIN_CLINICAL_FIELDS } from '../config'
import { countEntered, FEATURES } from './features'
import { bandOf } from './format'
import { toReport } from './results'

export function reviewIndicators(raw) {
  const report = toReport(raw)
  const probability = report.combined.probability
  const band = probability == null ? null : bandOf(probability)
  const entered = raw.clinical_input ? countEntered(raw.clinical_input) : null
  const labels = [
    probability == null && 'Combined estimate unavailable',
    !report.clinical.usable && 'Clinical estimate unavailable',
    !report.ultrasound.usable && 'Ultrasound estimate unavailable',
    entered != null && entered < MIN_CLINICAL_FIELDS && `Limited clinical inputs (${entered}/${FEATURES.length})`,
    entered != null && entered >= MIN_CLINICAL_FIELDS && entered < FEATURES.length && `Some clinical inputs missing (${entered}/${FEATURES.length})`,
    probability != null && band.key === 'mid' && 'Near model display threshold',
  ].filter(Boolean)

  return { labels, entered, nearThreshold: probability != null && band.key === 'mid' }
}
