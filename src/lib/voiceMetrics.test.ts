import { noteVoiceUndo, startVoiceAttempt, summarizeVoice, voiceAttempts } from './voiceMetrics'

// A clock the test moves by hand
let now = 0
const clock = () => now

beforeEach(() => {
  localStorage.clear()
  now = 1_000
})

it('keeps timings from the press, and never the words or names', () => {
  const a = startVoiceAttempt('hold', clock)
  now = 1_300; a.micOn()
  now = 1_900; a.firstWords()
  now = 2_000; a.speechEnded()
  now = 2_400; a.heard({ text: 'هدف ليث من زيد', alternatives: ['هدف ليس من زيد'], end: 'done', final: true, restarts: 1 })
  a.interpreted('local')
  now = 2_410; a.shown()
  a.finish('confirmed', true)

  const [saved] = voiceAttempts()
  expect(saved).toMatchObject({
    mode: 'hold', micMs: 300, firstWordsMs: 900, end: 'done', final: true, words: 4, alternatives: 1, restarts: 1,
    interpreter: 'local', serverMs: null, resultMs: 410, outcome: 'confirmed', corrected: true, undone: false,
  })
  expect(JSON.stringify(voiceAttempts())).not.toMatch(/ليث|زيد|هدف/)
})

it('measures the server round trip and Claude\'s part of it apart', () => {
  const a = startVoiceAttempt('tap', clock)
  now = 1_500; a.speechEnded()
  a.heard({ text: 'goal mmm', alternatives: [], end: 'done', final: true, restarts: 0 })
  a.asking()
  now = 3_100; a.interpreted('server', { modelMs: 900 })
  a.shown()
  a.finish('auto-saved')
  expect(voiceAttempts()[0]).toMatchObject({ interpreter: 'server', serverMs: 1_600, modelMs: 900, resultMs: 1_600 })
})

it('records why it failed: the mic, or the server', () => {
  const a = startVoiceAttempt('tap', clock)
  a.heard('denied')
  a.finish('closed')
  const b = startVoiceAttempt('tap', clock)
  b.heard({ text: 'هدف', alternatives: [], end: 'hidden', final: false, restarts: 0 })
  b.asking()
  b.interpreted('server', { error: 'timeout' })
  b.finish('retried')
  expect(voiceAttempts().map((x) => [x.end, x.serverError, x.outcome])).toEqual([['denied', null, 'closed'], ['hidden', 'timeout', 'retried']])
})

it('counts a press as a hold only once it is known to be one, and sums up taps and holds', () => {
  // Every press starts the same way; only letting go (or losing the hold) after a while makes it one
  const tap = startVoiceAttempt('tap', clock)
  tap.finish('confirmed')
  const hold = startVoiceAttempt('tap', clock)
  hold.held()
  hold.finish('confirmed')
  // Known only after the outcome: too late for this attempt
  const late = startVoiceAttempt('tap', clock)
  late.finish('closed')
  late.held()
  expect(voiceAttempts().map((x) => x.mode)).toEqual(['tap', 'hold', 'tap'])
  expect(summarizeVoice(voiceAttempts()).modes).toEqual({ tap: 2, hold: 1 })
})

it('takes the first outcome: a closed sheet after an auto-save is still an auto-save', () => {
  const a = startVoiceAttempt('tap', clock)
  a.finish('auto-saved')
  a.finish('closed')
  expect(voiceAttempts()).toHaveLength(1)
  expect(voiceAttempts()[0].outcome).toBe('auto-saved')
})

it('notes an Undo straight after an auto-save', () => {
  startVoiceAttempt('tap', clock).finish('auto-saved')
  noteVoiceUndo()
  expect(voiceAttempts()[0].undone).toBe(true)
  // Nothing to mark after a confirmed one
  startVoiceAttempt('tap', clock).finish('confirmed')
  noteVoiceUndo()
  expect(voiceAttempts()[1].undone).toBe(false)
})

it('keeps the last 50 attempts', () => {
  for (let i = 0; i < 55; i++) startVoiceAttempt('tap', clock).finish('closed')
  expect(voiceAttempts()).toHaveLength(50)
})

it('works without storage', () => {
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  expect(() => startVoiceAttempt('tap', clock).finish('closed')).not.toThrow()
  expect(voiceAttempts()).toEqual([])
  get.mockRestore()
  set.mockRestore()
})

it('sums up medians, with the phone and the server apart', () => {
  const run = (how: 'local' | 'server', resultMs: number, extra: { modelMs?: number } = {}) => {
    now = 0
    const a = startVoiceAttempt('tap', clock)
    now = 200; a.micOn()
    now = 1_000; a.speechEnded()
    a.heard({ text: 'x', alternatives: [], end: 'done', final: true, restarts: 0 })
    a.asking()
    now = 1_000 + resultMs; a.interpreted(how, extra); a.shown()
    a.finish('confirmed')
  }
  run('local', 10)
  run('local', 30)
  run('server', 1_200, { modelMs: 700 })
  run('server', 1_800, { modelMs: 900 })
  run('server', 1_500, { modelMs: 800 })
  expect(summarizeVoice(voiceAttempts())).toMatchObject({
    attempts: 5, local: 2, server: 3,
    medianMs: { micOn: 200, localResult: 20, serverResult: 1_500, model: 800 },
    ends: { done: 5 },
  })
})
