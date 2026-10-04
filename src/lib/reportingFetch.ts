import type { ToastKind } from './toast'

type Report = (kind: ToastKind, detail?: string) => void

// Only database calls are reported; auth errors are shown by the login form itself.
const isDataRequest = (url: string) => url.includes('/rest/v1/')

export function createReportingFetch(baseFetch: typeof fetch, report: Report): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const tracked = isDataRequest(url)
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
