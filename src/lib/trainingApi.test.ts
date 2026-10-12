import { vi } from 'vitest'
import { db, resetDb, rows } from '../test/fakeSupabase'

vi.mock('./supabase', async () => (await import('../test/fakeSupabase')).supabaseModule)

import {
  addType, addVideo, countTrainingsUsing, deleteTraining, deleteType, deleteVideo, fetchCatalog, fetchTraining,
  fetchTrainings, nextSortOrder, renameType, saveTraining, swapOrder, updateVideo,
} from './trainingApi'

const catalog = () => ({
  training_types: [
    { id: 't2', name: 'Shooting', sort_order: 10, created_at: '2026-10-01T10:00:00Z' },
    { id: 't1', name: 'Passing', sort_order: 2, created_at: '2026-10-02T10:00:00Z' },
  ],
  training_videos: [
    { id: 'v2', type_id: 't1', title: 'Wall pass', youtube_id: 'aqz-KE-bpKQ', sort_order: 10, created_at: '2026-10-01T10:00:00Z' },
    { id: 'v1', type_id: 't1', title: 'Rondo', youtube_id: 'dQw4w9WgXcQ', sort_order: 2, created_at: '2026-10-02T10:00:00Z' },
    { id: 'v3', type_id: 't2', title: 'Volleys', youtube_id: 'abcdefghijk', sort_order: 0, created_at: '2026-10-03T10:00:00Z' },
  ],
})

describe('catalog', () => {
  it('reads types and videos in their order, numbers as numbers', async () => {
    resetDb(catalog())
    const { types, videos } = await fetchCatalog()
    expect(types.map((t) => t.name)).toEqual(['Passing', 'Shooting'])
    expect(videos.map((v) => v.title)).toEqual(['Volleys', 'Rondo', 'Wall pass'])
  })

  it('throws when the catalog cannot be read', async () => {
    resetDb(catalog())
    db.errors.training_videos = { message: 'offline' }
    await expect(fetchCatalog()).rejects.toBeTruthy()
  })

  it('the next place is after the last one', () => {
    expect(nextSortOrder([])).toBe(0)
    expect(nextSortOrder([{ sort_order: 4 }, { sort_order: 9 }])).toBe(10)
  })

  it('adds, renames and deletes a type', async () => {
    resetDb(catalog())
    expect(await addType('  Warm-up ', 11)).toBe(true)
    expect(rows('training_types').at(-1)).toMatchObject({ name: 'Warm-up', sort_order: 11 })
    expect(await renameType('t1', ' Short passing ')).toBe(true)
    expect(rows('training_types').find((t) => t.id === 't1')).toMatchObject({ name: 'Short passing' })
    expect(await deleteType('t2')).toBe(true)
    expect(rows('training_types').map((t) => t.id)).not.toContain('t2')
  })

  it('adds a video with its id, not its link', async () => {
    resetDb(catalog())
    expect(await addVideo({ type_id: 't2', title: ' Finishing ', youtube_id: 'ZZZZZZZZZZZ', sort_order: 1 })).toBe('ok')
    expect(db.writes.at(-1)).toMatchObject({
      table: 'training_videos', op: 'insert',
      values: { type_id: 't2', title: 'Finishing', youtube_id: 'ZZZZZZZZZZZ', sort_order: 1 },
    })
  })

  it('tells a duplicate video from another failure', async () => {
    resetDb(catalog())
    db.errors.training_videos = { message: 'duplicate key value violates unique constraint', code: '23505' }
    expect(await addVideo({ type_id: 't1', title: 'Rondo', youtube_id: 'dQw4w9WgXcQ', sort_order: 11 })).toBe('duplicate')
    expect(await updateVideo('v2', { title: 'Rondo', youtube_id: 'dQw4w9WgXcQ' })).toBe('duplicate')
    db.errors.training_videos = { message: 'new row violates row-level security policy' }
    expect(await addVideo({ type_id: 't1', title: 'Rondo', youtube_id: 'dQw4w9WgXcQ', sort_order: 11 })).toBe('failed')
    expect(await updateVideo('v2', { title: 'Rondo', youtube_id: 'dQw4w9WgXcQ' })).toBe('failed')
  })

  it('changes and deletes a video', async () => {
    resetDb(catalog())
    expect(await updateVideo('v1', { title: ' Rondo 4v2 ', youtube_id: 'aaaaaaaaaaa' })).toBe('ok')
    expect(rows('training_videos').find((v) => v.id === 'v1')).toMatchObject({ title: 'Rondo 4v2', youtube_id: 'aaaaaaaaaaa', type_id: 't1' })
    expect(await deleteVideo('v1')).toBe(true)
    expect(rows('training_videos').map((v) => v.id)).toEqual(['v2', 'v3'])
  })

  it('swaps the places of two rows', async () => {
    resetDb({ training_types: [{ id: 'a', name: 'A', sort_order: 0 }, { id: 'b', name: 'B', sort_order: 1 }] })
    expect(await swapOrder('training_types', { id: 'a', sort_order: 0 }, { id: 'b', sort_order: 1 })).toBe(true)
    expect(rows('training_types')).toMatchObject([{ id: 'a', sort_order: 1 }, { id: 'b', sort_order: 0 }])
  })

  it('counts the trainings that use a video', async () => {
    resetDb({
      training_items: [
        { training_id: 'x1', video_id: 'v1' }, { training_id: 'x2', video_id: 'v1' }, { training_id: 'x1', video_id: 'v2' },
      ],
    })
    expect(await countTrainingsUsing('v1')).toBe(2)
    expect(await countTrainingsUsing('v9')).toBe(0)
  })
})

