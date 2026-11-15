import { listenOnce, speechLang, speechSupported } from './speech'

// A stand-in for the browser's SpeechRecognition that the test drives by hand
class FakeRecognition {
  static last: FakeRecognition
  lang = ''
  interimResults = false
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  started = false
  constructor() { FakeRecognition.last = this }
  start() { this.started = true }
  stop() { this.onend?.() }
  abort() { this.onerror?.({ error: 'aborted' }); this.onend?.() }
  say(...parts: string[]) {
    this.onresult?.({ resultIndex: 0, results: parts.map((p) => ({ isFinal: true, 0: { transcript: p } })) })
  }
}

const w = globalThis as unknown as { webkitSpeechRecognition?: unknown }
beforeEach(() => { w.webkitSpeechRecognition = FakeRecognition })
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
  await expect(l.done).resolves.toBe('هدف أحمد')
  expect(seen).toEqual(['هدف أحمد'])
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
  await expect(l.done).resolves.toBe('')
})
