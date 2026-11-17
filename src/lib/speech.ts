// The browser's own speech recognition (Web Speech API): Chrome on Android, Safari on iPhone.
// It listens once, until the referee stops talking (or, held down, until the mic is let go), and
// gives back the text with how listening ended. It needs a connection.

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

// How listening ended. 'done' is the normal end: a pause, Done, or letting go of the mic. The others
// cut the referee off: the mic failed ('error'), something outside took the mic or the touch away
// ('interrupted': a call, another app, the system cancelling a held finger), the time ran out
// ('timeout'), or the app went to the background ('hidden').
export type SpeechEnd = 'done' | 'error' | 'interrupted' | 'timeout' | 'hidden' | 'cancelled'

// What was heard: the best guess, and the recognizer's other guesses, which often spell a name better
export interface Heard {
  text: string
  alternatives: string[]
  end: SpeechEnd
  // Every word came back final, not as a guess the recognizer was still revising
  final: boolean
  // Why the mic failed, when it did
  error?: SpeechError
  // How many times a held mic started again after a pause
  restarts: number
}

// The whole sentence was heard: nothing cut it off and the recognizer stood by every word.
// Only such a sentence may be saved without the referee's Confirm.
export const heardInFull = (h: Pick<Heard, 'end' | 'final'>) => h.end === 'done' && h.final

// The recognizer's guesses per round; the request to the server takes four other guesses at most
const ALTERNATIVES = 3
const MAX_ALTERNATIVES = 4

export interface Listening {
  // What was heard; rejected with a SpeechError when nothing was
  done: Promise<Heard>
  // Stop listening now and keep what was heard so far
  stop: () => void
  // The same, for a referee who did not finish: what was heard is kept, marked 'interrupted'
  interrupt: () => void
  // Stop and throw it away
  cancel: () => void
}

// Push to talk: what the referee holds the mic for
export interface ListenOptions {
  // The mic is really on (true), or not taking words any more (false): between the rounds of a
  // held mic, once Done is pressed, and at the end. Words said while it is off are not heard.
  onLive?: (live: boolean) => void
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

// One round of the recognizer: its best guess, its other guesses, and whether it stood by them
interface Round { best: string; others: string[]; final: boolean }
const emptyRound = (): Round => ({ best: '', others: [], final: true })

const join = (parts: string[]) => parts.filter(Boolean).join(' ')

// The whole sentence over every round, and other versions of it that change one round's guess
function sentence(rounds: Round[]) {
  const text = join(rounds.map((r) => r.best))
  const alternatives = [...new Set(rounds.flatMap((r, i) => r.others.map((other) =>
    join(rounds.map((each, j) => (j === i ? other : each.best))))))]
    .filter((a) => a && a !== text)
    .slice(0, MAX_ALTERNATIVES)
  return { text, alternatives, final: rounds.every((r) => r.final) }
}

const fatal = (e: SpeechError | null) => e === 'denied' || e === 'network' || e === 'failed'

export function listenOnce(lang: string, onText: (text: string) => void, options: ListenOptions = {}): Listening {
  const Ctor = ctor()
  if (!Ctor) return { done: Promise.reject<Heard>('failed'), stop: () => {}, interrupt: () => {}, cancel: () => {} }

  // Earlier rounds, when a pause ended one while the mic was still held, and the current one
  const rounds: Round[] = [emptyRound()]
  let failure: SpeechError | null = null
  // Set when something other than the referee ended listening, even if the browser then ends normally
  let cutOff: SpeechEnd | null = null
  let stopped = false
  let settled = false
  let ready = false
  let live = false
  let restarts = 0
  let rec: Recognition | null = null
  let finish: (h: Heard) => void = () => {}
  let fail: (e: SpeechError) => void = () => {}
  const done = new Promise<Heard>((resolve, reject) => { finish = resolve; fail = reject })

  let startTimer: ReturnType<typeof setTimeout> | undefined
  let silenceTimer: ReturnType<typeof setTimeout> | undefined
  let graceTimer: ReturnType<typeof setTimeout> | undefined
  // The limit cuts off a referee still talking, not one who already let go or pressed Done
  const maxTimer = setTimeout(() => {
    if (stopped) return
    cutOff ??= 'timeout'
    stop()
  }, MAX_MS)

  const setLive = (on: boolean) => {
    if (live === on) return
    live = on
    options.onLive?.(on)
  }
  const detach = (r: Recognition) => { r.onresult = r.onerror = r.onend = r.onstart = null }

  // The one way out: hand back what was heard (or why nothing was) and let go of the mic, the
  // timers and the page listeners. Every later call, stop or cancel does nothing.
  const settle = (end: SpeechEnd) => {
    if (settled) return
    settled = true
    for (const t of [startTimer, silenceTimer, graceTimer, maxTimer]) clearTimeout(t)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide)
    if (rec) {
      detach(rec)
      try { rec.abort() } catch { /* already ended */ }
    }
    setLive(false)
    if (end === 'cancelled') {
      finish({ text: '', alternatives: [], end, final: false, restarts })
      return
    }
    const { text, alternatives, final } = sentence(rounds)
    const how = end === 'done' && cutOff ? cutOff : end
    if (text) finish({ text, alternatives, end: how, final, restarts, ...(failure && how === 'error' ? { error: failure } : {}) })
    else fail(failure ?? (ready ? 'no-speech' : 'failed'))
  }
  // Done, a release or a timer: the grace starts at the first ask, and asking again never extends it.
  // A browser that never hands the text back in time still ends normally: the referee did finish, and
  // words it never made final stay marked so.
  const stop = () => {
    if (settled || stopped) return
    stopped = true
    setLive(false)
    graceTimer = setTimeout(() => settle('done'), STOP_GRACE_MS)
    try { rec?.stop() } catch { settle('done') }
  }
  const interrupt = () => {
    if (settled || stopped) return
    cutOff ??= 'interrupted'
    stop()
  }
  const quietFor = () => {
    clearTimeout(silenceTimer)
    silenceTimer = setTimeout(() => {
      // A held mic waits for the finger; a tap gives up and keeps what it has
      if (options.keepListening?.()) quietFor()
      else stop()
    }, SILENCE_MS)
  }
  // In the background the mic is gone: listening ends there, and never starts again by itself
  function onVisibility() { if (document.visibilityState === 'hidden') settle('hidden') }
  function onPageHide() { settle('hidden') }

