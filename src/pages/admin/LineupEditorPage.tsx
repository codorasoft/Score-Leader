import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAdminPath, useFeature, useLeague } from '../../contexts/LeagueContext'
import { PitchBoard } from '../../components/PitchBoard'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { PlayerPicker } from '../../components/PlayerPicker'
import { BoardToolbar } from '../../components/BoardToolbar'
import BoardTextDialog from '../../components/BoardTextDialog'
import FormationDialog from '../../components/FormationDialog'
import { BenchColumn } from '../../components/BenchColumn'
import BenchSwapDialog from '../../components/BenchSwapDialog'
import { clearDrawn, editText, hasDrawn, makeText, moveText, parseDrawings, undoDrawn, type BoardText, type DrawColor, type DrawTool, type Shape } from '../../utils/boardDrawings'
import { drawBoardImage, shareCanvas } from '../../lib/shareImage'
import { benchOrder, guestsForSaving, lineupChanges, makeGuest, parseGuests, spotForNewPlayer, swapWithSubstitute, type BoardPlayer, type BoardSpot, type Guest } from '../../utils/board'
import { MAX_ON_PITCH, MIN_ON_PITCH, assignToFormation, fitsPitch, parseFormation } from '../../utils/formation'
import type { Player, PlayerPosition } from '../../lib/types'

// Anyone on the board, on the pitch or among the substitutes: a player, or a guest (a typed name,
// with no position and no photo)
interface Person { id: string; name: string; photo_url: string | null; position: PlayerPosition | null; x: number; y: number; guest: boolean }

