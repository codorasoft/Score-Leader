import { playerCard } from './playerCard'

const base = { stars: 3, position: 'MID' as const, matches: 0, goals: 0, assists: 0, wins: 0, cleanSheets: 0, form: undefined }

it('rates a player with no matches on their stars alone', () => {
  const card = playerCard(base)
  expect(card.overall).toBe(63)
  expect(card.tier).toBe('bronze')
  expect(card.attributes.map((a) => a.key)).toEqual(['SHO', 'PAS', 'WIN', 'FRM', 'EXP'])
})

it('shows form at the star level, not a made-up high, before a player has played', () => {
  const card = playerCard({ ...base, stars: 5 })
  expect(card.attributes.find((a) => a.key === 'FRM')!.value).toBe(75)
  expect(card.isNew).toBe(true)
  expect(playerCard({ ...base, matches: 1 }).isNew).toBe(false)
})

it('lets real stats count more as a player plays more', () => {
  const scorer = { ...base, matches: 10, goals: 6, wins: 3, form: 2.25 }
  const card = playerCard(scorer)
  expect(card.attributes.find((a) => a.key === 'SHO')!.value).toBe(93)
  expect(card.overall).toBe(66)
  expect(card.tier).toBe('silver')
  expect(playerCard({ ...scorer, matches: 3, goals: 2, wins: 1 }).overall).toBeLessThan(card.overall + 5)
})

it('gives goalkeepers a keeping rating from clean sheets instead of shooting', () => {
  const card = playerCard({ ...base, position: 'GK', matches: 10, cleanSheets: 5, wins: 7, form: 3.5 })
  expect(card.attributes.map((a) => a.key)).toEqual(['KEE', 'PAS', 'WIN', 'FRM', 'EXP'])
  expect(card.attributes[0].value).toBe(85)
})

it('reaches gold for an in-form, winning top scorer and never goes above 99', () => {
  const star = playerCard({ ...base, stars: 5, matches: 80, goals: 120, assists: 60, wins: 70, form: 5 })
  expect(star.tier).toBe('gold')
  expect(star.attributes.every((a) => a.value <= 99)).toBe(true)
  expect(star.overall).toBeLessThanOrEqual(99)
})
