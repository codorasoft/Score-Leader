import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

interface LineupRow { id: string; name: string; updated_at: string }

export default function LineupsPage() {
  const { t, i18n } = useTranslation()
  const [lineups, setLineups] = useState<LineupRow[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    const load = async () => {
      const [{ data: rows }, { data: spots }] = await Promise.all([
        supabase.from('lineups').select('id, name, updated_at').order('updated_at', { ascending: false }),
        supabase.from('lineup_players').select('lineup_id'),
      ])
      const tally: Record<string, number> = {}
      for (const s of (spots ?? []) as { lineup_id: string }[]) tally[s.lineup_id] = (tally[s.lineup_id] ?? 0) + 1
      setCounts(tally)
      setLineups((rows ?? []) as LineupRow[])
    }
    load()
  }, [])

  const edited = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">⚽ {t('lineups.title')}</h1>
        <Link to="/admin/lineups/new" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-semibold">
          ＋ {t('lineups.new')}
        </Link>
      </div>

      {lineups === null && <p className="text-gray-400">{t('common.loading')}</p>}
      {lineups?.length === 0 && <p className="text-gray-500 text-center py-10">{t('lineups.empty')}</p>}

      <ul className="space-y-2">
        {lineups?.map((l) => (
          <li key={l.id}>
            <Link to={`/admin/lineups/${l.id}`} className="flex items-center gap-3 bg-gray-800 hover:bg-gray-700 rounded-xl px-4 py-3">
              <span className="text-2xl" aria-hidden="true">📋</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold truncate">{l.name}</span>
                <span className="block text-xs text-gray-400">
                  {t('lineups.playerCount', { count: counts[l.id] ?? 0 })} · {t('lineups.edited', { date: edited(l.updated_at) })}
                </span>
              </span>
              <span className="text-gray-500" aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
