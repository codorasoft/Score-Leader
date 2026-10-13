// public/push-sw.js is a plain script the generated service worker loads. Here its text is
// run against a stand-in for the worker's `self`.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { vi } from 'vitest'

interface AppWindow { url: string; focus: () => Promise<unknown>; navigate?: (url: string) => Promise<unknown> }

function worker(windows: AppWindow[] = []) {
  const handlers: Record<string, (event: never) => void> = {}
  const self = {
    addEventListener: (name: string, fn: (event: never) => void) => { handlers[name] = fn },
    registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
    clients: { matchAll: vi.fn().mockResolvedValue(windows), openWindow: vi.fn().mockResolvedValue(undefined) },
    location: { origin: 'https://app.test' },
  }
  new Function('self', readFileSync(resolve(__dirname, '../public/push-sw.js'), 'utf8'))(self)
  const fire = async (name: string, event: Record<string, unknown>) => {
    let done: Promise<unknown> = Promise.resolve()
    handlers[name]({ ...event, waitUntil: (p: Promise<unknown>) => { done = p } } as never)
    await done
  }
  return { self, fire }
}
const message = { title: 'Today: 2 items', body: 'Gym\nMatch session', url: '/admin/eagles/schedule', tag: 'today-2026-10-13', lang: 'en', dir: 'ltr' }

it('shows the notification a push carries', async () => {
  const { self, fire } = worker()
  await fire('push', { data: { json: () => message } })
  expect(self.registration.showNotification).toHaveBeenCalledWith('Today: 2 items', {
    body: 'Gym\nMatch session', tag: 'today-2026-10-13', lang: 'en', dir: 'ltr',
    icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', data: { url: '/admin/eagles/schedule' },
  })
})

it.each([
  ['no data', { data: null }],
  ['data that is not JSON', { data: { json: () => { throw new SyntaxError('bad') } } }],
  ['JSON without a title', { data: { json: () => ({ body: 'x' }) } }],
  ['JSON that is not an object', { data: { json: () => 'hello' } }],
])('still shows a plain notification for a push with %s', async (_name, event) => {
  const { self, fire } = worker()
  await fire('push', event)
  expect(self.registration.showNotification).toHaveBeenCalledTimes(1)
  expect(self.registration.showNotification).toHaveBeenCalledWith('ScoreLeader', expect.objectContaining({
    tag: 'today', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', data: { url: '/admin' },
  }))
})

it('a tap closes the notification and takes an open window of the app there', async () => {
  const open = { url: 'https://app.test/admin/eagles/home', focus: vi.fn().mockResolvedValue(undefined), navigate: vi.fn().mockResolvedValue(undefined) }
  const { self, fire } = worker([open])
  const close = vi.fn()
  await fire('notificationclick', { notification: { close, data: { url: '/admin/eagles/schedule' } } })
  expect(close).toHaveBeenCalled()
  expect(open.navigate).toHaveBeenCalledWith('/admin/eagles/schedule')
  expect(open.focus).toHaveBeenCalled()
  expect(self.clients.openWindow).not.toHaveBeenCalled()
})

it('a tap opens the app when no window of it is open', async () => {
  const { self, fire } = worker()
  await fire('notificationclick', { notification: { close: vi.fn(), data: { url: '/admin/eagles/schedule' } } })
  expect(self.clients.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true })
  expect(self.clients.openWindow).toHaveBeenCalledWith('/admin/eagles/schedule')
})

it('a window of another site is not taken over', async () => {
  const other = { url: 'https://elsewhere.test/page', focus: vi.fn(), navigate: vi.fn() }
  const { self, fire } = worker([other])
  await fire('notificationclick', { notification: { close: vi.fn(), data: { url: '/admin' } } })
  expect(other.navigate).not.toHaveBeenCalled()
  expect(self.clients.openWindow).toHaveBeenCalledWith('/admin')
})

it('a tap on a notification with no address opens the admin area', async () => {
  const { self, fire } = worker()
  await fire('notificationclick', { notification: { close: vi.fn(), data: null } })
  expect(self.clients.openWindow).toHaveBeenCalledWith('/admin')
})

it.each([
  ['refuses', { url: 'https://app.test/', focus: vi.fn(), navigate: vi.fn().mockRejectedValue(new Error('no')) }],
  ['has no way to be taken there', { url: 'https://app.test/', focus: vi.fn() }],
])('a window that %s is replaced by a new one', async (_name, stuck) => {
  const { self, fire } = worker([stuck])
  await fire('notificationclick', { notification: { close: vi.fn(), data: { url: '/admin' } } })
  expect(self.clients.openWindow).toHaveBeenCalledWith('/admin')
})

it('brings the window to the front before taking it there, and opens no second one', async () => {
  // As browsers do: after navigate() the handle used for it is stale, and focusing it is refused
  let moved = false
  const calls: string[] = []
  const open = {
    url: 'https://app.test/admin/eagles/home',
    focus: vi.fn(async () => { calls.push('focus'); if (moved) throw new Error('stale client') }),
    navigate: vi.fn(async () => { calls.push('navigate'); moved = true }),
  }
  const { self, fire } = worker([open])
  await fire('notificationclick', { notification: { close: vi.fn(), data: { url: '/admin/eagles/schedule' } } })
  expect(calls).toEqual(['focus', 'navigate'])
  expect(self.clients.openWindow).not.toHaveBeenCalled()
})
