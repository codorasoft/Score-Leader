// The browser's own speech recognition (Web Speech API): Chrome on Android, Safari on iPhone.
// It listens once, until the referee stops talking (or, held down, until the mic is let go), and
// gives back the text. It needs a connection.

interface RecognitionResult extends ArrayLike<{ transcript: string }> { isFinal: boolean }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => Recognition

function ctor(): RecognitionCtor | undefined {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const speechSupported = () => !!ctor()

// Jordanian Arabic is closest to how the referees speak; recognition still understands MSA
export const speechLang = (appLang: string) => (appLang.startsWith('ar') ? 'ar-JO' : 'en-US')

export type SpeechError = 'denied' | 'no-speech' | 'network' | 'failed'

// What was heard: the best guess, and the recognizer's other guesses, which often spell a name better
export interface Heard {
  text: string
  alternatives: string[]
}

const ALTERNATIVES = 3

export interface Listening {
  // The final text, '' when nothing was heard
  done: Promise<Heard>
  // Stop listening now and keep what was heard so far
  stop: () => void
  // Stop and throw it away
  cancel: () => void
}

// Push to talk: what the referee holds the mic for
export interface ListenOptions {
  // The mic is really on: words said before this are not heard
  onReady?: () => void
  // While this says yes, a pause does not end listening: it starts again and adds to the text
  keepListening?: () => boolean
}

// Enough for a sentence with a few pauses, without looping on a mic that keeps failing
const MAX_RESTARTS = 6
// The browser does not always say it has started or ended (iPhone home-screen apps can sit with the
// mic on and nothing coming), so listening never waits on it for ever:
// the mic has this long to start,
const START_MS = 6_000
// a tap ends after this long with nothing new heard (a held mic waits for the finger),
const SILENCE_MS = 8_000
// once asked to stop, the browser has this long to hand back the text,
const STOP_GRACE_MS = 2_500
// and nothing listens longer than this.
const MAX_MS = 35_000

const join = (a: string, b: string) => [a, b].filter(Boolean).join(' ')

export function listenOnce(lang: string, onText: (text: string) => void, options: ListenOptions = {}): Listening {
  const Ctor = ctor()
  const failed = (): Listening => ({ done: Promise.reject<Heard>('failed'), stop: () => {}, cancel: () => {} })
  if (!Ctor) return failed()

  // What earlier rounds heard, when a pause ended one while the mic was still held
  let before = ''
  let text = ''
  let alternatives: string[] = []
  let failure: SpeechError | null = null
  let cancelled = false
  let stopped = false
  let ready = false
  let settled = false
  let restarts = 0
  let rec: Recognition
  let finish: (h: Heard) => void = () => {}
  let fail: (e: SpeechError) => void = () => {}
  const done = new Promise<Heard>((resolve, reject) => { finish = resolve; fail = reject })

  let startTimer: ReturnType<typeof setTimeout> | undefined
  let silenceTimer: ReturnType<typeof setTimeout> | undefined
  let graceTimer: ReturnType<typeof setTimeout> | undefined
  const maxTimer = setTimeout(() => stop(), MAX_MS)

  // The one way out: hand back what was heard (or why nothing was) and let go of the mic
  const settle = () => {
    if (settled) return
    settled = true
    for (const t of [startTimer, silenceTimer, graceTimer, maxTimer]) clearTimeout(t)
    rec.onresult = rec.onerror = rec.onend = rec.onstart = null
    try { rec.abort() } catch { /* already ended */ }
    if (cancelled) finish({ text: '', alternatives: [] })
    else if (text) finish({ text, alternatives })
    else fail(failure ?? (ready ? 'no-speech' : 'failed'))
  }
  const stop = () => {
    if (settled) return
    stopped = true
    clearTimeout(graceTimer)
    graceTimer = setTimeout(settle, STOP_GRACE_MS)
    try { rec.stop() } catch { settle() }
  }
  const quietFor = () => {
    clearTimeout(silenceTimer)
    silenceTimer = setTimeout(() => {
      // A held mic waits for the finger; a tap gives up and keeps what it has
      if (options.keepListening?.()) quietFor()
      else stop()
    }, SILENCE_MS)
  }

  const begin = () => {
    const r = new Ctor()
    r.lang = lang
    r.interimResults = true
    r.continuous = false
    r.maxAlternatives = ALTERNATIVES
    r.onstart = () => {
      clearTimeout(startTimer)
      quietFor()
      if (ready) return
      ready = true
      options.onReady?.()
    }
    r.onresult = (e) => {
      // Guess k of the whole phrase: guess k of each part, or the best guess where a part has fewer
      const guess = (k: number) => {
        let all = ''
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i]
          all += (res[k] ?? res[0]).transcript
        }
        return all.trim().replace(/\s+/g, ' ')
      }
      const best = guess(0)
      text = join(before, best)
      alternatives = [...new Set(Array.from({ length: ALTERNATIVES - 1 }, (_, i) => guess(i + 1)))]
        .filter((a) => a && a !== best)
        .map((a) => join(before, a))
      quietFor()
      onText(text)
    }
    r.onerror = (e) => {
      failure = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied'
        : e.error === 'no-speech' ? 'no-speech'
        : e.error === 'network' ? 'network'
        : e.error === 'aborted' ? null
        : 'failed'
    }
    r.onend = () => {
      // Still held: the referee only paused, so listen on and keep what was said
      const fatal = failure === 'denied' || failure === 'network'
      if (!stopped && !cancelled && !fatal && restarts < MAX_RESTARTS && options.keepListening?.()) {
        restarts++
        before = text
        failure = null
        try {
          begin()
          return
        } catch {
          // Could not start again: go on with what was heard
        }
      }
      settle()
    }
    rec = r
    clearTimeout(startTimer)
    startTimer = setTimeout(settle, START_MS)
    r.start()
  }

  try {
    begin()
  } catch {
    for (const t of [startTimer, maxTimer]) clearTimeout(t)
    return failed()
  }
  return {
    done,
    stop,
    cancel: () => { cancelled = true; settle() },
  }
}
