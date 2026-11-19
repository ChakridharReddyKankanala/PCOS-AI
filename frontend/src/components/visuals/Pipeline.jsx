import { APP } from '../../config'

function Down() {
  return (
    <svg viewBox="0 0 16 28" className="mx-auto my-1 h-7 w-4 text-ink-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v22M2 18l6 7 6-7" />
    </svg>
  )
}

function Node({ title, sub, tone = 'plain' }) {
  const tones = {
    plain: 'border-line bg-paper text-ink',
    model: 'border-teal-deep bg-teal-deep text-paper',
  }
  return (
    <div className={`rounded-xl border px-5 py-4 text-center ${tones[tone]}`}>
      <p className="font-display text-lg font-semibold leading-snug">{title}</p>
      <p className={`mt-0.5 text-sm ${tone === 'model' ? 'text-teal-tint' : 'text-ink-2'}`}>{sub}</p>
    </div>
  )
}

function Lane({ input, model, output }) {
  return (
    <div className="mx-auto w-full max-w-xs">
      <Node {...input} />
      <Down />
      <Node {...model} tone="model" />
      <Down />
      <Node {...output} />
    </div>
  )
}

// The independent model paths join only at the probability average.
export default function Pipeline() {
  return (
    <div>
      <div className="grid gap-10 md:grid-cols-2 md:gap-x-0 md:px-8">
        <Lane
          input={{ title: 'Ultrasound image', sub: 'JPG, PNG or WebP' }}
          model={{ title: APP.imaging.model, sub: 'Gated-attention classifier' }}
          output={{ title: 'Probability', sub: 'of PCOS' }}
        />
        <Lane
          input={{ title: 'Clinical markers', sub: 'Hormones, follicle counts, symptoms' }}
          model={{ title: APP.clinical.model, sub: 'Tabular classifier' }}
          output={{ title: 'Probability', sub: 'and top features' }}
        />
      </div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="hidden h-10 w-full text-ink-3 md:block" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M25 0V20H50M75 0V20H50M50 20V40" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="md:hidden"><Down /></div>
      <div className="mx-auto w-full max-w-sm">
        <Node title={APP.fusion.model} sub="Each available model counts equally" tone="model" />
        <Down />
        <Node title="Estimate" sub="Low, indeterminate or high" />
      </div>
    </div>
  )
}
