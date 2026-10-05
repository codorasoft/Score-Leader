import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { PitchBoard } from '../../components/PitchBoard'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { BoardToolbar } from '../../components/BoardToolbar'
import { parseDrawings, type DrawColor, type DrawTool, type Shape } from '../../utils/boardDrawings'
import { drawBoardImage, shareCanvas } from '../../lib/shareImage'
import { lineupChanges, spotForNewPlayer, type BoardPlayer, type BoardSpot } from '../../utils/board'
import type { Player } from '../../lib/types'

export default function LineupEditorPage() {
  const { lineupId } = useParams<{ lineupId: string }>()
  const isNew = !lineupId
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [players, setPlayers] = useState<Player[]>([])
  const [name, setName] = useState('')
  const [board, setBoard] = useState<BoardPlayer[]>([])
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [drawings, setDrawings] = useState<Shape[]>([])
  const [tool, setTool] = useState<DrawTool>('move')
  const [color, setColor] = useState<DrawColor>('yellow')
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    const load = async () => {
      // Inactive players stay visible on boards they were already placed on
      const { data: pData } = await supabase.from('players').select('*').order('name')
      setPlayers((pData ?? []) as Player[])
      if (lineupId) {
        const [{ data: lineup }, { data: spots }] = await Promise.all([
          supabase.from('lineups').select('*').eq('id', lineupId).single(),
          supabase.from('lineup_players').select('*').eq('lineup_id', lineupId),
        ])
        if (!lineup) { navigate('/admin/lineups', { replace: true }); return }
        const rows = (spots ?? []) as { player_id: string; x: number; y: number }[]
        setName((lineup as { name: string }).name)
        setDrawings(parseDrawings((lineup as { drawings?: unknown }).drawings))
        setBoard(rows.map((r) => ({ playerId: r.player_id, x: r.x, y: r.y })))
        setSavedIds(rows.map((r) => r.player_id))
      }
      setLoaded(true)
    }
    load()
  }, [lineupId])

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const onBoard = board.map((b) => ({ ...b, player: byId.get(b.playerId) })).filter((b): b is BoardPlayer & { player: Player } => !!b.player)

  const change = (next: BoardPlayer[]) => { setBoard(next); setDirty(true) }
  const move = (playerId: string, spot: BoardSpot) => change(board.map((b) => (b.playerId === playerId ? { ...b, ...spot } : b)))
  const remove = (playerId: string) => change(board.filter((b) => b.playerId !== playerId))
  const draw = (next: Shape[]) => { setDrawings(next); setDirty(true) }

  const add = (ids: string[]) => {
    change([...board, ...ids.map((playerId, i) => ({ playerId, ...spotForNewPlayer(board.length + i) }))])
    setPicking(false)
  }

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    const id = lineupId ?? crypto.randomUUID()
    const { error } = isNew
      ? await supabase.from('lineups').insert({ id, name: trimmed, drawings })
      : await supabase.from('lineups').update({ name: trimmed, drawings, updated_at: new Date().toISOString() }).eq('id', id)
    if (!error) {
      const { remove: gone, upsert } = lineupChanges(id, savedIds, board)
      const removed = gone.length
        ? await supabase.from('lineup_players').delete().eq('lineup_id', id).in('player_id', gone)
        : { error: null }
      const saved = upsert.length && !removed.error
        ? await supabase.from('lineup_players').upsert(upsert, { onConflict: 'lineup_id,player_id' })
        : { error: removed.error }
      if (!saved.error) {
        setSavedIds(board.map((b) => b.playerId))
        setDirty(false)
        if (isNew) navigate(`/admin/lineups/${id}`, { replace: true })
      }
    }
    setSaving(false)
  }

  const share = async () => {
    const canvas = await drawBoardImage({
      title: name.trim() || t('lineups.untitled'),
      subtitle: t('lineups.playerCount', { count: onBoard.length }),
      players: onBoard.map((b) => ({ name: b.player.name, photo_url: b.player.photo_url, x: b.x, y: b.y })),
      drawings,
      footer: 'ScoreLeader',
    })
    await shareCanvas(canvas, 'scoreleader-lineup.png', name.trim() || t('lineups.untitled'))
  }

  const deleteLineup = async () => {
    if (!lineupId) return
    const { error } = await supabase.from('lineups').delete().eq('id', lineupId)
    if (!error) navigate('/admin/lineups', { replace: true })
  }

  if (!loaded) return <div className="p-4 text-gray-400">{t('common.loading')}</div>

  const available = players.filter((p) => p.is_active && !board.some((b) => b.playerId === p.id))

  return (
    <div className="max-w-md mx-auto">
      <Link to="/admin/lineups" className="text-gray-400 hover:text-white text-sm">← {t('lineups.title')}</Link>

      <input
        value={name}
        onChange={(e) => { setName(e.target.value); setDirty(true) }}
        placeholder={t('lineups.namePlaceholder')}
        maxLength={80}
        aria-label={t('lineups.nameLabel')}
        className="w-full mt-3 mb-3 px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-lg font-semibold"
      />

      <PitchBoard
        players={onBoard}
        onMove={move}
        tool={tool}
        color={color}
        drawings={drawings}
        onAddShape={(shape) => draw([...drawings, shape])}
        onEraseShape={(shapeId) => draw(drawings.filter((d) => d.id !== shapeId))}
      />
      <BoardToolbar
        tool={tool}
        onTool={setTool}
        color={color}
        onColor={setColor}
        canUndo={drawings.length > 0}
        onUndo={() => draw(drawings.slice(0, -1))}
        onClear={() => setConfirmClear(true)}
      />
      {onBoard.length === 0 && <p className="text-sm text-gray-400 text-center mt-2">{t('lineups.emptyBoard')}</p>}

      <button onClick={() => setPicking(true)} className="w-full mt-3 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 font-semibold">
        ＋ {t('lineups.addPlayers')}
      </button>

      {onBoard.length > 0 && (
        <ul className="flex flex-wrap gap-2 mt-3" aria-label={t('lineups.onBoard')}>
          {onBoard.map((b) => (
            <li key={b.playerId} className="flex items-center gap-1.5 bg-gray-800 rounded-full ps-1 pe-1 py-1">
              <PlayerAvatar player={b.player} size="sm" />
              <span className="text-sm max-w-[110px] truncate">{b.player.name}</span>
              <button onClick={() => remove(b.playerId)} aria-label={t('lineups.removeNamed', { name: b.player.name })}
                className="w-7 h-7 rounded-full text-red-300 hover:bg-red-900/50">✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2 mt-4">
        <button onClick={save} disabled={saving || !name.trim()} className="py-3 rounded-xl bg-green-600 hover:bg-green-500 font-semibold disabled:opacity-50">
          {saving ? t('lineups.saving') : dirty || isNew ? `💾 ${t('lineups.save')}` : `✓ ${t('lineups.saved')}`}
        </button>
        <button onClick={share} disabled={onBoard.length === 0 && drawings.length === 0} className="py-3 rounded-xl bg-[#0866FF] hover:bg-[#0756d6] font-semibold disabled:opacity-50">
          📤 {t('lineups.share')}
        </button>
      </div>
      {!name.trim() && <p className="text-xs text-yellow-300 mt-2">{t('lineups.nameNeeded')}</p>}
      {dirty && !isNew && name.trim() && <p className="text-xs text-orange-300 mt-2">{t('lineups.unsaved')}</p>}

      {!isNew && (
        <button onClick={() => setConfirmDelete(true)} className="w-full mt-6 py-2 rounded-lg text-sm text-red-300 hover:bg-red-900/40">
          🗑️ {t('lineups.delete')}
        </button>
      )}

      {picking && <PlayerPicker players={available} onAdd={add} onClose={() => setPicking(false)} />}

      {confirmClear && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setConfirmClear(false)}>
          <div role="dialog" aria-modal="true" className="bg-gray-800 rounded-xl p-6 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold mb-5">{t('board.confirmClear')}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmClear(false)} className="flex-1 py-2 bg-gray-700 rounded font-semibold">{t('common.cancel')}</button>
              <button onClick={() => { draw([]); setConfirmClear(false) }} className="flex-1 py-2 bg-red-600 rounded font-semibold">{t('board.clear')}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDelete(false)}>
          <div role="dialog" aria-modal="true" className="bg-gray-800 rounded-xl p-6 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold mb-5">{t('lineups.confirmDelete', { name })}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 bg-gray-700 rounded font-semibold">{t('common.cancel')}</button>
              <button onClick={deleteLineup} className="flex-1 py-2 bg-red-600 rounded font-semibold">{t('lineups.delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PlayerPicker({ players, onAdd, onClose }: { players: Player[]; onAdd: (ids: string[]) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
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
        <h2 id="picker-title" className="text-lg font-bold mb-3">{t('lineups.addPlayers')}</h2>
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
