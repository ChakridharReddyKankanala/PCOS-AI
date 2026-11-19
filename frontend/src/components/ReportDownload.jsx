import { useState } from 'react'
import { requestDownload, verifyDownload } from '../lib/api'
import OtpField from './OtpField'

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// Downloading a PDF takes two steps on the server: ask for a code (it is emailed to the signed-in
// account), then send the code back to receive the file.
export default function ReportDownload({ reportId, className = '' }) {
  const [step, setStep] = useState('idle') // idle | sending | code | checking | done
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')

  const ask = async () => {
    setError('')
    setStep('sending')
    try {
      await requestDownload(reportId)
      setOtp('')
      setStep('code')
    } catch (e) {
      setError(e.message)
      setStep('idle')
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (otp.length < 6) return setError('Enter the 6-character code.')
    setError('')
    setStep('checking')
    try {
      const blob = await verifyDownload(reportId, otp)
      saveBlob(blob, `PCOS-XAI-${reportId}.pdf`)
      setStep('done')
    } catch (err) {
      setError(err.message)
      setStep('code')
    }
  }

  const link = 'font-semibold text-teal-deep underline underline-offset-4 hover:text-ink'

  return (
    <div className={className}>
      {(step === 'idle' || step === 'sending' || step === 'done') && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" onClick={ask} disabled={step === 'sending'} className={`${link} disabled:opacity-60`}>
            {step === 'sending' ? 'Sending code' : step === 'done' ? 'Download again' : 'Download PDF'}
          </button>
          {step === 'done' && <span className="text-sm text-ink-3">Saved to your downloads.</span>}
        </div>
      )}

      {(step === 'code' || step === 'checking') && (
        <form onSubmit={submit} className="mt-2 max-w-sm rounded-xl border border-line bg-paper p-4">
          <p className="text-sm text-ink-2">We emailed a code to your account address. Enter it to download the report.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <OtpField value={otp} onChange={setOtp} label="Code" autoFocus />
            <button
              type="submit"
              disabled={step === 'checking'}
              className="rounded-lg bg-teal px-5 py-3 font-semibold text-white transition-colors hover:bg-teal-deep disabled:opacity-60"
            >
              {step === 'checking' ? 'Checking' : 'Download'}
            </button>
          </div>
          <button type="button" onClick={() => setStep('idle')} className="mt-3 text-sm font-semibold text-ink-2 hover:text-ink">
            Cancel
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-1 text-sm font-semibold text-berry">
          {error}
        </p>
      )}
    </div>
  )
}
