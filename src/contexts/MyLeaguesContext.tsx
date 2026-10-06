import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { fetchMyLeagues, type AdminProfile, type League } from '../lib/tenancy'
import LoadingScreen from '../components/LoadingScreen'
import LoadFailed from '../components/LoadFailed'

interface MyLeagues {
  leagues: League[]
  profile: AdminProfile
  refresh: () => Promise<void>
}

const MyLeaguesContext = createContext<MyLeagues | null>(null)

export function MyLeaguesProvider({ profile, children }: { profile: AdminProfile; children: ReactNode }) {
  const [leagues, setLeagues] = useState<League[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // Rejects when the request fails, leaving the current list in place.
  const refresh = useCallback(async () => {
    setLeagues(await fetchMyLeagues())
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchMyLeagues().then(
      list => { if (!cancelled) setLeagues(list) },
      () => { if (!cancelled) setFailed(true) },
    )
    return () => { cancelled = true }
  }, [attempt])

  const retry = () => {
    setFailed(false)
    setAttempt(n => n + 1)
  }

  // A failed load must not look like "no leagues": that would redirect to create-first-league.
  if (failed) return <LoadFailed onRetry={retry} />
  if (!leagues) return <LoadingScreen />
  return <MyLeaguesContext.Provider value={{ leagues, profile, refresh }}>{children}</MyLeaguesContext.Provider>
}

export function useMyLeagues(): MyLeagues {
  const value = useContext(MyLeaguesContext)
  if (!value) throw new Error('useMyLeagues outside MyLeaguesProvider')
  return value
}

// Route element placed directly under RequireRole, which hands over the profile.
export function MyLeaguesRoute() {
  const profile = useOutletContext<AdminProfile>()
  return <MyLeaguesProvider profile={profile}><Outlet /></MyLeaguesProvider>
}
