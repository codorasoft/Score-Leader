let audioCtx: AudioContext | null = null

// Browsers only allow audio after a user tap, so call this from a click handler (e.g. Start).
export function primeAlertAudio() {
  try {
    audioCtx ??= new AudioContext()
    if (audioCtx.state === 'suspended') audioCtx.resume()
  } catch { /* no Web Audio support */ }
}

export function playMatchEndAlert() {
  navigator.vibrate?.([400, 200, 400, 200, 400])
  if (!audioCtx) return
  const start = audioCtx.currentTime
  for (let i = 0; i < 3; i++) {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.frequency.value = 880
    gain.gain.value = 0.4
    osc.connect(gain).connect(audioCtx.destination)
    osc.start(start + i * 0.5)
    osc.stop(start + i * 0.5 + 0.3)
  }
}
