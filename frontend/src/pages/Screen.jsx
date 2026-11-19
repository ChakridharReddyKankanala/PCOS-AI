import { useEffect, useMemo, useRef, useState } from 'react'
import AuthGate from '../components/AuthGate'
import ClinicalForm from '../components/ClinicalForm'
import Container from '../components/Container'
import PageHero from '../components/PageHero'
import ReportActions from '../components/ReportActions'
import ReportView from '../components/ReportView'
import RunBar from '../components/RunBar'
import { APP, IMAGE_EXTENSIONS, MAX_UPLOAD_MB } from '../config'
import { runAnalysis } from '../lib/api'
import { buildPayload, countProvided, emptyClinical, FEATURES, parseClinical } from '../lib/features'
import { toReport } from '../lib/results'

function ScreenTool() {
  const [image, setImage] = useState(null)
  const [imageUrl, setImageUrl] = useState(null)
  const [imageError, setImageError] = useState('')
  const [clinical, setClinical] = useState(emptyClinical)
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [result, setResult] = useState(null) // { report, entered }
  const [stale, setStale] = useState(false)
  const [error, setError] = useState('')
  const resultsRef = useRef(null)

  const provided = useMemo(() => countProvided(clinical), [clinical])
  const hasErrors = useMemo(() => Object.keys(parseClinical(clinical).errors).length > 0, [clinical])
  const running = status === 'running'
  const canRun = (Boolean(image) || provided > 0) && !hasErrors && !imageError && !running

  useEffect(() => {
    if (!image) {
      setImageUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(image)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  const inputsChanged = () => {
    if (result) setStale(true)
  }

  const changeField = (key, value) => {
    setClinical((c) => ({ ...c, [key]: value }))
    inputsChanged()
  }

  const changeImage = (file) => {
    if (!file) return
    const extension = `.${file.name.split('.').pop().toLowerCase()}`
    if (!IMAGE_EXTENSIONS.includes(extension)) {
      setImageError('Choose a JPG, PNG or WebP image.')
      return
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setImageError(`Choose an image smaller than ${MAX_UPLOAD_MB} MB.`)
      return
    }
    setImageError('')
    setImage(file)
    inputsChanged()
  }

  const clearAll = () => {
    setImage(null)
    setImageError('')
    setClinical(emptyClinical())
    setResult(null)
    setStale(false)
    setError('')
    setStatus('idle')
  }

  const run = async () => {
    setStatus('running')
    setError('')
    setStale(false)
    try {
      const raw = await runAnalysis({ clinical: buildPayload(clinical), image })
      setResult({ report: toReport(raw), entered: provided })
      setStatus('done')
      requestAnimationFrame(() => {
        const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        resultsRef.current?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
      })
    } catch (e) {
      setError(e?.message || 'The analysis failed. Try again.')
      setStatus('error')
    }
  }

  const hint = running
    ? 'Analyzing. This takes a moment.'
    : hasErrors
      ? 'Fix the highlighted values to continue.'
        : imageError
          ? imageError
      : image || provided > 0
        ? `Ready with ${[image && 'an ultrasound image', provided > 0 && `${provided} clinical value${provided === 1 ? '' : 's'}`].filter(Boolean).join(' and ')}.`
        : 'Add an ultrasound image or enter at least one clinical value.'
  const note =
    !running && !hasErrors && (image || provided > 0) && provided < FEATURES.length
      ? `Clinical estimate unavailable until all ${FEATURES.length} clinical values are entered.`
      : ''

  return (
    <Container className="pb-24 pt-14">
      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
        <section aria-labelledby="scan-h" className="lg:sticky lg:top-6 lg:self-start">
          <h2 id="scan-h" className="text-2xl font-semibold">Ultrasound image</h2>
          <p className="mt-1 max-w-[56ch] text-ink-2">{APP.imaging.model} analyzes the scan. You can also run with clinical values only.</p>
          {imageUrl ? (
            <img src={imageUrl} alt="Selected ultrasound scan" className="mt-5 max-h-96 w-full rounded-lg bg-sono object-contain" />
          ) : (
            <label className="mt-5 grid aspect-[4/3] cursor-pointer place-items-center rounded-lg border border-dashed border-line bg-paper px-6 text-center hover:border-teal">
              <span>
                <span className="block font-semibold">Choose an ultrasound image</span>
                <span className="mt-1 block text-sm text-ink-3">JPG, PNG or WebP, up to {MAX_UPLOAD_MB} MB</span>
              </span>
              <input type="file" accept={IMAGE_EXTENSIONS.join(',')} className="sr-only" onChange={(event) => { changeImage(event.target.files?.[0]); event.target.value = '' }} />
            </label>
          )}
          {image && (
            <div className="mt-3 flex items-center justify-between gap-4 text-sm">
              <span className="truncate text-ink-2">{image.name}</span>
              <button type="button" onClick={() => { setImage(null); setImageError(''); inputsChanged() }} className="shrink-0 font-semibold text-teal-deep underline underline-offset-4">Remove image</button>
            </div>
          )}
          {imageError && <p role="alert" className="mt-2 text-sm font-semibold text-berry">{imageError}</p>}
          {image && (
            <label className="mt-3 inline-block cursor-pointer text-sm font-semibold text-teal-deep underline underline-offset-4">
              Replace image
              <input type="file" accept={IMAGE_EXTENSIONS.join(',')} className="sr-only" onChange={(event) => { changeImage(event.target.files?.[0]); event.target.value = '' }} />
            </label>
          )}
        </section>
        <ClinicalForm values={clinical} onChange={changeField} provided={provided} />
      </div>

      <RunBar hint={hint} note={note} canRun={canRun} running={running} error={error} onRun={run} onClear={clearAll} />

      {result && (
        <div className="mt-16 border-t border-line pt-10">
          <ReportView report={result.report} entered={result.entered} imageUrl={imageUrl} stale={stale} resultsRef={resultsRef}>
            {result.report.id && <ReportActions analysisId={result.report.id} />}
          </ReportView>
        </div>
      )}
    </Container>
  )
}

export default function Screen() {
  return (
    <>
      <PageHero page="screen" size="medium" tag="Ultrasound • Clinical values" title="Run a PCOS screening">
        Add an ultrasound image, clinical values, or both. The available model results are combined into a research estimate.
      </PageHero>
      <AuthGate
        next="/screen"
        title="Sign in to run a screening"
        text="Screenings are saved to your account so you can find them again and make a PDF report. Creating an account takes a minute."
      >
        <ScreenTool />
      </AuthGate>
    </>
  )
}
