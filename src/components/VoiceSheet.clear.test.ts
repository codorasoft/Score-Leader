import { clearCommand } from './VoiceSheet'
import type { VoiceCommand } from '../lib/voiceApi'

const cmd = (c: Partial<VoiceCommand>): VoiceCommand => ({ action: 'unknown', playerId: null, otherId: null, suspensionMinutes: null, candidates: [], otherCandidates: [], ...c })
const teams: Record<string, string> = { a: 'green', b: 'green', c: 'blue' }
const players = [
  { id: 'a', name: 'ليث', team: 'green', playing: true },
  { id: 'b', name: 'خالد', team: 'green', playing: true },
  { id: 'c', name: 'Omar', team: 'blue', playing: true },
]
const ctx = { cards: true, swaps: true, clockRunning: true, players, teamOf: (id: string | null) => (id ? teams[id] ?? null : null) }

it('saves on its own only what was named outright and can be done now', () => {
  expect(clearCommand(cmd({ action: 'goal', playerId: 'a' }), ctx)).toBe(true)
  expect(clearCommand(cmd({ action: 'goal', playerId: 'a', otherId: 'b' }), ctx)).toBe(true)
  expect(clearCommand(cmd({ action: 'interception', playerId: 'c' }), ctx)).toBe(true)
  expect(clearCommand(cmd({ action: 'red_card', playerId: 'c', suspensionMinutes: 2 }), ctx)).toBe(true)
  expect(clearCommand(cmd({ action: 'swap', playerId: 'a', otherId: 'c' }), ctx)).toBe(true)
  expect(clearCommand(cmd({ action: 'pause' }), ctx)).toBe(true)
})

it('asks whenever anything is a guess, missing, off or not possible now', () => {
  expect(clearCommand(cmd({ action: 'goal', candidates: ['a'] }), ctx)).toBe(false)
  expect(clearCommand(cmd({ action: 'goal', playerId: 'a', otherCandidates: ['b', 'c'] }), ctx)).toBe(false)
  expect(clearCommand(cmd({ action: 'red_card', playerId: 'c' }), ctx)).toBe(false)
  expect(clearCommand(cmd({ action: 'yellow_card', playerId: 'c' }), { ...ctx, cards: false })).toBe(false)
  expect(clearCommand(cmd({ action: 'swap', playerId: 'a', otherId: 'b' }), ctx)).toBe(false)
  expect(clearCommand(cmd({ action: 'swap', playerId: 'a' }), ctx)).toBe(false)
  expect(clearCommand(cmd({ action: 'resume' }), ctx)).toBe(false)
  expect(clearCommand(cmd({ action: 'undo' }), ctx)).toBe(false)
  expect(clearCommand(cmd({ action: 'unknown' }), ctx)).toBe(false)
})

it('holds back a goal whose spoken assist was not placed', () => {
  // «هدف ليث أسيست دجل» with ليث understood and the assister missed
  expect(clearCommand(cmd({ action: 'goal', playerId: 'a' }), { ...ctx, heard: 'هدف ليث أسيست دجل' })).toBe(false)
  expect(clearCommand(cmd({ action: 'goal', playerId: 'a' }), { ...ctx, heard: 'goal Omar assist mmm' })).toBe(false)
  // "and" joined to the assist word: «وأسيست», «وباص»
  expect(clearCommand(cmd({ action: 'goal', playerId: 'a' }), { ...ctx, heard: 'هدف ليث وأسيست دجل' })).toBe(false)
  expect(clearCommand(cmd({ action: 'goal', playerId: 'a' }), { ...ctx, heard: 'هدف ليث وباص دجل' })).toBe(false)
  // Placed, or never spoken of: clear
  expect(clearCommand(cmd({ action: 'goal', playerId: 'a', otherId: 'b' }), { ...ctx, heard: 'هدف ليث أسيست خالد' })).toBe(true)
  expect(clearCommand(cmd({ action: 'goal', playerId: 'a' }), { ...ctx, heard: 'هدف ليث' })).toBe(true)
})

it('holds back a goal whose assister came after «من» and was not placed', () => {
  // «هدف ليث من دجل»: an assist was spoken; saving it without one would lose it
  expect(clearCommand(cmd({ action: 'goal', playerId: 'a' }), { ...ctx, heard: 'هدف ليث من دجل' })).toBe(false)
  // «هدف من ليث»: no assist was spoken
  expect(clearCommand(cmd({ action: 'goal', playerId: 'a' }), { ...ctx, heard: 'هدف من ليث' })).toBe(true)
})

it('holds back a goal when the words before «من» name nobody on the roster', () => {
  // Praise or a misheard scorer: the roles are for the referee to confirm, even with both placed
  for (const [heard, named] of [['هدف رائع من ليث', 'a'], ['يا سلام هدف من ليث', 'a'], ['goal blorp from Omar', 'c'], ['what a goal from Omar', 'c']]) {
    expect(clearCommand(cmd({ action: 'goal', playerId: named }), { ...ctx, heard }), heard).toBe(false)
    expect(clearCommand(cmd({ action: 'goal', playerId: 'b', otherId: named }), { ...ctx, heard }), heard).toBe(false)
  }
  // A player's name before «من»: clear
  expect(clearCommand(cmd({ action: 'goal', playerId: 'a', otherId: 'b' }), { ...ctx, heard: 'هدف ليث من خالد' })).toBe(true)
})

it('holds back anything the referee corrected himself on', () => {
  expect(clearCommand(cmd({ action: 'goal', playerId: 'a' }), { ...ctx, heard: 'هدف العجل قصدي ليث' })).toBe(false)
  expect(clearCommand(cmd({ action: 'pause' }), { ...ctx, heard: 'كمل لا وقف' })).toBe(false)
})

it('holds back whatever was heard when listening was cut off, or the words were not final', () => {
  const goal = cmd({ action: 'goal', playerId: 'a' })
  expect(clearCommand(goal, { ...ctx, heard: 'هدف ليث', capture: { end: 'done', final: true } })).toBe(true)
  expect(clearCommand(goal, { ...ctx, heard: 'هدف ليث', capture: { end: 'done', final: false } })).toBe(false)
  expect(clearCommand(goal, { ...ctx, heard: 'هدف ليث', capture: { end: 'error', final: false } })).toBe(false)
  expect(clearCommand(goal, { ...ctx, heard: 'هدف ليث', capture: { end: 'timeout', final: true } })).toBe(false)
  expect(clearCommand(goal, { ...ctx, heard: 'هدف ليث', capture: { end: 'hidden', final: true } })).toBe(false)
  expect(clearCommand(cmd({ action: 'pause' }), { ...ctx, capture: { end: 'error', final: true } })).toBe(false)
})
