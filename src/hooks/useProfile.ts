import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { fetchMyProfile, type AdminProfile } from '../lib/tenancy'

interface ProfileState {
  profile: AdminProfile | null
  loading: boolean
  // The request failed — not the same as a missing profile.
  error: boolean
  retry: () => void
}

export function useProfile(): ProfileState {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const [attempt, setAttempt] = useState(0)
  const key = `${userId}:${attempt}`
  const [state, setState] = useState<{ key: string; profile: AdminProfile | null; error: boolean } | null>(null)
  const retry = useCallback(() => setAttempt(n => n + 1), [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchMyProfile(userId).then(
      profile => { if (!cancelled) setState({ key, profile, error: false }) },
      () => { if (!cancelled) setState({ key, profile: null, error: true }) },
    )
    return () => { cancelled = true }
  }, [key, userId])

  if (authLoading) return { profile: null, loading: true, error: false, retry }
  if (!userId) return { profile: null, loading: false, error: false, retry }
  const ready = state?.key === key
  return {
    profile: ready ? state.profile : null,
    loading: !ready,
    error: ready && state.error,
    retry,
  }
}
