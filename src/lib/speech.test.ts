import { vi } from 'vitest'
import { heardInFull, listenOnce, speechLang, speechSupported } from './speech'

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
  say(...parts: (string | string[])[]) { this.emit(true, parts) }
  // Words the recognizer may still revise
  sayInterim(...parts: (string | string[])[]) { this.emit(false, parts) }
  private emit(isFinal: boolean, parts: (string | string[])[]) {
    const results = parts.map((p) => {
      const guesses = (Array.isArray(p) ? p : [p]).map((transcript) => ({ transcript }))
      return Object.assign(guesses, { isFinal })
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
  await expect(l.done).resolves.toEqual({ text: 'هدف أحمد', alternatives: [], end: 'done', final: true, restarts: 0 })
  expect(seen).toEqual(['هدف أحمد'])
})

it('keeps the other guesses, which often spell a name better', async () => {
  const l = listenOnce('ar-JO', () => {})
  const rec = FakeRecognition.last
  expect(rec.maxAlternatives).toBe(3)
  rec.say(['هدف من ليث', 'هدف ملايث', 'هدف من ليث'])
  l.stop()
  await expect(l.done).resolves.toMatchObject({ text: 'هدف من ليث', alternatives: ['هدف ملايث'] })
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
  await expect(l.done).resolves.toMatchObject({ text: '', alternatives: [], end: 'cancelled' })
})

it('says when the mic is really on', () => {
  const onLive = vi.fn()
  const l = listenOnce('ar-JO', () => {}, { onLive })
  expect(onLive.mock.calls).toEqual([[true]])
  l.cancel()
})

it('push to talk: a pause while the mic is held listens on and keeps what was said', async () => {
  let held = true
  const seen: string[] = []
  const onLive = vi.fn()
  const l = listenOnce('ar-JO', (t) => seen.push(t), { onLive, keepListening: () => held })
  const first = FakeRecognition.last
  first.say('هدف')
  // The recognizer ends on its own at the pause
  first.onend?.()
  const second = FakeRecognition.last
  expect(second).not.toBe(first)
  expect(second.started).toBe(true)
  // The mic is shown off in the gap between rounds, and on again once it really is
  expect(onLive.mock.calls).toEqual([[true], [false], [true]])
  second.say(['العجل', 'الدجل'])
  held = false
  l.stop()
  await expect(l.done).resolves.toMatchObject({ text: 'هدف العجل', alternatives: ['هدف الدجل'], end: 'done', final: true, restarts: 1 })
  expect(seen).toEqual(['هدف', 'هدف العجل'])
})

it('a tap ends at the first pause, as before', async () => {
  const l = listenOnce('ar-JO', () => {}, { keepListening: () => false })
  const rec = FakeRecognition.last
  rec.say('هدف')
  rec.onend?.()
  expect(FakeRecognition.last).toBe(rec)
  await expect(l.done).resolves.toMatchObject({ text: 'هدف', end: 'done', final: true })
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
    // The referee did finish: with every word final, the sentence is whole
    await expect(l.done).resolves.toMatchObject({ text: 'هدف العجل', end: 'done', final: true })
  })

  it('after Done, words the browser never made final stay not final', async () => {
    FakeRecognition.noEnd = true
    const l = listenOnce('ar-JO', () => {})
    FakeRecognition.last.sayInterim('هدف العجل')
    l.stop()
    await vi.advanceTimersByTimeAsync(2_500)
    const heard = await l.done
    expect(heard).toMatchObject({ text: 'هدف العجل', end: 'done', final: false })
    expect(heardInFull(heard)).toBe(false)
  })

  it('a hold the system took away keeps what was heard, marked as interrupted', async () => {
    FakeRecognition.noEnd = true
    let held = true
    const l = listenOnce('ar-JO', () => {}, { keepListening: () => held })
    const rec = FakeRecognition.last
    const stop = vi.spyOn(rec, 'stop')
    rec.say('هدف ليث أسيست')
    held = false
    l.interrupt()
    l.interrupt()
    l.stop()
    expect(stop).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2_500)
    await expect(l.done).resolves.toMatchObject({ text: 'هدف ليث أسيست', end: 'interrupted' })
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
    await expect(l.done).resolves.toMatchObject({ text: 'هدف' })
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
    await expect(l.done).resolves.toMatchObject({ text: 'هدف العجل', end: 'error', error: 'failed' })
  })

  it('a mic taken away from outside ends at once, even when the browser never says it ended', async () => {
    const live: boolean[] = []
    const seen: string[] = []
    const l = listenOnce('ar-JO', (t) => seen.push(t), { onLive: (on) => live.push(on), keepListening: () => true })
    const rec = FakeRecognition.last
    rec.say('هدف ليث')
    // What the recognizer could still do later, kept before the app lets go of it
    const { onresult, onend } = rec
    let over = false
    void l.done.then(() => { over = true })
    // Another app took the mic, or a call came in; no end follows
    rec.onerror?.({ error: 'aborted' })
    await Promise.resolve()
    expect(over).toBe(true)
    expect(live).toEqual([true, false])
    expect(vi.getTimerCount()).toBe(0)
    await expect(l.done).resolves.toMatchObject({ text: 'هدف ليث', end: 'interrupted' })
    expect(heardInFull(await l.done)).toBe(false)
    // A late word or end from that recognizer changes nothing and starts nothing new
    onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'هدف خالد' }], { isFinal: true })] })
    onend?.()
    expect(FakeRecognition.last).toBe(rec)
    expect(seen).toEqual(['هدف ليث'])
    await expect(l.done).resolves.toMatchObject({ text: 'هدف ليث', end: 'interrupted' })
  })

  it('an outside abort before any word is nothing heard, and the mic shows off at once', async () => {
    const live: boolean[] = []
    const l = listenOnce('ar-JO', () => {}, { onLive: (on) => live.push(on) })
    FakeRecognition.last.onerror?.({ error: 'aborted' })
    expect(live).toEqual([true, false])
    expect(vi.getTimerCount()).toBe(0)
    await expect(l.done).rejects.toBe('no-speech')
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
    await expect(l.done).resolves.toMatchObject({ text: 'هدف' })
  })

  it('the time limit does not cut off a sentence the referee already ended by letting go', async () => {
    let held = true
    const l = listenOnce('ar-JO', () => {}, { keepListening: () => held })
    const rec = FakeRecognition.last
    rec.say('هدف')
    await vi.advanceTimersByTimeAsync(34_000)
    FakeRecognition.noEnd = true
    held = false
    l.stop()
    await vi.advanceTimersByTimeAsync(1_500)
    rec.onend?.()
    await expect(l.done).resolves.toMatchObject({ text: 'هدف', end: 'done' })
  })

  it('stops after the longest allowed listen', async () => {
    FakeRecognition.noEnd = true
    const l = listenOnce('ar-JO', () => {}, { keepListening: () => true })
    FakeRecognition.last.say('هدف')
    await vi.advanceTimersByTimeAsync(35_000 + 2_500)
    // Cut off by the limit, not ended by the referee
    await expect(l.done).resolves.toMatchObject({ text: 'هدف', end: 'timeout' })
  })
})

