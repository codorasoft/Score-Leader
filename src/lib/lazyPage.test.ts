import { vi } from 'vitest'
import { loadOrReload } from './lazyPage'

beforeEach(() => sessionStorage.clear())

it('returns the page when its file loads', async () => {
  const reload = vi.fn()
  await expect(loadOrReload(async () => 'page', reload)).resolves.toBe('page')
  expect(reload).not.toHaveBeenCalled()
})

it('reloads once when a page file is missing after a deploy', async () => {
  const reload = vi.fn()
  const pending = loadOrReload(() => Promise.reject(new Error('Failed to fetch dynamically imported module')), reload)
  await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  let settled = false
  pending.then(() => { settled = true }, () => { settled = true })
  await Promise.resolve()
  expect(settled).toBe(false)
})

it('shows the error instead of reloading again if the reload did not help', async () => {
  const reload = vi.fn()
  const fail = () => Promise.reject(new Error('Failed to fetch dynamically imported module'))
  loadOrReload(fail, reload)
  await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  await expect(loadOrReload(fail, reload)).rejects.toThrow('Failed to fetch')
  expect(reload).toHaveBeenCalledTimes(1)
})

it('allows a reload again after a page loads successfully', async () => {
  const reload = vi.fn()
  const fail = () => Promise.reject(new Error('missing'))
  loadOrReload(fail, reload)
  await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  await loadOrReload(async () => 'page', reload)
  loadOrReload(fail, reload)
  await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(2))
})
