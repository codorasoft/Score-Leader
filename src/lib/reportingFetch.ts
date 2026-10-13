import type { ToastKind } from './toast'

type Report = (kind: ToastKind, detail?: string) => void

// Database and photo-storage calls are reported; auth errors are shown by the login form itself.
const isDataRequest = (url: string) => url.includes('/rest/v1/') || url.includes('/storage/v1/')

// A read made in the background, which the user did not ask for, is made with one of these
// signals: nothing is reported about that request, whatever happens to it, while every other
// request is reported as usual. (Muting by time would also hide the failed save of another
// screen, and the client tries a failed read again for several seconds.)
const quietSignals = new WeakSet<AbortSignal>()

export function quietSignal(): AbortSignal {
  const { signal } = new AbortController()
  quietSignals.add(signal)
  return signal
}

export function createReportingFetch(baseFetch: typeof fetch, report: Report): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    const tracked = isDataRequest(url) && !(signal && quietSignals.has(signal))
    let res: Response
    try {
      res = await baseFetch(input, init)
    } catch (err) {
      if (tracked) report('network', undefined)
      throw err
    }
    if (tracked && !res.ok) {
      let detail: string | undefined
      try { detail = (await res.clone().json())?.message } catch { /* non-JSON body */ }
      report('requestFailed', detail)
    }
    return res
  }
}
