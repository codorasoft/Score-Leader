import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAdminPath, useFeature } from '../contexts/LeagueContext'
import type { FeatureKey } from '../lib/features'
import NotAvailablePage from '../pages/NotAvailablePage'

function AdminHistoryRedirect() {
  return <Navigate to={useAdminPath()('/history')} replace />
}

export default function FeatureRoute({ name, fallback, children }: {
  name: FeatureKey
  fallback: 'notFound' | 'history'
  children: ReactNode
}) {
  if (useFeature(name)) return <>{children}</>
  return fallback === 'notFound' ? <NotAvailablePage kind="page" /> : <AdminHistoryRedirect />
}
