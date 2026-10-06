import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import type { Role } from '../lib/tenancy'
import LoadingScreen from './LoadingScreen'
import LoadFailed from './LoadFailed'
import NotAvailablePage from '../pages/NotAvailablePage'

const HOME: Record<Role, string> = { admin: '/admin', superadmin: '/super' }

// Hands the loaded profile to the child route through the outlet context.
export default function RequireRole({ role }: { role: Role }) {
  const { user, loading, signOut } = useAuth()
  const { profile, loading: profileLoading, error, retry } = useProfile()
  // Only a confirmed missing or disabled profile signs out; a failed request offers a retry.
  const blockedNow = !loading && !!user && !profileLoading && !error && (!profile || profile.is_disabled)
  // Stays set after signOut clears the user, so the message remains on screen.
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    if (!blockedNow || blocked) return
    setBlocked(true)
    signOut()
  }, [blockedNow, blocked, signOut])

  if (blocked || blockedNow) return <NotAvailablePage kind="disabled" />
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (error) return <LoadFailed onRetry={retry} />
  if (profileLoading || !profile) return <LoadingScreen />
  if (profile.role !== role) return <Navigate to={HOME[profile.role]} replace />
  return <Outlet context={profile} />
}
