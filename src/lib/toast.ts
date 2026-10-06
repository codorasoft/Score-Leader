export type ToastKind = 'network' | 'requestFailed' | 'success'

export interface ToastMessage {
  id: number
  kind: ToastKind
  detail?: string
}

type Listener = (toast: ToastMessage) => void

const listeners = new Set<Listener>()
let nextId = 1

let networkToastsMuted = 0

// The outbox keeps changes that fail for network reasons, so "not saved" would be wrong for them.
export async function withNetworkToastsMuted<T>(run: () => PromiseLike<T>): Promise<T> {
  networkToastsMuted++
  try { return await run() } finally { networkToastsMuted-- }
}

export function showToast(kind: ToastKind, detail?: string) {
  if (kind === 'network' && networkToastsMuted > 0) return
  const toast = { id: nextId++, kind, detail }
  listeners.forEach((l) => l(toast))
}

export function onToast(listener: Listener) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
