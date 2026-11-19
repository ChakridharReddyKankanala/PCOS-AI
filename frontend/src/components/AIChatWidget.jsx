import { useEffect, useRef, useState } from 'react'
import { askAssistant, getAssistantStatus } from '../lib/api'

export default function AIChatWidget({ activeAnalysisId = null, initialOpen = false, onClose }) {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Hello! I am your **PCOS-XAI Copilot**. I can help explain your hormonal markers (like LH/FSH), clarify ultrasound findings, or provide evidence-based lifestyle & nutrition tips. How can I assist you today?',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    getAssistantStatus()
      .then((data) => setStatus(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (initialOpen) setIsOpen(true)
  }, [initialOpen])

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  const handleSend = async (textToSend) => {
    const text = (textToSend || input).trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    const updatedHistory = [...messages, userMsg]
    setMessages(updatedHistory)
    setInput('')
    setLoading(true)

    try {
      // Send previous messages (excluding the first greeting) as history
      const historyToSend = updatedHistory.slice(1, -1)
      const res = await askAssistant({
        message: text,
        history: historyToSend,
        analysisId: activeAnalysisId,
      })
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'I had trouble connecting to the AI assistant right now. Please verify your connection or try again.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const promptSuggestions = [
    'What does my LH/FSH ratio indicate?',
    'What nutrition helps with PCOS insulin resistance?',
    'How do follicles in ultrasound connect to Rotterdam criteria?',
    'What questions should I ask my doctor?',
  ]

  return (
    <aside aria-label="PCOS AI Copilot" className="fixed bottom-6 right-6 z-50">
      {/* Floating Trigger Button (when closed) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group flex items-center gap-2.5 rounded-full bg-gradient-to-r from-teal to-teal-deep px-5 py-3 text-white shadow-xl transition-all hover:scale-105 hover:shadow-2xl focus:outline-none"
          aria-label="Open PCOS AI Copilot"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
            </svg>
          </span>
          <span className="font-semibold text-sm tracking-wide">PCOS Copilot</span>
          <span className="flex h-2.5 w-2.5 rounded-full bg-beam animate-ping" />
        </button>
      )}

      {/* Chat Window (when open) */}
      {isOpen && (
        <div className="flex h-[580px] w-[370px] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl sm:w-[420px]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line bg-gradient-to-r from-teal-deep to-teal px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                <svg className="h-4 w-4 text-beam" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
                </svg>
              </div>
              <div>
                <h4 className="font-bold text-sm leading-tight">PCOS Copilot</h4>
                <div className="flex items-center gap-1.5 text-xs text-teal-tint">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span>{status?.provider || 'Gemini 1.5 Flash'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMessages([messages[0]])}
                title="Clear chat"
                className="rounded-lg p-1.5 text-teal-tint/80 transition hover:bg-white/10 hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  if (onClose) onClose()
                }}
                title="Close chat"
                className="rounded-lg p-1.5 text-teal-tint/80 transition hover:bg-white/10 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Context Notice if analysis attached */}
          {activeAnalysisId && (
            <div className="flex items-center justify-between border-b border-line bg-teal-tint/30 px-3.5 py-1.5 text-xs text-teal-deep">
              <span className="font-medium">Context: Analysis #{activeAnalysisId.slice(0, 8)}...</span>
              <span className="text-[10px] uppercase font-bold text-teal">Active</span>
            </div>
          )}

          {/* Message List */}
          <div className="flex-1 space-y-3.5 overflow-y-auto p-4 text-sm">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-teal text-white rounded-br-none shadow-sm'
                      : 'bg-paper text-ink border border-line rounded-bl-none'
                  }`}
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-none border border-line bg-paper px-4 py-3 text-ink-3">
                  <span className="h-2 w-2 rounded-full bg-teal animate-bounce" />
                  <span className="h-2 w-2 rounded-full bg-teal animate-bounce [animation-delay:0.2s]" />
                  <span className="h-2 w-2 rounded-full bg-teal animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts (only when 1 or 2 messages) */}
          {messages.length <= 2 && (
            <div className="border-t border-line bg-paper/50 px-3 py-2">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                Suggested questions:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {promptSuggestions.map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="rounded-lg border border-line bg-white px-2.5 py-1 text-left text-xs text-ink-2 transition hover:border-teal hover:text-teal-deep"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Box */}
          <div className="border-t border-line p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSend()
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about PCOS symptoms, lab markers, or diet..."
                disabled={loading}
                className="flex-1 rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-teal focus:bg-white"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal text-white shadow-sm transition hover:bg-teal-deep disabled:opacity-40"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </form>
            <p className="mt-1.5 text-center text-[10px] text-ink-3">
              AI Copilot is for educational support, not formal medical diagnosis.
            </p>
          </div>
        </div>
      )}
    </aside>
  )
}
