// The browser's own speech recognition (Web Speech API): Chrome on Android, Safari on iPhone.
// It listens once, until the referee stops talking, and gives back the text. It needs a connection.

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

export function listenOnce(lang: string, onText: (text: string) => void): Listening {
  const Ctor = ctor()
  if (!Ctor) return { done: Promise.reject<Heard>('failed'), stop: () => {}, cancel: () => {} }
  const rec = new Ctor()
  rec.lang = lang
  rec.interimResults = true
  rec.continuous = false
  rec.maxAlternatives = ALTERNATIVES

  let text = ''
  let alternatives: string[] = []
  let failure: SpeechError | null = null
  let cancelled = false
  const done = new Promise<Heard>((resolve, reject) => {
    rec.onresult = (e) => {
      // Guess k of the whole phrase: guess k of each part, or the best guess where a part has fewer
      const guess = (k: number) => {
        let all = ''
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i]
          all += (r[k] ?? r[0]).transcript
        }
        return all.trim().replace(/\s+/g, ' ')
      }
      text = guess(0)
      alternatives = [...new Set(Array.from({ length: ALTERNATIVES - 1 }, (_, i) => guess(i + 1)))]
        .filter((a) => a && a !== text)
      onText(text)
    }
    rec.onerror = (e) => {
      failure = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied'
        : e.error === 'no-speech' ? 'no-speech'
        : e.error === 'network' ? 'network'
        : e.error === 'aborted' ? null
        : 'failed'
    }
    rec.onend = () => {
      if (cancelled) resolve({ text: '', alternatives: [] })
      else if (failure && !text) reject(failure)
      else resolve({ text, alternatives })
    }
  })
  try {
    rec.start()
  } catch {
    return { done: Promise.reject<Heard>('failed'), stop: () => {}, cancel: () => {} }
  }
  return {
    done,
    stop: () => rec.stop(),
    cancel: () => { cancelled = true; rec.abort() },
  }
}
