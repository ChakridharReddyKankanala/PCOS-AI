// The clinical inputs, taken from the backend's feature table (Backend Spec, section 3).
// `key` is the field name the API accepts, `column` is the name of the matching model column.
// The form, the validation, the request payload and the result tables all read this one list.
//
// min/max are sanity limits for typing mistakes. The backend itself checks no ranges, so these only
// stop obvious slips such as a height of 16 cm. Widen them if your data needs it.
//
// BMI, FSH/LH and waist:hip ratio are not asked for. The server works them out from the values
// above (weight and height, FSH and LH, waist and hip), so they are listed separately in COMPUTED.

import { YES_NO_FORMAT } from '../config'

export const GROUPS = [
  { id: 'body', title: 'Body and vitals', note: 'Measurements from a routine check.' },
  { id: 'cycle', title: 'Cycle and history', note: 'Periods, pregnancy and related history.' },
  { id: 'labs', title: 'Hormones and blood tests', note: 'Lab results, if you have them.' },
  { id: 'signs', title: 'Symptoms and lifestyle', note: 'Yes or no. Leave unanswered if unknown.' },
  { id: 'us', title: 'Follicles and endometrium', note: 'Measurements from the ultrasound report, if you have them.' },
]

// Blood group codes follow the public Kaggle PCOS dataset. Confirm them against your training data.
export const BLOOD_GROUPS = [
  { value: '11', label: 'A+' },
  { value: '12', label: 'A−' },
  { value: '13', label: 'B+' },
  { value: '14', label: 'B−' },
  { value: '15', label: 'O+' },
  { value: '16', label: 'O−' },
  { value: '17', label: 'AB+' },
  { value: '18', label: 'AB−' },
]

const num = (key, column, group, label, unit, min, max, step, extra = {}) => ({
  key, column, group, kind: 'number', label, unit, min, max, step, ...extra,
})
const yn = (key, column, label, extra = {}) => ({ key, column, group: 'signs', kind: 'yesno', label, ...extra })

