export default function RunBar({ hint, note, canRun, running, error, onRun, onClear }) {
  return (
    <div className="mt-14 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p id="run-hint" aria-live="polite" className="text-ink-2">
          {hint}
        </p>
        {note && <p className="mt-1 text-sm text-ink-3">{note}</p>}
        {error && (
          <p role="alert" className="mt-1 font-semibold text-berry">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg px-4 py-3 font-semibold text-ink-2 transition-colors hover:text-ink"
        >
          Clear all
        </button>
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun}
          aria-describedby="run-hint"
          className="rounded-lg bg-teal px-8 py-3 text-lg font-semibold text-white shadow-lg shadow-teal/25 transition-colors hover:bg-teal-deep disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-3 disabled:shadow-none"
        >
          {running ? 'Analyzing' : 'Run analysis'}
        </button>
      </div>
    </div>
  )
}
