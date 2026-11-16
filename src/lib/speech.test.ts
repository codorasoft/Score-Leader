import { vi } from 'vitest'
import { listenOnce, speechLang, speechSupported } from './speech'

// A stand-in for the browser's SpeechRecognition that the test drives by hand
class FakeRecognition {
  static last: FakeRecognition
  lang = ''
  interimResults = false
  maxAlternatives = 1
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  onstart: (() => void) | null = null
  started = false
  // A browser that goes quiet: never says it started, or never says it ended
  static noStart = false
  static noEnd = false
  aborted = false
  constructor() { FakeRecognition.last = this }
  start() { this.started = true; if (!FakeRecognition.noStart) this.onstart?.() }
  stop() { if (!FakeRecognition.noEnd) this.onend?.() }
  abort() { this.aborted = true; this.onerror?.({ error: 'aborted' }); if (!FakeRecognition.noEnd) this.onend?.() }
  // Each part is one result; a part given as a list carries the recognizer's other guesses
  say(...parts: (string | string[])[]) {
    const results = parts.map((p) => {
      const guesses = (Array.isArray(p) ? p : [p]).map((transcript) => ({ transcript }))
      return Object.assign(guesses, { isFinal: true })
    })
    this.onresult?.({ resultIndex: 0, results })
  }
}

const w = globalThis as unknown as { webkitSpeechRecognition?: unknown }
beforeEach(() => {
  w.webkitSpeechRecognition = FakeRecognition
  FakeRecognition.noStart = false
  FakeRecognition.noEnd = false
})
afterEach(() => { delete w.webkitSpeechRecognition })

it('picks the recognition language from the app language', () => {
  expect(speechLang('ar')).toBe('ar-JO')
  expect(speechLang('en')).toBe('en-US')
})

it('is unsupported without SpeechRecognition', () => {
  expect(speechSupported()).toBe(true)
  delete w.webkitSpeechRecognition
  expect(speechSupported()).toBe(false)
})

it('streams what it hears and resolves with the whole text when it ends', async () => {
  const seen: string[] = []
  const l = listenOnce('ar-JO', (t) => seen.push(t))
  const rec = FakeRecognition.last
  expect(rec).toMatchObject({ started: true, lang: 'ar-JO', interimResults: true })
  rec.say('هدف ', 'أحمد')
  l.stop()
  await expect(l.done).resolves.toEqual({ text: 'هدف أحمد', alternatives: [] })
  expect(seen).toEqual(['هدف أحمد'])
})

it('keeps the other guesses, which often spell a name better', async () => {
  const l = listenOnce('ar-JO', () => {})
  const rec = FakeRecognition.last
  expect(rec.maxAlternatives).toBe(3)
  rec.say(['هدف من ليث', 'هدف ملايث', 'هدف من ليث'])
  l.stop()
  await expect(l.done).resolves.toEqual({ text: 'هدف من ليث', alternatives: ['هدف ملايث'] })
})

it('reports a blocked microphone', async () => {
  const l = listenOnce('en-US', () => {})
  const rec = FakeRecognition.last
  rec.onerror?.({ error: 'not-allowed' })
  rec.onend?.()
  await expect(l.done).rejects.toBe('denied')
})

it('cancel gives back nothing', async () => {
  const l = listenOnce('en-US', () => {})
  FakeRecognition.last.say('goal')
  l.cancel()
  await expect(l.done).resolves.toEqual({ text: '', alternatives: [] })
})

it('says when the mic is really on', () => {
  const onReady = vi.fn()
  listenOnce('ar-JO', () => {}, { onReady })
  expect(onReady).toHaveBeenCalledTimes(1)
})

it('push to talk: a pause while the mic is held listens on and keeps what was said', async () => {
  let held = true
  const seen: string[] = []
  const onReady = vi.fn()
  const l = listenOnce('ar-JO', (t) => seen.push(t), { onReady, keepListening: () => held })
  const first = FakeRecognition.last
  first.say('هدف')
  // The recognizer ends on its own at the pause
  first.onend?.()
  const second = FakeRecognition.last
  expect(second).not.toBe(first)
  expect(second.started).toBe(true)
  // Ready is said once, not again for each round
  expect(onReady).toHaveBeenCalledTimes(1)
  second.say(['العجل', 'الدجل'])
  held = false
  l.stop()
  await expect(l.done).resolves.toEqual({ text: 'هدف العجل', alternatives: ['هدف الدجل'] })
  expect(seen).toEqual(['هدف', 'هدف العجل'])
})

