import { useState } from 'react'

export default function AiInsightsCard({ insights, onOpenChat, analysisId }) {
  const [activeTab, setActiveTab] = useState('summary')

  if (!insights) return null

  const {
    headline = 'AI Clinical Summary & Guidance',
    summary = '',
    key_drivers = [],
    lifestyle_guidance = [],
    questions_for_doctor = [],
    medical_disclaimer = '',
  } = insights

  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-teal-mid/50 bg-gradient-to-b from-paper to-white shadow-sm">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-teal-tint/40 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal text-white shadow-sm" aria-hidden="true">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
            </svg>
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-teal-deep">Gemini AI Clinical Interpretation</span>
              <span className="rounded-full bg-teal/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-teal-deep">
                XAI Synthesis
              </span>
            </div>
            <p className="text-xs text-ink-3">Powered by multimodal explainable reproductive endocrinology</p>
          </div>
        </div>

        {onOpenChat && (
          <button
            type="button"
            onClick={() => onOpenChat(analysisId)}
            className="inline-flex items-center gap-2 rounded-xl bg-teal px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-deep"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
            Ask Copilot About This
          </button>
        )}
      </div>

      {/* Main Body */}
      <div className="p-6">
        <h3 className="text-xl font-bold text-ink">{headline}</h3>
        <p className="mt-2.5 text-base leading-relaxed text-ink-2">{summary}</p>

        {/* Tab Selection */}
        <div className="mt-6 flex border-b border-line text-sm font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`pb-3 pr-4 transition ${
              activeTab === 'summary'
                ? 'border-b-2 border-teal font-semibold text-teal-deep'
                : 'text-ink-3 hover:text-ink'
            }`}
          >
            Key Drivers ({key_drivers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lifestyle')}
            className={`px-4 pb-3 transition ${
              activeTab === 'lifestyle'
                ? 'border-b-2 border-teal font-semibold text-teal-deep'
                : 'text-ink-3 hover:text-ink'
            }`}
          >
            Lifestyle & Nutrition ({lifestyle_guidance.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`px-4 pb-3 transition ${
              activeTab === 'questions'
                ? 'border-b-2 border-teal font-semibold text-teal-deep'
                : 'text-ink-3 hover:text-ink'
            }`}
          >
            Questions for Doctor ({questions_for_doctor.length})
          </button>
        </div>

        {/* Tab 1: Key Drivers */}
        {activeTab === 'summary' && (
          <div className="mt-5 space-y-3">
            {key_drivers.map((driver, idx) => (
              <div
                key={idx}
                className="flex flex-col rounded-xl border border-line bg-paper/60 p-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <span className="font-semibold text-ink">{driver.feature}</span>
                  <p className="text-sm text-ink-2">{driver.details}</p>
                </div>
                <span className="mt-1.5 inline-block text-xs font-medium text-teal-deep sm:mt-0 sm:text-right">
                  {driver.impact}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: Lifestyle Guidance */}
        {activeTab === 'lifestyle' && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lifestyle_guidance.map((item, idx) => (
              <div key={idx} className="rounded-xl border border-line bg-paper/60 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-deep">{item.category}</span>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.recommendation}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Questions for Doctor */}
        {activeTab === 'questions' && (
          <div className="mt-5 space-y-2.5">
            <p className="text-xs font-semibold text-ink-3">
              Take these discussion prompts to your next consultation:
            </p>
            {questions_for_doctor.map((q, idx) => (
              <div key={idx} className="flex items-start gap-3 rounded-xl border border-line bg-paper/50 p-3 text-sm text-ink-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-tint font-bold text-xs text-teal-deep">
                  {idx + 1}
                </span>
                <p className="leading-snug">{q}</p>
              </div>
            ))}
          </div>
        )}

        {/* Medical Advisory Box */}
        {medical_disclaimer && (
          <div className="mt-6 rounded-xl border border-line bg-amber-50/50 p-3 text-xs leading-relaxed text-ink-3">
            <span className="font-semibold text-ink-2">Clinical Notice: </span>
            {medical_disclaimer}
          </div>
        )}
      </div>
    </div>
  )
}
