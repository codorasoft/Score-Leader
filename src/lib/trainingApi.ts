import { supabase } from './supabase'
import { selectAllOrThrow as allRows } from './selectAll'

// The training catalog (types and their YouTube videos, kept by the superadmin) and a league's
// trainings. Linked rows are joined here, with one plain query per table.

export interface TrainingType { id: string; name: string; sort_order: number }
export interface TrainingVideo { id: string; type_id: string; title: string; youtube_id: string; sort_order: number }
export interface Catalog { types: TrainingType[]; videos: TrainingVideo[] }
export interface TrainingSummary { id: string; training_date: string; title: string | null; video_count: number }
export interface TrainingDetail {
  id: string
  training_date: string
  title: string | null
  // In saved order
  videos: (TrainingVideo & { type_name: string })[]
}
export type WriteResult = 'ok' | 'duplicate' | 'failed'

type OrderedTable = 'training_types' | 'training_videos'

const TYPE_COLUMNS = 'id, name, sort_order'
const VIDEO_COLUMNS = 'id, type_id, title, youtube_id, sort_order'
const UNIQUE_VIOLATION = '23505'

const result = (error: { code?: string } | null): WriteResult =>
  !error ? 'ok' : error.code === UNIQUE_VIOLATION ? 'duplicate' : 'failed'

// ===== Catalog

// Throws when a request fails. Types, and videos, each in list order.
export async function fetchCatalog(): Promise<Catalog> {
  // id last, so rows in the same place keep one order from page to page
  const [types, videos] = await Promise.all([
    allRows<TrainingType>((from, to) =>
      supabase.from('training_types').select(TYPE_COLUMNS).order('sort_order').order('created_at').order('id').range(from, to)),
    allRows<TrainingVideo>((from, to) =>
      supabase.from('training_videos').select(VIDEO_COLUMNS).order('sort_order').order('created_at').order('id').range(from, to)),
  ])
  return { types, videos }
}

// The place of a new row at the end of a list
export const nextSortOrder = (list: { sort_order: number }[]): number =>
  list.reduce((max, r) => Math.max(max, r.sort_order), -1) + 1

export async function addType(name: string, sortOrder: number): Promise<boolean> {
  const { error } = await supabase.from('training_types').insert({ name: name.trim(), sort_order: sortOrder })
  return !error
}

export async function renameType(id: string, name: string): Promise<boolean> {
  const { error } = await supabase.from('training_types').update({ name: name.trim() }).eq('id', id)
  return !error
}

// Its videos go with it, and leave every training that used them
export async function deleteType(id: string): Promise<boolean> {
  const { error } = await supabase.from('training_types').delete().eq('id', id)
  return !error
}

export async function addVideo(
  video: { type_id: string; title: string; youtube_id: string; sort_order: number },
): Promise<WriteResult> {
  const { error } = await supabase.from('training_videos').insert({ ...video, title: video.title.trim() })
  return result(error)
}

export async function updateVideo(id: string, video: { title: string; youtube_id: string }): Promise<WriteResult> {
  const { error } = await supabase.from('training_videos')
    .update({ title: video.title.trim(), youtube_id: video.youtube_id }).eq('id', id)
  return result(error)
}

export async function deleteVideo(id: string): Promise<boolean> {
  const { error } = await supabase.from('training_videos').delete().eq('id', id)
  return !error
}

// Moves a row past its neighbour by exchanging their places
export async function swapOrder(
  table: OrderedTable,
  a: { id: string; sort_order: number },
  b: { id: string; sort_order: number },
): Promise<boolean> {
  const [first, second] = await Promise.all([
    supabase.from(table).update({ sort_order: b.sort_order }).eq('id', a.id),
    supabase.from(table).update({ sort_order: a.sort_order }).eq('id', b.id),
  ])
  return !first.error && !second.error
}

// Throws when the request fails.
export async function countTrainingsUsing(videoId: string): Promise<number> {
  const { count, error } = await supabase.from('training_items')
    .select('training_id', { count: 'exact', head: true }).eq('video_id', videoId)
  if (error) throw error
  return count ?? 0
}

// ===== Trainings

// Throws when a request fails. Newest date first.
export async function fetchTrainings(leagueId: string): Promise<TrainingSummary[]> {
  const [trainings, items] = await Promise.all([
    allRows<{ id: string; training_date: string; title: string | null }>((from, to) =>
      supabase.from('trainings').select('id, training_date, title').eq('league_id', leagueId)
        .order('training_date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, to)),
    allRows<{ training_id: string }>((from, to) =>
      supabase.from('training_items').select('training_id').eq('league_id', leagueId)
        .order('training_id').order('video_id').range(from, to)),
  ])
  const counts: Record<string, number> = {}
  for (const i of items) counts[i.training_id] = (counts[i.training_id] ?? 0) + 1
  return trainings.map(({ id, training_date, title }) => ({ id, training_date, title, video_count: counts[id] ?? 0 }))
}

// Throws when a request fails; null means this league has no such training.
export async function fetchTraining(id: string, leagueId: string): Promise<TrainingDetail | null> {
  const { data: training, error } = await supabase.from('trainings')
    .select('id, training_date, title').eq('id', id).eq('league_id', leagueId).maybeSingle()
  if (error) throw error
  if (!training) return null
  const { id: trainingId, training_date, title } = training as { id: string; training_date: string; title: string | null }

  const items = await supabase.from('training_items').select('video_id, position').eq('training_id', id).order('position')
  if (items.error) throw items.error
  const videoIds = ((items.data ?? []) as { video_id: string }[]).map((i) => i.video_id)
  if (videoIds.length === 0) return { id: trainingId, training_date, title, videos: [] }

  const videos = await supabase.from('training_videos').select(VIDEO_COLUMNS).in('id', videoIds)
  if (videos.error) throw videos.error
  const byId = new Map(((videos.data ?? []) as TrainingVideo[]).map((v) => [v.id, v]))
  const types = await supabase.from('training_types').select(TYPE_COLUMNS).in('id', [...new Set([...byId.values()].map((v) => v.type_id))])
  if (types.error) throw types.error
  const typeNames = new Map(((types.data ?? []) as TrainingType[]).map((t) => [t.id, t.name]))

  return {
    id: trainingId,
    training_date,
    title,
    videos: videoIds.flatMap((videoId) => {
      const v = byId.get(videoId)
      return v ? [{ ...v, type_name: typeNames.get(v.type_id) ?? '' }] : []
    }),
  }
}

// Saves the training and its videos together (public.save_training); id null makes a new one.
// Returns the training's id, or null when the save was refused or failed.
export async function saveTraining(
  training: { id: string | null; leagueId: string; date: string; title: string; videoIds: string[] },
): Promise<string | null> {
  const { data, error } = await supabase.rpc('save_training', {
    p_id: training.id,
    p_league_id: training.leagueId,
    p_date: training.date,
    p_title: training.title.trim(),
    p_video_ids: training.videoIds,
  })
  return error ? null : (data as string | null)
}

export async function deleteTraining(id: string): Promise<boolean> {
  const { error } = await supabase.from('trainings').delete().eq('id', id)
  return !error
}
