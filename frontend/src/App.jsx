import { useEffect, useRef, useState } from 'react'
import Header from './components/Header'
import Notice from './components/Notice'
import AIChatWidget from './components/AIChatWidget'
import { ROUTES, useRoute } from './lib/router'
import Home from './pages/Home'
import Screen from './pages/Screen'
import About from './pages/About'
import How from './pages/How'
import SignIn from './pages/SignIn'
import Reports from './pages/Reports'
import ReportDetail from './pages/ReportDetail'

const PAGES = {
  '/': Home,
  '/screen': Screen,
  '/reports': Reports,
  '/reports/:id': ReportDetail,
  '/sign-in': SignIn,
  '/about': About,
  '/how-it-works': How,
}

export default function App() {
  const { route, params } = useRoute()
  const Page = PAGES[route]
  const first = useRef(true)
  const [chatState, setChatState] = useState({ open: false, analysisId: null })

  useEffect(() => {
    const handleOpenChat = (e) => {
      setChatState({ open: true, analysisId: e.detail?.analysisId || null })
    }
    window.addEventListener('open-pcos-chat', handleOpenChat)
    return () => window.removeEventListener('open-pcos-chat', handleOpenChat)
  }, [])

  useEffect(() => {
    document.title = route === '/' ? 'PCOS Screen' : `${ROUTES[route]} | PCOS Screen`
    if (first.current) {
      first.current = false
      return
    }
    // Move keyboard and screen reader focus to the new page after navigating.
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [route])

  return (
    <>
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
      >
        Skip to content
      </a>
      <Header route={route} />
      <main id="main" tabIndex={-1} className="outline-none">
        <Page params={params} />
      </main>
      <Notice />
      <AIChatWidget
        activeAnalysisId={chatState.analysisId}
        initialOpen={chatState.open}
        onClose={() => setChatState((prev) => ({ ...prev, open: false }))}
      />
    </>
  )
}