describe('says how listening ended, so a cut-off sentence is never taken as complete', () => {
  it('keeps a guess cut off by a mic failure, marked as cut off and not final', async () => {
    const l = listenOnce('ar-JO', () => {})
    const rec = FakeRecognition.last
    // «هدف ليث» still being revised when the mic fails, before the referee finished
    rec.sayInterim('هدف ليث')
    rec.onerror?.({ error: 'audio-capture' })
    const heard = await l.done
    expect(heard).toMatchObject({ text: 'هدف ليث', end: 'error', error: 'failed', final: false })
    expect(heardInFull(heard)).toBe(false)
  })

  it('a normal end with words still being revised is not final', async () => {
    const l = listenOnce('ar-JO', () => {})
    FakeRecognition.last.sayInterim('هدف ليث')
    FakeRecognition.last.onend?.()
    const heard = await l.done
    expect(heard).toMatchObject({ text: 'هدف ليث', end: 'done', final: false })
    expect(heardInFull(heard)).toBe(false)
  })

  it('a normal end with final words is complete', async () => {
    const l = listenOnce('ar-JO', () => {})
    FakeRecognition.last.sayInterim('هدف')
    FakeRecognition.last.say('هدف ليث')
    FakeRecognition.last.onend?.()
    expect(heardInFull(await l.done)).toBe(true)
  })

  it('the browser stopping the mic on its own is an interruption, not an end', async () => {
    const l = listenOnce('ar-JO', () => {})
    const rec = FakeRecognition.last
    rec.say('هدف ليث')
    // Not asked for by the app: another app took the mic, or a call came in
    rec.onerror?.({ error: 'aborted' })
    rec.onend?.()
    await expect(l.done).resolves.toMatchObject({ text: 'هدف ليث', end: 'interrupted' })
  })

  it('a browser that reports "aborted" for the app\'s own Done has still heard it all', async () => {
    const l = listenOnce('ar-JO', () => {})
    const rec = FakeRecognition.last
    rec.say('هدف ليث')
    FakeRecognition.noEnd = true
    l.stop()
    rec.onerror?.({ error: 'aborted' })
    rec.onend?.()
    await expect(l.done).resolves.toMatchObject({ text: 'هدف ليث', end: 'done', final: true })
  })

  it('a held mic whose next round fails to start is cut off', async () => {
    const l = listenOnce('ar-JO', () => {}, { keepListening: () => true })
    const first = FakeRecognition.last
    first.say('هدف ليث')
    const start = FakeRecognition.prototype.start
    FakeRecognition.prototype.start = () => { throw new Error('busy') }
    try {
      first.onend?.()
    } finally {
      FakeRecognition.prototype.start = start
    }
    await expect(l.done).resolves.toMatchObject({ text: 'هدف ليث', end: 'error' })
  })
})

