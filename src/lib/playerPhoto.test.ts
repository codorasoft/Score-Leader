import { squareCrop, photoPath, storagePathFromUrl } from './playerPhoto'

describe('squareCrop', () => {
  it('takes the centre square of a portrait photo', () => {
    expect(squareCrop(1000, 1600)).toEqual({ sx: 0, sy: 300, size: 1000 })
  })
  it('takes the centre square of a landscape photo', () => {
    expect(squareCrop(1600, 900)).toEqual({ sx: 350, sy: 0, size: 900 })
  })
})

it('names uploads per player with a timestamp so a new photo never shows a cached old one', () => {
  expect(photoPath('p1', 1700000000000)).toBe('players/p1-1700000000000.jpg')
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