it('a tap ends at the first pause, as before', async () => {
  const l = listenOnce('ar-JO', () => {}, { keepListening: () => false })
  const rec = FakeRecognition.last
  rec.say('هدف')
  rec.onend?.()
  expect(FakeRecognition.last).toBe(rec)
  await expect(l.done).resolves.toEqual({ text: 'هدف', alternatives: [] })
})

it('stops trying again when the mic is refused', async () => {
  const l = listenOnce('ar-JO', () => {}, { keepListening: () => true })
  const rec = FakeRecognition.last
  rec.onerror?.({ error: 'not-allowed' })
  rec.onend?.()
  expect(FakeRecognition.last).toBe(rec)
  await expect(l.done).rejects.toBe('denied')
})

describe('never waits on the browser for ever', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('gives up when the mic never starts', async () => {
    FakeRecognition.noStart = true
    const l = listenOnce('ar-JO', () => {})
    const rec = FakeRecognition.last
    const result = expect(l.done).rejects.toBe('failed')
    await vi.advanceTimersByTimeAsync(6_000)
    await result
    expect(rec.aborted).toBe(true)
  })

  it('keeps what was heard when the browser never says it ended after Done', async () => {
    FakeRecognition.noEnd = true
    const l = listenOnce('ar-JO', () => {})
    FakeRecognition.last.say('هدف العجل')
    l.stop()
    await vi.advanceTimersByTimeAsync(2_500)
    await expect(l.done).resolves.toEqual({ text: 'هدف العجل', alternatives: [] })
  })

  it('a tap with the mic on and nothing coming ends as nothing heard', async () => {
    FakeRecognition.noEnd = true
    const l = listenOnce('ar-JO', () => {})
    const result = expect(l.done).rejects.toBe('no-speech')
    await vi.advanceTimersByTimeAsync(8_000 + 2_500)
    await result
    expect(FakeRecognition.last.aborted).toBe(true)
  })

  it('a quiet stretch does not end a held mic, but letting go does', async () => {
    FakeRecognition.noEnd = true
    let held = true
    const l = listenOnce('ar-JO', () => {}, { keepListening: () => held })
    let ended = false
    void l.done.then(() => { ended = true }, () => { ended = true })
    FakeRecognition.last.say('هدف')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(ended).toBe(false)
    held = false
    l.stop()
    await vi.advanceTimersByTimeAsync(2_500)
    await expect(l.done).resolves.toEqual({ text: 'هدف', alternatives: [] })
  })

  it('shows a mic error at once, even while the mic is held and the browser never ends', async () => {
    FakeRecognition.noEnd = true
    const l = listenOnce('ar-JO', () => {}, { keepListening: () => true })
    const rec = FakeRecognition.last
    rec.onerror?.({ error: 'network' })
    await expect(l.done).rejects.toBe('network')
    expect(rec.aborted).toBe(true)
  })

  it('keeps what was heard when the mic fails part way', async () => {
    FakeRecognition.noEnd = true
    const l = listenOnce('ar-JO', () => {}, { keepListening: () => true })
    FakeRecognition.last.say('هدف العجل')
    FakeRecognition.last.onerror?.({ error: 'audio-capture' })
    await expect(l.done).resolves.toEqual({ text: 'هدف العجل', alternatives: [] })
  })

  it('a quiet spell (no-speech) while held does not end it', async () => {
    FakeRecognition.noEnd = true
    let ended = false
    const l = listenOnce('ar-JO', () => {}, { keepListening: () => true })
    void l.done.then(() => { ended = true }, () => { ended = true })
    FakeRecognition.last.onerror?.({ error: 'no-speech' })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(ended).toBe(false)
    l.cancel()
  })

  it('pressing Done again does not extend the wait', async () => {
    FakeRecognition.noEnd = true
    const l = listenOnce('ar-JO', () => {})
    FakeRecognition.last.say('هدف')
    let ended = false
    void l.done.then(() => { ended = true })
    l.stop()
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(2_000)
      l.stop()
      if (ended) break
    }
    expect(ended).toBe(true)
    await expect(l.done).resolves.toEqual({ text: 'هدف', alternatives: [] })
  })

  it('stops after the longest allowed listen', async () => {
    FakeRecognition.noEnd = true
    const l = listenOnce('ar-JO', () => {}, { keepListening: () => true })
    FakeRecognition.last.say('هدف')
    await vi.advanceTimersByTimeAsync(35_000 + 2_500)
    await expect(l.done).resolves.toEqual({ text: 'هدف', alternatives: [] })
  })
})
