import { supabase } from './supabase'

// Device clocks can be a minute or more off (an admin PC was 66 s fast), and the match clock and
// red-card countdowns are shared between devices. So those times are written and read in the
// database server's time: this device's clock plus the difference measured here.
const KEY = 'scoreleader.serverClockOffset'

function stored(): number {
  try { return Number(localStorage.getItem(KEY)) || 0 } catch { return 0 }
}

// Milliseconds to add to this device's clock; kept on the phone so it also holds offline
let offset = stored()

export const serverNow = () => Date.now() + offset
export const serverNowIso = () => new Date(serverNow()).toISOString()

async function askServer(): Promise<string | null> {
  const { data, error } = await supabase.rpc('server_now')
  return error || typeof data !== 'string' ? null : data
}

// The server answered halfway through the round trip. A failed request keeps the last difference.
export async function syncServerClock(ask: () => Promise<string | null> = askServer): Promise<void> {
  const sent = Date.now()
  const answer = await ask().catch(() => null)
  const received = Date.now()
  const at = answer ? Date.parse(answer) : NaN
  if (Number.isNaN(at)) return
  offset = Math.round(at - (sent + received) / 2)
  try { localStorage.setItem(KEY, String(offset)) } catch { /* storage blocked */ }
}
