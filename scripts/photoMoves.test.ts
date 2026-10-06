import { describe, expect, it } from 'vitest'
import { groupMovesByFrom, planPhotoMoves, strayObjects } from './photoMoves.ts'

const P = 'https://x.supabase.co/storage/v1/object/public/player-photos/'
const L = '11111111-1111-1111-1111-111111111111'

describe('planPhotoMoves', () => {
  it('moves legacy photos into the league folder', () =>
    expect(planPhotoMoves([{ id: 'p1', league_id: L, photo_url: P + 'players/p1-1.jpg' }], P))
      .toEqual([{ playerId: 'p1', from: 'players/p1-1.jpg', to: `${L}/players/p1-1.jpg` }]))
  it('skips photos already in a league folder, external links and empty photos (safe to re-run)', () =>
    expect(planPhotoMoves([
      { id: 'a', league_id: L, photo_url: `${P}${L}/players/a.jpg` },
      { id: 'b', league_id: L, photo_url: 'https://elsewhere.com/b.jpg' },
      { id: 'c', league_id: L, photo_url: null },
    ], P)).toEqual([]))
  it('decodes URI components in the path', () =>
    expect(planPhotoMoves([{ id: 'p', league_id: L, photo_url: P + 'players/a%20b.jpg' }], P)[0].from)
      .toBe('players/a b.jpg'))
})

describe('strayObjects', () => {
  it('lists unreferenced legacy objects', () =>
    expect(strayObjects(['players/a.jpg', 'players/b.jpg', `${L}/players/c.jpg`], new Set(['players/a.jpg']))).toEqual(['players/b.jpg']))
})

describe('groupMovesByFrom', () => {
  it('groups players sharing one legacy path into a single group', () => {
    const L2 = '22222222-2222-2222-2222-222222222222'
    const moves = planPhotoMoves([
      { id: 'a', league_id: L, photo_url: P + 'players/shared.jpg' },
      { id: 'b', league_id: L2, photo_url: P + 'players/shared.jpg' },
      { id: 'c', league_id: L, photo_url: P + 'players/c.jpg' },
    ], P)
    expect(groupMovesByFrom(moves)).toEqual([
      { from: 'players/shared.jpg', targets: [
        { playerId: 'a', to: `${L}/players/shared.jpg` },
        { playerId: 'b', to: `${L2}/players/shared.jpg` },
      ] },
      { from: 'players/c.jpg', targets: [{ playerId: 'c', to: `${L}/players/c.jpg` }] },
    ])
  })
})
