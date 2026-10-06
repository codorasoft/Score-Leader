import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useLeague, useFeature, usePublicPath } from '../../contexts/LeagueContext'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { PhotoCropper } from '../../components/PhotoCropper'
import { deletePlayerPhoto, uploadPlayerPhoto } from '../../lib/playerPhoto'
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
  const league = useLeague()
  const photosOn = useFeature('photos')
  const profilesOn = useFeature('profiles')
  const publicPath = usePublicPath()
  const [players, setPlayers] = useState<Player[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [form, setForm] = useState<PlayerFormData>(defaultForm)
  const [confirmRemove, setConfirmRemove] = useState<Player | null>(null)
  const [photoFile, setPhotoFile] = useState<Blob | null>(null)
  // Photo being framed in the adjuster: a newly picked file (object URL) or the saved photo
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [pickedUrl, setPickedUrl] = useState<string | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [saving, setSaving] = useState(false)

  const newPhotoUrl = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile])
  useEffect(() => () => { if (newPhotoUrl) URL.revokeObjectURL(newPhotoUrl) }, [newPhotoUrl])
  const previewUrl = newPhotoUrl ?? (removePhoto ? null : form.photo_url || null)

  const fetchPlayers = async () => {
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('league_id', league.id)
      .eq('is_active', true)
      .order('name')
    if (data) setPlayers(data as Player[])
  }

  useEffect(() => { fetchPlayers() }, [])

  const resetPhoto = () => {
    setPhotoFile(null)
    setRemovePhoto(false)
    setCropSrc(null)
    if (pickedUrl) URL.revokeObjectURL(pickedUrl)
    setPickedUrl(null)
  }

  const openAdd = () => {
    resetPhoto()
    setEditingPlayer(null)
    setForm(defaultForm)
    setDialogOpen(true)
  }

  const openEdit = (p: Player) => {
    resetPhoto()
    setEditingPlayer(p)
    setForm({ name: p.name, position: p.position, skill_rating: p.skill_rating, photo_url: p.photo_url ?? '' })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    // New players get their id here so their photo can be uploaded before the row exists
    const id = editingPlayer?.id ?? crypto.randomUUID()
    const oldPhoto = editingPlayer?.photo_url ?? null
    let photoUrl: string | null = removePhoto ? null : form.photo_url || null
    if (photosOn && photoFile) {
      const uploaded = await uploadPlayerPhoto(league.id, id, photoFile).catch(() => null)
      // Upload failed (an error message is shown): keep the previous photo rather than losing it
      if (uploaded) photoUrl = uploaded
    }
    const payload = { name: form.name, position: form.position, skill_rating: form.skill_rating, photo_url: photoUrl }
    const { error } = editingPlayer
      ? await supabase.from('players').update(payload).eq('id', id)
      : await supabase.from('players').insert({ id, league_id: league.id, ...payload })
    if (!error && oldPhoto && oldPhoto !== photoUrl) await deletePlayerPhoto(oldPhoto)
    setSaving(false)
    if (error) return
    setDialogOpen(false)
    fetchPlayers()
  }

  // Removing only hides the player (is_active = false); their stats and history are kept
  const handleDeactivate = async (id: string) => {
    setConfirmRemove(null)
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
          <div key={p.id} className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <PlayerAvatar player={p} />
              <div className="flex-1 min-w-0">
                {profilesOn ? (
                  <Link to={publicPath(`/players/${p.id}`)} className="font-semibold truncate block hover:underline">{p.name}</Link>
                ) : (
                  <span className="font-semibold truncate block">{p.name}</span>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <PositionBadge position={p.position} />
                  <span className="text-yellow-400 text-sm">{'★'.repeat(p.skill_rating)}{'☆'.repeat(5 - p.skill_rating)}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-700">
              <button
                onClick={() => openEdit(p)}
                aria-label={t('players.editNamed', { name: p.name })}
                className="min-h-[44px] rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold flex items-center justify-center gap-2"
              >
                <span aria-hidden="true">✏️</span> {t('common.edit')}
              </button>
              <button
                onClick={() => setConfirmRemove(p)}
                aria-label={t('players.removeNamed', { name: p.name })}
                className="min-h-[44px] rounded-lg bg-red-900/40 border border-red-700/60 text-red-200 hover:bg-red-900/70 text-sm font-semibold flex items-center justify-center gap-2"
              >
                <span aria-hidden="true">🗑️</span> {t('common.remove')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {photosOn && cropSrc && (
        <PhotoCropper
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onDone={(photo) => { setPhotoFile(photo); setRemovePhoto(false); setCropSrc(null) }}
        />
      )}

      {confirmRemove && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setConfirmRemove(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="remove-title" className="bg-gray-800 rounded-xl p-6 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-3xl mb-2" aria-hidden="true">🗑️</div>
            <h2 id="remove-title" className="text-lg font-bold mb-2">{t('players.removeTitle', { name: confirmRemove.name })}</h2>
            <p className="text-sm text-gray-400 mb-5">{t('players.removeBody')}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRemove(null)} className="flex-1 py-2 bg-gray-700 rounded font-semibold hover:bg-gray-600">
                {t('common.cancel')}
              </button>
              <button onClick={() => handleDeactivate(confirmRemove.id)} className="flex-1 py-2 bg-red-600 rounded font-semibold hover:bg-red-500">
                {t('players.removeConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setDialogOpen(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{editingPlayer ? t('players.editPlayer') : t('players.addPlayerTitle')}</h2>

            {photosOn && (
            <div className="flex items-center gap-4">
              {previewUrl ? (
                <img src={previewUrl} alt="" className="w-20 h-20 rounded-full object-cover bg-gray-700 shrink-0" />
              ) : (
                <PlayerAvatar player={{ name: form.name || '?', photo_url: null }} size="lg" />
              )}
              <div className="flex flex-col gap-2 min-w-0">
                <label className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold cursor-pointer text-center">
                  📷 {previewUrl ? t('players.changePhoto') : t('players.choosePhoto')}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        if (pickedUrl) URL.revokeObjectURL(pickedUrl)
                        const url = URL.createObjectURL(file)
                        setPickedUrl(url)
                        setCropSrc(url)
                      }
                      e.target.value = ''
                    }}
                  />
                </label>
                {previewUrl && (
                  <button
                    type="button"
                    onClick={() => setCropSrc(pickedUrl ?? form.photo_url)}
                    className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs font-semibold"
                  >
                    ✂️ {t('photo.adjust')}
                  </button>
                )}
                {previewUrl && (
                  <button
                    type="button"
                    onClick={() => { setPhotoFile(null); setRemovePhoto(true) }}
                    className="px-3 py-1.5 rounded-lg text-xs text-red-300 hover:bg-red-900/40"
                  >
                    {t('players.removePhoto')}
                  </button>
                )}
              </div>
            </div>
            )}

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

            <div className="flex gap-3 justify-end">
              <button onClick={() => setDialogOpen(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">{t('common.cancel')}</button>
              <button onClick={handleSave} disabled={!form.name || saving} className="px-4 py-2 bg-blue-600 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {saving ? t('players.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