  const begin = () => {
    const r = new Ctor()
    // Only the current round may change anything: a late event from an earlier one is ignored
    const current = () => !settled && r === rec
    r.lang = lang
    r.interimResults = true
    r.continuous = false
    r.maxAlternatives = ALTERNATIVES
    r.onstart = () => {
      if (!current()) return
      clearTimeout(startTimer)
      quietFor()
      ready = true
      if (!stopped) setLive(true)
    }
    r.onresult = (e) => {
      if (!current()) return
      // Guess k of the whole round: guess k of each part, or the best guess where a part has fewer
      const guess = (k: number) => {
        let all = ''
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i]
          all += (res[k] ?? res[0]).transcript
        }
        return all.trim().replace(/\s+/g, ' ')
      }
      const best = guess(0)
      const others = [...new Set(Array.from({ length: ALTERNATIVES - 1 }, (_, i) => guess(i + 1)))]
        .filter((a) => a && a !== best)
      const final = Array.from({ length: e.results.length }, (_, i) => e.results[i].isFinal).every(Boolean)
      rounds[rounds.length - 1] = { best, others, final }
      quietFor()
      onText(join(rounds.map((round) => round.best)))
    }
    r.onerror = (e) => {
      if (!current()) return
      failure = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied'
        : e.error === 'no-speech' ? 'no-speech'
        : e.error === 'network' ? 'network'
        : e.error === 'aborted' ? null
        : 'failed'
      // The app only aborts after letting go of the recognizer, so before Done or a release this one
      // was stopped from outside (another app took the mic, a call came in): the sentence was cut
      // off there, and the browser may never say it ended, so listening ends now with what was
      // heard. After them it is just how some browsers report the stop they were asked for.
      if (e.error === 'aborted' && !stopped) settle('interrupted')
      // A blocked mic, no connection or a broken recognizer will not come right by waiting, held or
      // not, and the browser may never say it ended: show it now
      else if (fatal(failure)) settle('error')
    }
    r.onend = () => {
      if (!current()) return
      setLive(false)
      // Still held: the referee only paused, so listen on and keep what was said
      if (!stopped && !cutOff && !fatal(failure) && options.keepListening?.()) {
        if (restarts >= MAX_RESTARTS) {
          settle('timeout')
          return
        }
        restarts++
        failure = null
        detach(r)
        rounds.push(emptyRound())
        try {
          begin()
        } catch {
          // Could not start again while the referee was still talking
          failure = 'failed'
          settle('error')
        }
        return
      }
      settle('done')
    }
    rec = r
    clearTimeout(startTimer)
    // A mic that never starts: nothing is coming, or (between rounds) the referee is cut off
    startTimer = setTimeout(() => settle(stopped ? 'done' : 'error'), START_MS)
    r.start()
  }

  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide)
  try {
    begin()
  } catch {
    settle('error')
  }
  return {
    done,
    stop,
    interrupt,
    cancel: () => settle('cancelled'),
  }
}
