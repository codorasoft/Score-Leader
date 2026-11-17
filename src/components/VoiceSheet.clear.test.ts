import { clearCommand } from './VoiceSheet'
import type { VoiceCommand } from '../lib/voiceApi'

const cmd = (c: Partial<VoiceCommand>): VoiceCommand => ({ action: 'unknown', playerId: null, otherId: null, suspensionMinutes: null, candidates: [], otherCandidates: [], ...c })
const teams: Record<string, string> = { a: 'green', b: 'green', c: 'blue' }
const ctx = { cards: true, swaps: true, clockRunning: true, teamOf: (id: string | null) => (id ? teams[id] ?? null : null) }

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
