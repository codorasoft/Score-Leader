import { understandLocally } from './voiceLocal'
import type { VoicePlayer } from './voiceCommand'

const roster: VoicePlayer[] = [
  { id: 'a', name: 'محمد العجل', team: 'green', playing: true },
  { id: 'b', name: 'محمد سالم', team: 'blue', playing: true },
  { id: 'c', name: 'ليث', team: 'blue', playing: true },
  { id: 'd', name: 'Sami', team: 'green', playing: true },
  { id: 'e', name: 'خالد', team: 'yellow', playing: false },
]

it('understands the clock and undo words on their own', () => {
  expect(understandLocally('وقّف', roster)?.action).toBe('pause')
  expect(understandLocally('وقف الساعة', roster)?.action).toBe('pause')
  expect(understandLocally('كمل', roster)?.action).toBe('resume')
  expect(understandLocally('Pause', roster)?.action).toBe('pause')
  expect(understandLocally('الغي', roster)?.action).toBe('undo')
})

it('understands a goal by one clearly named player', () => {
  expect(understandLocally('هدف العجل', roster)).toMatchObject({ action: 'goal', playerId: 'a', otherId: null })
  expect(understandLocally('هدف محمد العجل', roster)?.playerId).toBe('a')
  expect(understandLocally('هدف من ليث', roster)?.playerId).toBe('c')
  expect(understandLocally('جول لليث', roster)?.playerId).toBe('c')
  expect(understandLocally('هدف للعجل', roster)?.playerId).toBe('a')
  expect(understandLocally('goal sami', roster)?.playerId).toBe('d')
})

it('leaves anything unsure to Claude', () => {
  // Two players called محمد
  expect(understandLocally('هدف محمد', roster)).toBeNull()
  // Not playing in this match
  expect(understandLocally('هدف خالد', roster)).toBeNull()
  // A second player, a correction, or another action
  expect(understandLocally('هدف ليث من سامي', roster)).toBeNull()
  expect(understandLocally('هدف ليث أسيست سامي', roster)).toBeNull()
  expect(understandLocally('هدف محمد قصدي ليث', roster)).toBeNull()
  expect(understandLocally('مش هدف قطع كرة للعجل', roster)).toBeNull()
  expect(understandLocally('صفرا ليث', roster)).toBeNull()
  expect(understandLocally('وقف ليث', roster)).toBeNull()
  // A misheard name
  expect(understandLocally('هدف دجل', roster)).toBeNull()
  expect(understandLocally('هدف', roster)).toBeNull()
})
