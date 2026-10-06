import { FEATURES, isValidFeatureList, setFeature } from './features.ts'

it('turning voting on also turns awards on', () => expect(setFeature([], 'voting', true)).toEqual(['awards', 'voting']))
it('turning awards off also turns voting off', () => expect(setFeature(['awards', 'voting', 'records'], 'awards', false)).toEqual(['records']))
it('turning badges on adds profiles; potm on adds leaderboard', () => {
  expect(setFeature([], 'badges', true)).toEqual(['profiles', 'badges'])
  expect(setFeature([], 'potm', true)).toEqual(['leaderboard', 'potm'])
})
it('accepts all 14 keys', () => {
  expect(FEATURES).toHaveLength(14)
  expect(isValidFeatureList([...FEATURES])).toBe(true)
})
it('rejects unknown keys, duplicates and broken dependencies', () => {
  expect(isValidFeatureList(['cards', 'nope'])).toBe(false)
  expect(isValidFeatureList(['cards', 'cards'])).toBe(false)
  expect(isValidFeatureList(['voting'])).toBe(false)
  expect(isValidFeatureList('cards')).toBe(false)
})