export default function LineupEditorPage() {
  const { lineupId } = useParams<{ lineupId: string }>()
  const isNew = !lineupId
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const league = useLeague()
  const photosOn = useFeature('photos')
  const adminPath = useAdminPath()
  const [players, setPlayers] = useState<Player[]>([])
  const [name, setName] = useState('')
  // Everyone on the board, substitutes included; `bench` says who is off the pitch, in order
  const [board, setBoard] = useState<BoardPlayer[]>([])
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  // The picker, and where those picked go
  const [picking, setPicking] = useState<'pitch' | 'bench' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [drawings, setDrawings] = useState<Shape[]>([])
  const [tool, setTool] = useState<DrawTool>('move')
  const [color, setColor] = useState<DrawColor>('yellow')
  const [confirmClear, setConfirmClear] = useState(false)
  const [guests, setGuests] = useState<Guest[]>([])
  const [bench, setBench] = useState<string[]>([])
  // The formation the players on the pitch were lined up in; it is forgotten when their number changes
  const [formation, setFormation] = useState<string | null>(null)
  const [choosingFormation, setChoosingFormation] = useState(false)
  // The substitute that was tapped
  const [swapping, setSwapping] = useState<string | null>(null)
  // The text dialog: a new text for the spot that was tapped, or the text that was tapped to change it
  const [textDialog, setTextDialog] = useState<{ at: BoardSpot } | { id: string } | null>(null)

  // Latest league, so a slow response for a league we have left is dropped
  const currentLeague = useRef(league.id)
  currentLeague.current = league.id

  useEffect(() => {
    const forLeague = league.id
    const load = async () => {
      // Inactive players stay visible on boards they were already placed on
      const { data: pData } = await supabase.from('players').select('*').eq('league_id', league.id).order('name')
      if (forLeague !== currentLeague.current) return
      setPlayers((pData ?? []) as Player[])
      if (lineupId) {
        const [{ data: lineup }, { data: spots }] = await Promise.all([
          supabase.from('lineups').select('*').eq('id', lineupId).eq('league_id', league.id).single(),
          supabase.from('lineup_players').select('*').eq('lineup_id', lineupId),
        ])
        if (!lineup) { navigate(adminPath('/lineups'), { replace: true }); return }
        const rows = (spots ?? []) as { player_id: string; x: number; y: number; bench_order?: number | null }[]
        const stored = lineup as { name: string; drawings?: unknown; guests?: unknown; formation?: unknown }
        const storedGuests = parseGuests(stored.guests)
        const storedBench = benchOrder(rows.map((r) => ({ id: r.player_id, bench: r.bench_order ?? null })), storedGuests)
        // A stored formation is shown only while it still fits: a player deleted from the league
        // since leaves one fewer on the pitch
        const lines = parseFormation(stored.formation)
        const onPitch = rows.length + storedGuests.length - storedBench.length
        setName(stored.name)
        setDrawings(parseDrawings(stored.drawings))
        setGuests(storedGuests)
        setBoard(rows.map((r) => ({ playerId: r.player_id, x: r.x, y: r.y })))
        setBench(storedBench)
        setFormation(lines && fitsPitch(lines, onPitch) ? (stored.formation as string) : null)
        setSavedIds(rows.map((r) => r.player_id))
      }
      setLoaded(true)
    }
    load()
  }, [lineupId, league.id])

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  // Guest ids are fresh UUIDs, so they never clash with a player's id
  const everyone: Person[] = [
    ...board.flatMap((b) => {
      const player = byId.get(b.playerId)
      return player ? [{ id: player.id, name: player.name, photo_url: player.photo_url, position: player.position, x: b.x, y: b.y, guest: false }] : []
    }),
    ...guests.map((g) => ({ id: g.id, name: g.name, photo_url: null, position: null, x: g.x, y: g.y, guest: true })),
  ]
  const pitch = everyone.filter((p) => !bench.includes(p.id))
  const subs = bench.flatMap((id) => everyone.filter((p) => p.id === id))
  const canChooseFormation = pitch.length >= MIN_ON_PITCH && pitch.length <= MAX_ON_PITCH

  const change = (next: BoardPlayer[]) => { setBoard(next); setDirty(true) }
  const changeGuests = (next: Guest[]) => { setGuests(next); setDirty(true) }
  const changeBench = (next: string[]) => { setBench(next); setDirty(true) }
  const move = (id: string, { x, y }: BoardSpot) => {
    if (guests.some((g) => g.id === id)) changeGuests(guests.map((g) => (g.id === id ? { ...g, x, y } : g)))
    else change(board.map((b) => (b.playerId === id ? { ...b, x, y } : b)))
  }
  // Off the board altogether, from the pitch or from the substitutes
  const remove = (id: string) => {
    if (guests.some((g) => g.id === id)) changeGuests(guests.filter((g) => g.id !== id))
    else change(board.filter((b) => b.playerId !== id))
    if (bench.includes(id)) changeBench(bench.filter((b) => b !== id))
    else setFormation(null)
  }
  const toBench = (id: string) => { changeBench([...bench, id]); setFormation(null) }
  const draw = (next: Shape[]) => { setDrawings(next); setDirty(true) }
  const newTextAt = textDialog && 'at' in textDialog ? textDialog.at : null
  const editedText = textDialog && 'id' in textDialog
    ? drawings.find((d): d is BoardText => d.kind === 'text' && d.id === textDialog.id) ?? null
    : null
  const closeText = () => setTextDialog(null)
  const addText = (text: string, chosen: DrawColor) => {
    const shape = newTextAt && makeText(text, newTextAt, chosen, crypto.randomUUID())
    if (shape) draw([...drawings, shape])
    closeText()
  }

  // Those picked join the pitch or the substitutes, whichever button opened the picker
  const joined = (ids: string[]) => {
    if (picking === 'bench') changeBench([...bench, ...ids])
    else setFormation(null)
    setPicking(null)
  }
  const add = (ids: string[]) => {
    change([...board, ...ids.map((playerId, i) => ({ playerId, ...spotForNewPlayer(pitch.length + i) }))])
    joined(ids)
  }
  const addGuest = (guestName: string) => {
    const guest = makeGuest(guestName, spotForNewPlayer(pitch.length), crypto.randomUUID())
    if (!guest) return
    changeGuests([...guests, guest])
    joined([guest.id])
  }

  // Everyone on the pitch moves to a spot of the formation; the substitutes and the drawings stay
  const applyFormation = (chosen: string) => {
    const lines = parseFormation(chosen)
    const spots = new Map(lines ? assignToFormation(lines, pitch).map((s) => [s.id, s]) : [])
    setChoosingFormation(false)
    if (spots.size === 0) return
    const placed = <T extends { x: number; y: number }>(id: string, now: T): T => {
      const spot = spots.get(id)
      return spot ? { ...now, x: spot.x, y: spot.y } : now
    }
    setBoard(board.map((b) => placed(b.playerId, b)))
    setGuests(guests.map((g) => placed(g.id, g)))
    setFormation(chosen)
    setDirty(true)
  }

  const swap = (starterId: string) => {
    const done = swapping && swapWithSubstitute(bench, everyone, swapping, starterId)
    if (done) { move(done.move.id, done.move); changeBench(done.bench) }
    setSwapping(null)
  }
  const putOnPitch = () => {
    if (swapping) { move(swapping, spotForNewPlayer(pitch.length)); changeBench(bench.filter((b) => b !== swapping)); setFormation(null) }
    setSwapping(null)
  }
  const removeSubstitute = () => {
    if (swapping) remove(swapping)
    setSwapping(null)
  }
  const swapped = subs.find((s) => s.id === swapping)

  const pitchPlayers = pitch.map((p) => ({ player: { id: p.id, name: p.name, photo_url: p.photo_url }, x: p.x, y: p.y, guest: p.guest }))

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    const id = lineupId ?? crypto.randomUUID()
    // Only those still on the board hold a place among the substitutes
    const places = subs.map((s) => s.id)
    const stored = { name: trimmed, drawings, guests: guestsForSaving(guests, places), formation }
    const { error } = isNew
      ? await supabase.from('lineups').insert({ id, league_id: league.id, ...stored })
      : await supabase.from('lineups').update({ ...stored, updated_at: new Date().toISOString() }).eq('id', id)
    if (!error) {
      const { remove: gone, upsert } = lineupChanges(id, savedIds, board, places)
      const removed = gone.length
        ? await supabase.from('lineup_players').delete().eq('lineup_id', id).in('player_id', gone)
        : { error: null }
      const saved = upsert.length && !removed.error
        ? await supabase.from('lineup_players').upsert(upsert, { onConflict: 'lineup_id,player_id' })
        : { error: removed.error }
      if (!saved.error) {
        setSavedIds(board.map((b) => b.playerId))
        setDirty(false)
        if (isNew) navigate(adminPath(`/lineups/${id}`), { replace: true })
      }
    }
    setSaving(false)
  }

  const share = async () => {
    const drawn = (p: Person) => ({ name: p.name, photo_url: photosOn ? p.photo_url : null, x: p.x, y: p.y, guest: p.guest })
    // Kept left to right inside Arabic, where 4-3-3 would otherwise read as 3-3-4
    const formationShown = formation && (i18n.dir() === 'rtl' ? `⁦${formation}⁩` : formation)
    const canvas = await drawBoardImage({
      title: name.trim() || t('lineups.untitled'),
      subtitle: [
        t('lineups.playerCount', { count: pitch.length }),
        formationShown,
        subs.length > 0 && t('bench.count', { count: subs.length }),
      ].filter(Boolean).join(' · '),
      players: pitch.map(drawn),
      substitutes: subs.map(drawn),
      substitutesTitle: t('bench.label'),
      drawings,
      footer: 'ScoreLeader',
    })
    await shareCanvas(canvas, 'scoreleader-lineup.png', name.trim() || t('lineups.untitled'))
  }

  const deleteLineup = async () => {
    if (!lineupId) return
    const { error } = await supabase.from('lineups').delete().eq('id', lineupId)
    if (!error) navigate(adminPath('/lineups'), { replace: true })
  }

  if (!loaded) return <div className="p-4 text-gray-400">{t('common.loading')}</div>

  // Nobody is offered twice: not those on the pitch, not the substitutes
  const available = players.filter((p) => p.is_active && !board.some((b) => b.playerId === p.id))
  // The button's wording around the formation's name, which is always written left to right
  const [beforeName, afterName] = t('formation.buttonNamed', { name: '\u0000' }).split('\u0000')

  return (
    <div className="max-w-md mx-auto">
      <Link to={adminPath('/lineups')} className="text-gray-400 hover:text-white text-sm">← {t('lineups.title')}</Link>

      <input
        value={name}
        onChange={(e) => { setName(e.target.value); setDirty(true) }}
        placeholder={t('lineups.namePlaceholder')}
        maxLength={80}
        aria-label={t('lineups.nameLabel')}
        className="w-full mt-3 mb-3 px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-lg font-semibold"
      />

      {/* The substitutes stand beside the pitch, on the side where the text ends */}
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <PitchBoard
            players={pitchPlayers}
            onMove={move}
            tool={tool}
            color={color}
            drawings={drawings}
            onAddShape={(shape) => draw([...drawings, shape])}
            onEraseShape={(shapeId) => draw(drawings.filter((d) => d.id !== shapeId))}
            onPlaceText={(at) => setTextDialog({ at })}
            onEditText={(id) => setTextDialog({ id })}
            onMoveShape={(shapeId, spot) => draw(moveText(drawings, shapeId, spot))}
          />
        </div>
        {subs.length > 0 && <BenchColumn substitutes={subs} onPick={setSwapping} />}
      </div>
      <BoardToolbar
        tool={tool}
        onTool={setTool}
        color={color}
        onColor={setColor}
        canUndo={hasDrawn(drawings)}
        onUndo={() => draw(undoDrawn(drawings))}
        onClear={() => setConfirmClear(true)}
      />
      {pitch.length === 0 && <p className="text-sm text-gray-400 text-center mt-2">{t('lineups.emptyBoard')}</p>}

      <button onClick={() => setChoosingFormation(true)} disabled={!canChooseFormation}
        className="w-full mt-3 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 font-semibold disabled:opacity-50 disabled:hover:bg-gray-800">
        {formation ? <>{beforeName}<span dir="ltr">{formation}</span>{afterName}</> : t('formation.button')}
      </button>
      {pitch.length < MIN_ON_PITCH && <p className="text-xs text-gray-400 text-center mt-1">{t('formation.tooFew')}</p>}
      {pitch.length > MAX_ON_PITCH && <p className="text-xs text-yellow-300 text-center mt-1">{t('formation.tooMany')}</p>}

      <div className="grid grid-cols-2 gap-2 mt-3">
        <button onClick={() => setPicking('pitch')} className="py-3 rounded-xl bg-gray-800 hover:bg-gray-700 font-semibold">
          ＋ {t('lineups.addPlayers')}
        </button>
        <button onClick={() => setPicking('bench')} className="py-3 rounded-xl bg-gray-800 hover:bg-gray-700 font-semibold">
          ＋ {t('bench.add')}
        </button>
      </div>

      {pitch.length > 0 && (
        <ul className="flex flex-wrap gap-2 mt-3" aria-label={t('lineups.onBoard')}>
          {pitch.map((p) => (
            <li key={p.id} className="flex items-center gap-1.5 bg-gray-800 rounded-full ps-1 pe-1 py-1">
              {p.guest ? (
                <span className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 bg-gray-600 flex items-center justify-center text-xs font-bold" aria-hidden="true">
                  {p.name.charAt(0).toUpperCase()}
                </span>
              ) : <PlayerAvatar player={p} size="sm" />}
              <span dir="auto" className="text-sm max-w-[110px] truncate">{p.name}</span>
              {p.guest && <span className="text-[10px] font-semibold uppercase text-gray-300 bg-gray-700 rounded px-1.5 py-0.5">{t('lineups.guestTag')}</span>}
              <button onClick={() => toBench(p.id)} aria-label={t('bench.toBench', { name: p.name })}
                className="w-7 h-7 rounded-full text-gray-300 hover:bg-gray-700">⇄</button>
              <button onClick={() => remove(p.id)} aria-label={t('lineups.removeNamed', { name: p.name })}
                className="w-7 h-7 rounded-full text-red-300 hover:bg-red-900/50">✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2 mt-4">
        <button onClick={save} disabled={saving || !name.trim()} className="py-3 rounded-xl bg-green-600 hover:bg-green-500 font-semibold disabled:opacity-50">
          {saving ? t('lineups.saving') : dirty || isNew ? `💾 ${t('lineups.save')}` : `✓ ${t('lineups.saved')}`}
        </button>
        <button onClick={share} disabled={everyone.length === 0 && drawings.length === 0} className="py-3 rounded-xl bg-[#0866FF] hover:bg-[#0756d6] font-semibold disabled:opacity-50">
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

      {picking && (
        <PlayerPicker title={t(picking === 'bench' ? 'bench.add' : 'lineups.addPlayers')} players={available}
          onAdd={add} onAddGuest={addGuest} onClose={() => setPicking(null)} />
      )}

      {choosingFormation && canChooseFormation && (
        <FormationDialog onPitch={pitch.length} current={formation} onApply={applyFormation} onClose={() => setChoosingFormation(false)} />
      )}

      {swapped && (
        <BenchSwapDialog substitute={swapped} onPitch={pitch} onSwap={swap} onPutOn={putOnPitch} onRemove={removeSubstitute} onClose={() => setSwapping(null)} />
      )}

      {newTextAt && <BoardTextDialog color={color} onSubmit={addText} onClose={closeText} />}
      {editedText && (
        <BoardTextDialog
          color={editedText.color}
          initialText={editedText.text}
          onSubmit={(text, chosen) => { draw(editText(drawings, editedText.id, text, chosen)); closeText() }}
          onRemove={() => { draw(drawings.filter((d) => d.id !== editedText.id)); closeText() }}
          onClose={closeText}
        />
      )}

      {confirmClear && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setConfirmClear(false)}>
          <div role="dialog" aria-modal="true" className="bg-gray-800 rounded-xl p-6 w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold mb-5">{t('board.confirmClear')}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmClear(false)} className="flex-1 py-2 bg-gray-700 rounded font-semibold">{t('common.cancel')}</button>
              <button onClick={() => { draw(clearDrawn(drawings)); setConfirmClear(false) }} className="flex-1 py-2 bg-red-600 rounded font-semibold">{t('board.clear')}</button>
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
