import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './components/LoginPage'
import Dashboard from './components/Dashboard'
import ErrorBoundary from './components/ErrorBoundary'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  let screen
  if (loading) {
    screen = (
      <div className="app-container flex items-center justify-center">
        <div className="text-purple font-bold text-lg">جاري التحميل...</div>
      </div>
    )
  } else if (!session) {
    screen = <LoginPage onLogin={setSession} />
  } else {
    screen = <Dashboard session={session} onLogout={() => setSession(null)} />
  }

  // A render crash anywhere shows a retry screen instead of a blank page.
  return <ErrorBoundary>{screen}</ErrorBoundary>
}
