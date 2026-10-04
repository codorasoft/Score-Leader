import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import type { Player, PlayerPosition } from '../../lib/types'

const positionColors: Record<PlayerPosition, string> = {
  GK: 'bg-yellow-600 text-yellow-100',
  DEF: 'bg-blue-600 text-blue-100',
  MID: 'bg-green-600 text-green-100',
  ATT: 'bg-red-600 text-red-100',
}

export function PositionBadge({ position }: { position: PlayerPosition }) {
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded ${positionColors[position]}`}>
      {position}
    </span>
  )
}

const POSITIONS: PlayerPosition[] = ['GK', 'DEF', 'MID', 'ATT']

interface PlayerFormData {
  name: string
  position: PlayerPosition
  skill_rating: number
  photo_url: string
}

const defaultForm: PlayerFormData = { name: '', position: 'MID', skill_rating: 3, photo_url: '' }

export default function PlayersPage() {
  const { t } = useTranslation()
  const [players, setPlayers] = useState<Player[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [form, setForm] = useState<PlayerFormData>(defaultForm)

  const fetchPlayers = async () => {
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('is_active', true)
      .order('name')
    if (data) setPlayers(data as Player[])
  }

  useEffect(() => { fetchPlayers() }, [])

  const openAdd = () => {
    setEditingPlayer(null)
    setForm(defaultForm)
    setDialogOpen(true)
  }

  const openEdit = (p: Player) => {
    setEditingPlayer(p)
    setForm({ name: p.name, position: p.position, skill_rating: p.skill_rating, photo_url: p.photo_url ?? '' })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const payload = {
      name: form.name,
      position: form.position,
      skill_rating: form.skill_rating,
      photo_url: form.photo_url || null,
    }
    if (editingPlayer) {
      await supabase.from('players').update(payload).eq('id', editingPlayer.id)
    } else {
      await supabase.from('players').insert(payload)
    }
    setDialogOpen(false)
    fetchPlayers()
  }

  const handleDeactivate = async (id: string) => {
    await supabase.from('players').update({ is_active: false }).eq('id', id)
    fetchPlayers()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">{t('players.title')}</h1>
        <button onClick={openAdd} className="px-4 py-2 bg-blue-600 rounded text-sm font-semibold hover:bg-blue-700">
          {t('players.addPlayer')}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {players.map((p) => (
          <div key={p.id} className="bg-gray-800 rounded-lg p-4 flex items-center gap-3">
            {p.photo_url && (
              <img src={p.photo_url} alt={p.name} className="w-10 h-10 rounded-full object-cover" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{p.name}</div>
              <div className="flex items-center gap-2 mt-1">
                <PositionBadge position={p.position} />
                <span className="text-yellow-400 text-sm">{'★'.repeat(p.skill_rating)}{'☆'.repeat(5 - p.skill_rating)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <button onClick={() => openEdit(p)} className="text-xs text-blue-400 hover:text-blue-300">{t('common.edit')}</button>
              <button onClick={() => handleDeactivate(p.id)} className="text-xs text-red-400 hover:text-red-300">{t('common.remove')}</button>
            </div>
          </div>
        ))}
      </div>

      {dialogOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold">{editingPlayer ? t('players.editPlayer') : t('players.addPlayerTitle')}</h2>

            <input
              placeholder={t('players.namePlaceholder')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600"
            />

            <select
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value as PlayerPosition })}
              className="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600"
            >
              {POSITIONS.map((pos) => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">{t('players.skillRating', { value: form.skill_rating })}</label>
              <input
                type="range"
                min={1}
                max={5}
                value={form.skill_rating}
                onChange={(e) => setForm({ ...form, skill_rating: Number(e.target.value) })}
                className="w-full"
              />
            </div>

            <input
              placeholder={t('players.photoUrlPlaceholder')}
              value={form.photo_url}
              onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
              className="w-full px-3 py-2 rounded bg-gray-700 text-white border border-gray-600"
            />

            <div className="flex gap-3 justify-end">
              <button onClick={() => setDialogOpen(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={!form.name} className="px-4 py-2 bg-blue-600 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
