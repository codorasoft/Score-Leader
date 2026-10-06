import { Navigate } from 'react-router-dom'
import { useMyLeagues } from '../contexts/MyLeaguesContext'
import { pickLeague } from '../lib/leaguePaths'

export default function AdminHome() {
  const { leagues } = useMyLeagues()
  const slug = pickLeague(leagues)
  return <Navigate to={slug ? `/admin/${slug}/home` : '/admin/leagues/new'} replace />
}
