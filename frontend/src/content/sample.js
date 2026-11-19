// Fixed example output used to illustrate the results on the Home and How it works pages.
// It is not produced by a model.

export const SAMPLE_ROWS = [
  { id: 'img', label: 'Ultrasound', sub: 'EfficientNetB0 + attention', p: 0.68 },
  { id: 'clin', label: 'Clinical', sub: 'Random Forest', p: 0.78 },
  { id: 'fused', label: 'Combined', sub: 'Equal-weight average', p: 0.73, strong: true },
]

export const SAMPLE_IMPORTANCE = [
  { key: 'foll', label: 'Follicle count, right', shown: '16', importance: 0.152 },
  { key: 'follL', label: 'Follicle count, left', shown: '14', importance: 0.131 },
  { key: 'amh', label: 'AMH', shown: '8.9 ng/mL', importance: 0.084 },
  { key: 'cycle', label: 'Cycle pattern', shown: 'Irregular', importance: 0.071 },
  { key: 'lh', label: 'LH', shown: '11.8 mIU/mL', importance: 0.046 },
]
