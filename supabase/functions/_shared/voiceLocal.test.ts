import { understandLocally } from './voiceLocal'
import type { VoicePlayer } from './voiceCommand'

const roster: VoicePlayer[] = [
  { id: 'a', name: 'محمد العجل', team: 'green', playing: true },
  { id: 'b', name: 'محمد سالم', team: 'blue', playing: true },
  { id: 'c', name: 'ليث', team: 'blue', playing: true },
  { id: 'd', name: 'Sami', team: 'green', playing: true },
  { id: 'e', name: 'خالد', team: 'yellow', playing: false },
  { id: 'f', name: 'زيد الحسن', team: 'blue', playing: true },
  { id: 'g', name: 'عمر الحسن', team: 'green', playing: true },
  { id: 'h', name: 'Omar', team: 'green', playing: true },
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

it('understands the scorer named before the goal', () => {
  expect(understandLocally('العجل سجل جول', roster)).toMatchObject({ action: 'goal', playerId: 'a', otherId: null })
  expect(understandLocally('ليث سجل', roster)).toMatchObject({ action: 'goal', playerId: 'c' })
  expect(understandLocally('محمد العجل سجل هدف', roster)?.playerId).toBe('a')
})

it('understands a goal and its assister when both are named clearly', () => {
  expect(understandLocally('هدف ليث من زيد', roster)).toMatchObject({ action: 'goal', playerId: 'c', otherId: 'f' })
  expect(understandLocally('هدف ليث أسيست زيد', roster)).toMatchObject({ playerId: 'c', otherId: 'f' })
  expect(understandLocally('هدف ليث وأسيست زيد', roster)).toMatchObject({ playerId: 'c', otherId: 'f' })
  expect(understandLocally('هدف من ليث بتمريرة من زيد', roster)).toMatchObject({ playerId: 'c', otherId: 'f' })
  expect(understandLocally('goal Sami assist Omar', roster)).toMatchObject({ playerId: 'd', otherId: 'h' })
  // The same assist words as the rest of the app, with "and" or "then" joined to them
  expect(understandLocally('هدف ليث وصناعة زيد', roster)).toMatchObject({ playerId: 'c', otherId: 'f' })
  expect(understandLocally('هدف ليث فأسيست زيد', roster)).toMatchObject({ playerId: 'c', otherId: 'f' })
})

it('leaves «من» that says how the goal came to Claude', () => {
  expect(understandLocally('هدف ليث من بعيد', roster)).toBeNull()
})

it('leaves «من» after words it does not know to Claude, whoever is named after it', () => {
  // Praise, or a scorer's name misheard: the phone cannot tell, so it never picks the roles
  for (const t of ['هدف حلو من ليث', 'هدف رائع من زيد الحسن', 'يا سلام هدف من ليث', 'هدف طماطم من ليث', 'what a goal from Sami', 'goal blorp from Omar']) {
    expect(understandLocally(t, roster), t).toBeNull()
  }
})

it('leaves a referee who is not sure to Claude', () => {
  expect(understandLocally('هدف ليث ولا زيد', roster)).toBeNull()
  expect(understandLocally('goal Sami or Omar', roster)).toBeNull()
})

it('understands an interception or a yellow card for one clearly named player', () => {
  expect(understandLocally('قطع ليث', roster)).toMatchObject({ action: 'interception', playerId: 'c', otherId: null })
  expect(understandLocally('قطع كرة للعجل', roster)).toMatchObject({ action: 'interception', playerId: 'a' })
  expect(understandLocally('ليث قطع الكرة', roster)).toMatchObject({ action: 'interception', playerId: 'c' })
  expect(understandLocally('صفرا ليث', roster)).toMatchObject({ action: 'yellow_card', playerId: 'c', suspensionMinutes: null })
  expect(understandLocally('صفرا للعجل', roster)).toMatchObject({ action: 'yellow_card', playerId: 'a' })
  expect(understandLocally('yellow card Sami', roster)).toMatchObject({ action: 'yellow_card', playerId: 'd' })
})

it('leaves anything unsure to Claude', () => {
  // Two players called محمد
  expect(understandLocally('هدف محمد', roster)).toBeNull()
  // Not playing in this match
  expect(understandLocally('هدف خالد', roster)).toBeNull()
  expect(understandLocally('قطع خالد', roster)).toBeNull()
  // A correction, a negation or another action
  expect(understandLocally('هدف محمد قصدي ليث', roster)).toBeNull()
  expect(understandLocally('مش هدف قطع كرة للعجل', roster)).toBeNull()
  expect(understandLocally('وقف ليث', roster)).toBeNull()
  // A misheard name
  expect(understandLocally('هدف دجل', roster)).toBeNull()
  expect(understandLocally('هدف', roster)).toBeNull()
})

it('leaves an assist that is unclear, on the other team or the scorer himself to Claude', () => {
  // «هدف ليث من دجل»: the assist was spoken but not understood
  expect(understandLocally('هدف ليث من دجل', roster)).toBeNull()
  expect(understandLocally('هدف ليث من سامي', roster)).toBeNull()
  expect(understandLocally('هدف ليث من ليث', roster)).toBeNull()
  // A family name two players share
  expect(understandLocally('هدف ليث من الحسن', roster)).toBeNull()
  // A passing verb, or the assister named first: the order needs Claude
  expect(understandLocally('هدف ليث وباص زيد', roster)).toBeNull()
  expect(understandLocally('أسيست زيد هدف ليث', roster)).toBeNull()
})

it('leaves shared names, numbers, own goals and red cards to Claude', () => {
  expect(understandLocally('هدف الحسن', roster)).toBeNull()
  expect(understandLocally('صفرا محمد', roster)).toBeNull()
  expect(understandLocally('هدف عكسي ليث', roster)).toBeNull()
  expect(understandLocally('ليث سجل بمرماه', roster)).toBeNull()
  expect(understandLocally('حمرا ليث', roster)).toBeNull()
  expect(understandLocally('صفرا ليث ٢', roster)).toBeNull()
})

it('leaves it to Claude when the recognizer\'s other guesses do not say the same', () => {
  expect(understandLocally('هدف ليث', roster, ['هدف ليث'])?.playerId).toBe('c')
  expect(understandLocally('هدف ليث', roster, ['هدف زيد'])).toBeNull()
  expect(understandLocally('صفرا ليث', roster, ['حمرا ليث'])).toBeNull()
  // Even a guess that names nobody: the recognizer was not sure
  expect(understandLocally('هدف ليث', roster, ['هدف ليس'])).toBeNull()
})
