import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlayerAvatar } from './PlayerAvatar'
import { GUEST_NAME_MAX } from '../utils/board'
import type { Player } from '../lib/types'

// Choosing players for a coach board, several at once, or typing the name of a guest. The
// heading says where they are going: onto the pitch or among the substitutes.
export function PlayerPicker({ title, players, onAdd, onAddGuest, onClose }: {
  title: string
  players: Player[]
  onAdd: (ids: string[]) => void
  onAddGuest: (name: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [guestName, setGuestName] = useState('')
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const shown = players.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
  const toggle = (id: string) => setChosen((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="picker-title"
        className="bg-gray-800 rounded-t-2xl sm:rounded-2xl p-4 w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <h2 id="picker-title" className="text-lg font-bold mb-3">{title}</h2>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('lineups.search')}
          className="w-full mb-3 px-3 py-2 rounded-lg bg-gray-700 border border-gray-600" />
        {players.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">{t('lineups.noneLeft')}</p>}
        <ul className="flex-1 overflow-y-auto space-y-1">
          {shown.map((p) => (
            <li key={p.id}>
              <button onClick={() => toggle(p.id)} aria-pressed={chosen.has(p.id)}
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-start ${chosen.has(p.id) ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>
                <PlayerAvatar player={p} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-xs text-gray-300">{p.position}</span>
                <span aria-hidden="true">{chosen.has(p.id) ? '✓' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 pt-3 border-t border-gray-700"
          onSubmit={(e) => { e.preventDefault(); onAddGuest(guestName) }}
        >
          <p className="text-sm font-semibold">👤 {t('lineups.guestTitle')}</p>
          <p className="text-xs text-gray-400 mb-2">{t('lineups.guestHint')}</p>
          <div className="flex gap-2">
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder={t('lineups.guestPlaceholder')}
              maxLength={GUEST_NAME_MAX} className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-gray-700 border border-gray-600" />
            <button type="submit" disabled={!guestName.trim()} className="px-3 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 font-semibold disabled:opacity-50">
              {t('lineups.addGuest')}
            </button>
          </div>
        </form>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={onClose} className="py-2.5 rounded-lg bg-gray-700 font-semibold">{t('common.cancel')}</button>
          <button onClick={() => onAdd([...chosen])} disabled={chosen.size === 0} className="py-2.5 rounded-lg bg-blue-600 font-semibold disabled:opacity-50">
            {t('lineups.addSelected', { count: chosen.size })}
          </button>
        </div>
      </div>
    </div>
  )
}
