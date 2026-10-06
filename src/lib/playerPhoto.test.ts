import { photoPath, storagePathFromUrl } from './playerPhoto'

it('names uploads per player with a timestamp so a new photo never shows a cached old one', () => {
  expect(photoPath('L', 'p1', 1700000000000)).toBe('L/players/p1-1700000000000.jpg')
})

describe('storagePathFromUrl', () => {
  it('finds the file path inside the player-photos folder', () => {
    expect(storagePathFromUrl('https://abc.supabase.co/storage/v1/object/public/player-photos/players/p1-1.jpg'))
      .toBe('players/p1-1.jpg')
  })
  it('ignores photos hosted anywhere else', () => {
    expect(storagePathFromUrl('https://example.com/me.jpg')).toBeNull()
    expect(storagePathFromUrl(null)).toBeNull()
  })
})
