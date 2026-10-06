import { lazy, type ComponentType } from 'react'

const FLAG = 'scoreleader.reloadedForNewVersion'

// After a new deploy, a tab opened earlier may ask for page files that no longer exist.
// Reload once to pick up the new version; if that still fails, let the error show.
export function loadOrReload<T>(load: () => Promise<T>, reload: () => void = () => window.location.reload()): Promise<T> {
  return load().then(
    (mod) => {
      try { sessionStorage.removeItem(FLAG) } catch { /* storage blocked */ }
      return mod
    },
    (err) => {
      let reloaded = true
      try { reloaded = sessionStorage.getItem(FLAG) === '1'; sessionStorage.setItem(FLAG, '1') } catch { /* storage blocked: don't risk a reload loop */ }
      if (reloaded) throw err
      reload()
      return new Promise<T>(() => {})
    },
  )
}

export const lazyPage = <P extends object>(load: () => Promise<{ default: ComponentType<P> }>) =>
  lazy(() => loadOrReload(load))
