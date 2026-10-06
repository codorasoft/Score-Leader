import { switchLeaguePath, readLastLeague } from './leaguePaths'

describe('switchLeaguePath', () => {
  it.each([
    ['/admin/eagles/players', '/admin/tigers/players'],
    ['/admin/eagles/sessions/new', '/admin/tigers/sessions/new'],
    ['/admin/eagles/sessions/abc/match/def', '/admin/tigers/history'],
    ['/admin/eagles/lineups/xyz', '/admin/tigers/history'],
    ['/admin/eagles/settings', '/admin/tigers/settings'],
    ['/admin/eagles/history', '/admin/tigers/history'],
    ['/admin/eagles/lineups', '/admin/tigers/lineups'],
  ])('%s -> %s', (from, to) => {
    expect(switchLeaguePath(from, 'tigers')).toBe(to)
  })
})

describe('readLastLeague', () => {
  it('returns null when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readLastLeague()).toBeNull()
    spy.mockRestore()
  })
})
