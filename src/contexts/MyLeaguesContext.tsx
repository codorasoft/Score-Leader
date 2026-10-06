import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Outlet, useOutletContext } from 'react-router-dom'
import { fetchMyLeagues, type AdminProfile, type League } from '../lib/tenancy'
import LoadingScreen from '../components/LoadingScreen'

interface MyLeagues {
  leagues: League[]
  profile: AdminProfile
  refresh: () => Promise<void>
}

const MyLeaguesContext = createContext<MyLeagues | null>(null)

export function MyLeaguesProvider({ profile, children }: { profile: AdminProfile; children: ReactNode }) {
  const [leagues, setLeagues] = useState<League[] | null>(null)

  const refresh = useCallback(async () => {
    setLeagues(await fetchMyLeagues())
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchMyLeagues().then(list => { if (!cancelled) setLeagues(list) })
    return () => { cancelled = true }
  }, [])

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
