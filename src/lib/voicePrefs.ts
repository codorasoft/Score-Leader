// How a understood voice command is recorded on this phone: after the referee confirms it (the
// default), or on its own when the action and the player are both clear. Kept per device, since
// it is the referee's own habit.
const KEY = 'voice.autoSave'

export function voiceAutoSave(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setVoiceAutoSave(on: boolean) {
  try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* storage blocked: not remembered */ }
}
