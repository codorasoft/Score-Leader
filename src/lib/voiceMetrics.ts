// How voice commands go on this phone, to find where the wait is before changing anything: the
// mic's start, the first words, the end of speech to the action shown, the phone or the server,
// and why things failed. Kept on the device only (the last 50), with no words, names or sound:
// counts, durations and reasons. Read them in the browser console with scoreLeaderVoice.summary().
import type { Heard, SpeechEnd, SpeechError } from './speech'
import type { VoiceFailure } from './voiceApi'

export type VoiceOutcome = 'auto-saved' | 'confirmed' | 'edited' | 'closed' | 'retried'

export interface VoiceAttempt {
  at: string
  mode: 'tap' | 'hold'
  // From the press: the mic really on, and the first words on screen
  micMs: number | null
  firstWordsMs: number | null
  // How listening ended, or why nothing was heard
  end: SpeechEnd | SpeechError | null
  final: boolean | null
  words: number | null
  alternatives: number | null
  restarts: number | null
  interpreter: 'local' | 'server' | null
  // The request's round trip, and Claude's part of it as the function measured it
  serverMs: number | null
  modelMs: number | null
  serverError: VoiceFailure | null
  // From the end of speech (letting go, Done, or the pause) to the action on screen
  resultMs: number | null
  outcome: VoiceOutcome | null
  // The referee changed the player, assister or minutes before Confirm
  corrected: boolean
  // Saved on its own, then taken back with Undo
  undone: boolean
}

const KEY = 'voice.metrics'
const KEEP = 50

function load(): VoiceAttempt[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
function store(list: VoiceAttempt[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-KEEP))) } catch { /* storage blocked: not kept */ }
}

export const voiceAttempts = (): VoiceAttempt[] => load()

const round = (ms: number) => Math.round(ms)

export function startVoiceAttempt(mode: 'tap' | 'hold', clock: () => number = () => performance.now()) {
  exposeInConsole()
  const pressed = clock()
  let endedAt: number | null = null
  let askedAt: number | null = null
  let finished = false
  const a: VoiceAttempt = {
    at: new Date().toISOString(), mode, micMs: null, firstWordsMs: null, end: null, final: null, words: null,
    alternatives: null, restarts: null, interpreter: null, serverMs: null, modelMs: null, serverError: null,
    resultMs: null, outcome: null, corrected: false, undone: false,
  }
  const since = (t: number) => round(clock() - t)
  return {
    // A press is only known to be a hold once it is let go, or taken away, after the hold time:
    // until then it counts as the tap it started as
    held: () => { if (!finished) a.mode = 'hold' },
    micOn: () => { a.micMs ??= since(pressed) },
    firstWords: () => { a.firstWordsMs ??= since(pressed) },
    // Letting go or Done; when neither came, the recognizer's own end
    speechEnded: () => { endedAt ??= clock() },
    heard: (h: Heard | SpeechError) => {
      endedAt ??= clock()
      if (typeof h === 'string') { a.end = h; return }
      Object.assign(a, { end: h.end, final: h.final, words: h.text.split(/\s+/).filter(Boolean).length, alternatives: h.alternatives.length, restarts: h.restarts })
    },
    asking: () => { askedAt = clock() },
    interpreted: (how: 'local' | 'server', r: { modelMs?: number | null; error?: VoiceFailure } = {}) => {
      a.interpreter = how
      if (how === 'server' && askedAt !== null) a.serverMs = since(askedAt)
      a.modelMs = r.modelMs ?? null
      a.serverError = r.error ?? null
    },
    shown: () => { if (endedAt !== null) a.resultMs ??= since(endedAt) },
    // The first outcome counts; the attempt is kept from then on
    finish: (outcome: VoiceOutcome, corrected = false) => {
      if (finished) return
      finished = true
      a.outcome = outcome
      a.corrected = corrected
      store([...load(), a])
    },
  }
}
export type VoiceAttemptTracker = ReturnType<typeof startVoiceAttempt>

// Undo on the "Saved by voice" notice: the last command was saved on its own and was wrong
export function noteVoiceUndo() {
  const list = load()
  const last = list[list.length - 1]
  if (last?.outcome !== 'auto-saved') return
  last.undone = true
  store(list)
}

function median(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => typeof x === 'number').sort((x, y) => x - y)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : round((v[mid - 1] + v[mid]) / 2)
}
const count = <T extends string>(values: (T | null)[]) =>
  values.reduce<Record<string, number>>((all, v) => (v ? { ...all, [v]: (all[v] ?? 0) + 1 } : all), {})

export function summarizeVoice(list: VoiceAttempt[]) {
  const by = (how: 'local' | 'server') => list.filter((x) => x.interpreter === how)
  return {
    attempts: list.length,
    local: by('local').length,
    server: by('server').length,
    medianMs: {
      micOn: median(list.map((x) => x.micMs)),
      firstWords: median(list.map((x) => x.firstWordsMs)),
      localResult: median(by('local').map((x) => x.resultMs)),
      serverResult: median(by('server').map((x) => x.resultMs)),
      serverRoundTrip: median(list.map((x) => x.serverMs)),
      model: median(list.map((x) => x.modelMs)),
    },
    modes: count(list.map((x) => x.mode)),
    ends: count(list.map((x) => x.end)),
    serverErrors: count(list.map((x) => x.serverError)),
    outcomes: count(list.map((x) => x.outcome)),
    notFinal: list.filter((x) => x.final === false).length,
    corrected: list.filter((x) => x.corrected).length,
    undoneAfterAutoSave: list.filter((x) => x.undone).length,
  }
}

let exposed = false
function exposeInConsole() {
  if (exposed || typeof window === 'undefined') return
  exposed = true
  Object.assign(window, {
    scoreLeaderVoice: {
      attempts: voiceAttempts,
      summary: () => summarizeVoice(voiceAttempts()),
      clear: () => { try { localStorage.removeItem(KEY) } catch { /* blocked */ } },
    },
  })
}
