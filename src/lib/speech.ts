// The browser's own speech recognition (Web Speech API): Chrome on Android, Safari on iPhone.
// It listens once, until the referee stops talking, and gives back the text. It needs a connection.

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
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

export interface Listening {
  // The final text, '' when nothing was heard
  done: Promise<string>
  // Stop listening now and keep what was heard so far
  stop: () => void
  // Stop and throw it away
  cancel: () => void
}

export function listenOnce(lang: string, onText: (text: string) => void): Listening {
  const Ctor = ctor()
  if (!Ctor) return { done: Promise.reject<string>('failed'), stop: () => {}, cancel: () => {} }
  const rec = new Ctor()
  rec.lang = lang
  rec.interimResults = true
  rec.continuous = false
  rec.maxAlternatives = 1

  let text = ''
  let failure: SpeechError | null = null
  let cancelled = false
  const done = new Promise<string>((resolve, reject) => {
    rec.onresult = (e) => {
      let all = ''
      for (let i = 0; i < e.results.length; i++) all += e.results[i][0].transcript
      text = all.trim()
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
      if (cancelled) resolve('')
      else if (failure && !text) reject(failure)
      else resolve(text)
    }
  })
  try {
    rec.start()
  } catch {
    return { done: Promise.reject<string>('failed'), stop: () => {}, cancel: () => {} }
  }
  return {
    done,
    stop: () => rec.stop(),
    cancel: () => { cancelled = true; rec.abort() },
  }
}