describe('stop and cancel', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('can be called again and again, and leave no timer or callback behind', async () => {
    const l = listenOnce('ar-JO', () => {}, { keepListening: () => false })
    const rec = FakeRecognition.last
    const stop = vi.spyOn(rec, 'stop')
    const abort = vi.spyOn(rec, 'abort')
    rec.say('هدف ليث')
    FakeRecognition.noEnd = true
    l.stop()
    l.stop()
    l.cancel()
    l.cancel()
    l.stop()
    expect(stop).toHaveBeenCalledTimes(1)
    expect(abort).toHaveBeenCalledTimes(1)
    await expect(l.done).resolves.toMatchObject({ text: '', end: 'cancelled' })
    expect(vi.getTimerCount()).toBe(0)
    expect([rec.onresult, rec.onerror, rec.onend, rec.onstart]).toEqual([null, null, null, null])
  })

  it('leaves no timer behind after a normal end', async () => {
    const l = listenOnce('ar-JO', () => {})
    FakeRecognition.last.say('هدف')
    FakeRecognition.last.onend?.()
    await l.done
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a stop after the end changes nothing', async () => {
    const l = listenOnce('ar-JO', () => {})
    const rec = FakeRecognition.last
    rec.say('هدف')
    rec.onend?.()
    const stop = vi.spyOn(rec, 'stop')
    l.stop()
    l.cancel()
    expect(stop).not.toHaveBeenCalled()
    await expect(l.done).resolves.toMatchObject({ text: 'هدف', end: 'done' })
  })
})

it('an earlier round of a held mic can no longer change what was heard', async () => {
  let held = true
  const seen: string[] = []
  const l = listenOnce('ar-JO', (t) => seen.push(t), { keepListening: () => held })
  const first = FakeRecognition.last
  first.say('هدف ليث')
  // The browser's own handles on the first round, used after it was replaced
  const lateResult = first.onresult!
  const lateEnd = first.onend!
  first.onend?.()
  const second = FakeRecognition.last
  second.say('من زيد')
  lateResult({ resultIndex: 0, results: [Object.assign([{ transcript: 'صفرا خالد' }], { isFinal: true })] })
  lateEnd()
  expect(FakeRecognition.last).toBe(second)
  held = false
  l.stop()
  await expect(l.done).resolves.toMatchObject({ text: 'هدف ليث من زيد', restarts: 1 })
  expect(seen).toEqual(['هدف ليث', 'هدف ليث من زيد'])
})

it('keeps the other guesses of every round of a held mic, a few at most', async () => {
  let held = true
  const l = listenOnce('ar-JO', () => {}, { keepListening: () => held })
  FakeRecognition.last.say(['هدف ليث', 'هدف ليس'])
  FakeRecognition.last.onend?.()
  FakeRecognition.last.say(['من زيد', 'من زيت', 'من زيد'])
  FakeRecognition.last.onend?.()
  FakeRecognition.last.say(['أسيست', 'اسيس', 'أسست'])
  held = false
  l.stop()
  const heard = await l.done
  expect(heard.text).toBe('هدف ليث من زيد أسيست')
  // One round's other guess at a time, each once, never the best guess itself, four at most
  expect(heard.alternatives).toEqual([
    'هدف ليس من زيد أسيست',
    'هدف ليث من زيت أسيست',
    'هدف ليث من زيد اسيس',
    'هدف ليث من زيد أسست',
  ])
})

describe('the app going to the background', () => {
  const hide = () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  }
  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  })

  it('stops listening, keeps what was heard as cut off, and never starts again by itself', async () => {
    const onLive = vi.fn()
    const l = listenOnce('ar-JO', () => {}, { keepListening: () => true, onLive })
    const rec = FakeRecognition.last
    rec.sayInterim('هدف ليث')
    hide()
    await expect(l.done).resolves.toMatchObject({ text: 'هدف ليث', end: 'hidden', final: false })
    expect(rec.aborted).toBe(true)
    expect(FakeRecognition.last).toBe(rec)
    expect(onLive).toHaveBeenLastCalledWith(false)
  })

  it('after the end, hiding the app changes nothing', async () => {
    const l = listenOnce('ar-JO', () => {})
    FakeRecognition.last.say('هدف')
    FakeRecognition.last.onend?.()
    hide()
    await expect(l.done).resolves.toMatchObject({ end: 'done' })
  })
})

it('shows the mic as off from the moment Done is pressed', () => {
  const onLive = vi.fn()
  const l = listenOnce('ar-JO', () => {}, { onLive })
  FakeRecognition.noEnd = true
  l.stop()
  expect(onLive.mock.calls).toEqual([[true], [false]])
  l.cancel()
})
