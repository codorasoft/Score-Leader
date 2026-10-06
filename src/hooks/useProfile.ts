import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { fetchMyProfile, type AdminProfile } from '../lib/tenancy'

export function useProfile(): { profile: AdminProfile | null; loading: boolean } {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const [state, setState] = useState<{ forUser: string | null; profile: AdminProfile | null } | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchMyProfile(userId).then(profile => {
      if (!cancelled) setState({ forUser: userId, profile })
    })
    return () => { cancelled = true }
  }, [userId])

  if (authLoading) return { profile: null, loading: true }
  if (!userId) return { profile: null, loading: false }
  const ready = state?.forUser === userId
  return { profile: ready ? state.profile : null, loading: !ready }
}
