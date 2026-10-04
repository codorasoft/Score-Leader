export type ToastKind = 'network' | 'requestFailed'

export interface ToastMessage {
  id: number
  kind: ToastKind
  detail?: string
}

type Listener = (toast: ToastMessage) => void

const listeners = new Set<Listener>()
let nextId = 1

export function showToast(kind: ToastKind, detail?: string) {
  const toast = { id: nextId++, kind, detail }
  listeners.forEach((l) => l(toast))
}

export function onToast(listener: Listener) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