export const FEATURES = [
  num('age', 'Age (yrs)', 'body', 'Age', 'years', 10, 70, 1),
  num('weight', 'Weight (Kg)', 'body', 'Weight', 'kg', 25, 200, 0.1),
  num('height', 'Height(Cm)', 'body', 'Height', 'cm', 120, 210, 0.1),
  { key: 'blood_group', column: 'Blood Group', group: 'body', kind: 'select', label: 'Blood group', options: BLOOD_GROUPS },
  num('pulse_rate', 'Pulse rate(bpm)', 'body', 'Pulse rate', 'bpm', 40, 200, 1),
  num('respiratory_rate', 'RR (breaths/min)', 'body', 'Respiratory rate', 'per min', 8, 40, 1),
  num('hb', 'Hb(g/dl)', 'body', 'Haemoglobin', 'g/dL', 4, 20, 0.1),
  num('bp_systolic', 'BP _Systolic (mmHg)', 'body', 'Blood pressure, systolic', 'mmHg', 70, 220, 1),
  num('bp_diastolic', 'BP _Diastolic (mmHg)', 'body', 'Blood pressure, diastolic', 'mmHg', 40, 140, 1),
  num('waist', 'Waist(inch)', 'body', 'Waist', 'inch', 18, 70, 0.1),
  num('hip', 'Hip(inch)', 'body', 'Hip', 'inch', 20, 70, 0.1),

  {
    key: 'cycle', column: 'Cycle(R/I)', group: 'cycle', kind: 'choice', label: 'Cycle pattern',
    options: [
      { value: 'regular', label: 'Regular' },
      { value: 'irregular', label: 'Irregular' },
    ],
  },
  num('cycle_length', 'Cycle length(days)', 'cycle', 'Cycle length', 'days', 1, 60, 1, {
    hint: 'The training data mostly holds values of about 2 to 12, so this is probably the days of bleeding, not the gap between periods.',
  }),
  num('marriage_status_years', 'Marraige Status (Yrs)', 'cycle', 'Years married', 'years', 0, 50, 1),
  { key: 'pregnant', column: 'Pregnant(Y/N)', group: 'cycle', kind: 'yesno', label: 'Currently pregnant' },
  num('abortions', 'No. of abortions', 'cycle', 'Number of abortions', 'count', 0, 10, 1),

  num('fsh', 'FSH(mIU/mL)', 'labs', 'FSH', 'mIU/mL', 0, 200, 0.1),
  num('lh', 'LH(mIU/mL)', 'labs', 'LH', 'mIU/mL', 0, 200, 0.1),
  num('amh', 'AMH(ng/mL)', 'labs', 'AMH', 'ng/mL', 0, 100, 0.01),
  num('tsh', 'TSH (mIU/L)', 'labs', 'TSH', 'mIU/L', 0, 100, 0.01),
  num('prolactin', 'PRL(ng/mL)', 'labs', 'Prolactin', 'ng/mL', 0, 500, 0.1),
  num('vitamin_d3', 'Vit D3 (ng/mL)', 'labs', 'Vitamin D3', 'ng/mL', 0, 200, 0.1),
  num('progesterone', 'PRG(ng/mL)', 'labs', 'Progesterone', 'ng/mL', 0, 100, 0.01),
  num('rbs', 'RBS(mg/dl)', 'labs', 'Random blood sugar', 'mg/dL', 20, 600, 1),
  num('beta_hcg_1', 'I   beta-HCG(mIU/mL)', 'labs', 'β-hCG, first test', 'mIU/mL', 0, 500000, 0.01),
  num('beta_hcg_2', 'II    beta-HCG(mIU/mL)', 'labs', 'β-hCG, second test', 'mIU/mL', 0, 500000, 0.01),

  yn('weight_gain', 'Weight gain(Y/N)', 'Recent weight gain'),
  yn('hair_growth', 'hair growth(Y/N)', 'Excess hair growth', { aliases: ['excessiveHair'] }),
  yn('skin_darkening', 'Skin darkening (Y/N)', 'Skin darkening'),
  yn('hair_loss', 'Hair loss(Y/N)', 'Hair loss', { aliases: ['hairLoss'] }),
  yn('pimples', 'Pimples(Y/N)', 'Pimples or acne', { aliases: ['acne'] }),
  yn('fast_food', 'Fast food (Y/N)', 'Eats fast food regularly'),
  yn('regular_exercise', 'Reg.Exercise(Y/N)', 'Exercises regularly'),

  num('follicle_no_left', 'Follicle No. (L)', 'us', 'Follicle count, left ovary', 'count', 0, 40, 1),
  num('follicle_no_right', 'Follicle No. (R)', 'us', 'Follicle count, right ovary', 'count', 0, 40, 1),
  num('average_follicle_size_left', 'Avg. F size (L) (mm)', 'us', 'Average follicle size, left', 'mm', 0, 40, 0.1),
  num('average_follicle_size_right', 'Avg. F size (R) (mm)', 'us', 'Average follicle size, right', 'mm', 0, 40, 0.1),
  num('endometrium', 'Endometrium (mm)', 'us', 'Endometrium thickness', 'mm', 0, 30, 0.1),
]

// Worked out by the server when you do not send them.
export const COMPUTED = [
  { key: 'bmi', column: 'BMI', label: 'BMI', unit: 'kg/m²', from: 'weight and height', compute: (v) => v.weight && v.height ? v.weight / (v.height / 100) ** 2 : null },
  { key: 'fsh_lh', column: 'FSH/LH', label: 'FSH/LH', unit: '', from: 'FSH and LH', compute: (v) => v.fsh != null && v.lh > 0 ? v.fsh / v.lh : null },
  { key: 'waist_hip_ratio', column: 'Waist:Hip Ratio', label: 'Waist:hip ratio', unit: '', from: 'waist and hip', compute: (v) => v.waist && v.hip ? v.waist / v.hip : null },
]

export const ALL_FEATURES = [...FEATURES, ...COMPUTED]

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim()
const byColumn = new Map(ALL_FEATURES.map((f) => [norm(f.column), f]))
export const featureForColumn = (column) => byColumn.get(norm(column))

export const emptyClinical = () => Object.fromEntries(FEATURES.map((f) => [f.key, '']))

// Turns the raw form strings into clean values plus per-field errors.
export function parseClinical(values) {
  const valid = {}
  const errors = {}
  for (const f of FEATURES) {
    const raw = values[f.key]
    if (raw === '' || raw === undefined || raw === null) continue
    if (f.kind === 'number') {
      const n = Number(raw)
      if (!Number.isFinite(n) || n < f.min || n > f.max) errors[f.key] = `Enter a value from ${f.min} to ${f.max}.`
      else valid[f.key] = n
    } else if (f.kind === 'select') {
      valid[f.key] = Number(raw)
    } else {
      valid[f.key] = raw
    }
  }
  return { valid, errors }
}

