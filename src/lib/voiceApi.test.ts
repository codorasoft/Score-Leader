import { vi } from 'vitest'

const invoke = vi.fn()
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }))

import { understandVoice } from './voiceApi'

const input = { leagueId: 'l1', text: 'هدف العجل', alternatives: [], lang: 'ar' as const, players: [] }

afterEach(() => { vi.useRealTimers(); invoke.mockReset() })

it('gives up on a stalled connection instead of thinking for ever', async () => {
  vi.useFakeTimers()
  invoke.mockReturnValue(new Promise(() => {}))
  const res = understandVoice(input)
  await vi.advanceTimersByTimeAsync(15_000)
  await expect(res).resolves.toEqual({ ok: false, error: 'network' })
})

it('passes on an answer that comes in time', async () => {
  invoke.mockResolvedValue({ data: { command: { action: 'pause' } }, error: null })
  await expect(understandVoice(input)).resolves.toMatchObject({ ok: true, command: { action: 'pause', playerId: null } })
})