const withTrainings = () => ({
  ...catalog(),
  trainings: [
    { id: 'x1', league_id: 'L1', training_date: '2026-10-10', title: 'Friday', created_at: '2026-10-01T10:00:00Z' },
    { id: 'x2', league_id: 'L1', training_date: '2026-10-12', title: null, created_at: '2026-10-02T10:00:00Z' },
    { id: 'x3', league_id: 'L2', training_date: '2026-10-12', title: 'Not ours', created_at: '2026-10-03T10:00:00Z' },
  ],
  training_items: [
    { training_id: 'x1', video_id: 'v3', position: 1, league_id: 'L1' },
    { training_id: 'x1', video_id: 'v1', position: 0, league_id: 'L1' },
    { training_id: 'x3', video_id: 'v1', position: 0, league_id: 'L2' },
  ],
})

describe('trainings', () => {
  it("lists this league's trainings, newest date first, with video counts", async () => {
    resetDb(withTrainings())
    expect(await fetchTrainings('L1')).toEqual([
      { id: 'x2', training_date: '2026-10-12', title: null, video_count: 0 },
      { id: 'x1', training_date: '2026-10-10', title: 'Friday', video_count: 2 },
    ])
  })

  it('reads one training with its videos in saved order and their type names', async () => {
    resetDb(withTrainings())
    const training = await fetchTraining('x1', 'L1')
    expect(training).toMatchObject({ id: 'x1', training_date: '2026-10-10', title: 'Friday' })
    expect(training!.videos).toMatchObject([
      { id: 'v1', title: 'Rondo', youtube_id: 'dQw4w9WgXcQ', type_name: 'Passing' },
      { id: 'v3', title: 'Volleys', youtube_id: 'abcdefghijk', type_name: 'Shooting' },
    ])
  })

  it('a training without videos has none, and another league’s training is not found', async () => {
    resetDb(withTrainings())
    expect((await fetchTraining('x2', 'L1'))!.videos).toEqual([])
    expect(await fetchTraining('x1', 'L2')).toBeNull()
    expect(await fetchTraining('nope', 'L1')).toBeNull()
  })

  it('saves through the database function with the picks in order and a trimmed title', async () => {
    resetDb()
    db.rpcResults.save_training = { data: 'x9', error: null }
    const id = await saveTraining({ id: null, leagueId: 'L1', date: '2026-10-12', title: ' Passing ', videoIds: ['v2', 'v1'] })
    expect(id).toBe('x9')
    expect(db.rpcs).toEqual([{
      fn: 'save_training',
      args: { p_id: null, p_league_id: 'L1', p_date: '2026-10-12', p_title: 'Passing', p_video_ids: ['v2', 'v1'] },
    }])
  })

  it('a refused save returns no id', async () => {
    resetDb()
    db.rpcResults.save_training = { data: null, error: { message: 'training not found' } }
    expect(await saveTraining({ id: 'x1', leagueId: 'L1', date: '2026-10-12', title: '', videoIds: [] })).toBeNull()
  })

  it('deletes a training', async () => {
    resetDb(withTrainings())
    expect(await deleteTraining('x1')).toBe(true)
    expect(rows('trainings').map((t) => t.id)).toEqual(['x2', 'x3'])
  })
})