export const countProvided = (values) => Object.keys(parseClinical(values).valid).length

// The object sent as `clinical_json`. The API does not estimate clinically until all form fields are present.
export function buildPayload(values) {
  const { valid } = parseClinical(values)
  const out = {}
  for (const f of FEATURES) {
    if (!(f.key in valid)) continue
    const v = valid[f.key]
    if (f.kind === 'yesno') out[f.key] = YES_NO_FORMAT === 'string' ? v : v === 'yes'
    else out[f.key] = v
  }
  return out
}

// Values the server computed or defaulted can be told apart from entered ones by looking at what
// was saved with the analysis (`clinical_input`, with null for anything not sent).
const sent = (input, f) => [f.key, ...(f.aliases ?? [])].some((k) => input?.[k] != null && input[k] !== '')

export function wasEntered(f, input) {
  if (f.key === 'cycle') return ['cycle', 'irregular_cycles', 'irregularPeriods'].some((k) => input?.[k] != null)
  if (f.key === 'marriage_status_years') return sent(input, f) || input?.maritalStatus != null
  if (f.key === 'bmi') return sent(input, f) || Boolean(input?.weight && input?.height)
  if (f.key === 'fsh_lh') return sent(input, f) || (input?.fsh != null && input?.lh > 0)
  if (f.key === 'waist_hip_ratio') return sent(input, f) || Boolean(input?.waist && input?.hip)
  return sent(input, f)
}

export const countEntered = (input) => (input ? FEATURES.filter((f) => wasEntered(f, input)).length : 0)

const trim = (n) => String(Math.round(n * 100) / 100)

// Turns the value the model actually saw into something readable.
export function describeModelValue(f, v) {
  if (v == null) return ''
  if (f.key === 'cycle') return v >= 3 ? 'Irregular' : 'Regular'
  if (f.kind === 'yesno') return v >= 0.5 ? 'Yes' : 'No'
  if (f.kind === 'select') return BLOOD_GROUPS.find((b) => Number(b.value) === Number(v))?.label ?? trim(v)
  return f.unit && f.unit !== 'count' ? `${trim(v)} ${f.unit}` : trim(v)
}

// Made-up values for trying the form. They are not patient data and say nothing about the model.
export const TEST_VALUES = {
  typical: {
    age: '29', weight: '56', height: '163', pulse_rate: '74', respiratory_rate: '18', hb: '12.4',
    bp_systolic: '112', bp_diastolic: '74', waist: '28', hip: '36',
    cycle: 'regular', cycle_length: '5', marriage_status_years: '3', pregnant: 'no', abortions: '0',
    fsh: '6.4', lh: '4.6', amh: '2.9', tsh: '2.1', prolactin: '14', vitamin_d3: '28', progesterone: '0.6', rbs: '90',
    beta_hcg_1: '1.99', beta_hcg_2: '1.99',
    weight_gain: 'no', hair_growth: 'no', skin_darkening: 'no', hair_loss: 'no', pimples: 'no', fast_food: 'no', regular_exercise: 'yes',
    follicle_no_left: '5', follicle_no_right: '6', average_follicle_size_left: '15', average_follicle_size_right: '14', endometrium: '8',
  },
  pcos: {
    age: '25', weight: '68', height: '160', pulse_rate: '80', respiratory_rate: '18', hb: '11.8',
    bp_systolic: '120', bp_diastolic: '80', waist: '33', hip: '38',
    cycle: 'irregular', cycle_length: '5', marriage_status_years: '2', pregnant: 'no', abortions: '0',
    fsh: '5.2', lh: '11.8', amh: '8.9', tsh: '3.2', prolactin: '22', vitamin_d3: '17', progesterone: '0.4', rbs: '98',
    beta_hcg_1: '1.99', beta_hcg_2: '1.99',
    weight_gain: 'yes', hair_growth: 'yes', skin_darkening: 'yes', hair_loss: 'yes', pimples: 'yes', fast_food: 'yes', regular_exercise: 'no',
    follicle_no_left: '14', follicle_no_right: '16', average_follicle_size_left: '9', average_follicle_size_right: '8', endometrium: '7.5',
  },
}
