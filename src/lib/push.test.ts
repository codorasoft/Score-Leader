import { vi, type Mock } from 'vitest'
import { db, resetDb, rows } from '../test/fakeSupabase'

vi.mock('./supabase', async () => (await import('../test/fakeSupabase')).supabaseModule)

import { forgetPush, keepPushRight, readPushState, sendTestPush, setPushTime, turnOffPush, turnOnPush } from './push'

const KEY = 'scoreleader.push'
const ENDPOINT = 'https://push.test/d1'
// The example key of the Web Push documentation: 65 bytes
const APP_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

interface FakeSubscription { endpoint: string; getKey: (name: string) => ArrayBuffer; unsubscribe: Mock }
// Its keys are the bytes 1, 2, 3 ('AQID') and 4, 5, 6 ('BAUG')
const subscription = (endpoint = ENDPOINT): FakeSubscription => ({
  endpoint,
  getKey: (name) => new Uint8Array(name === 'p256dh' ? [1, 2, 3] : [4, 5, 6]).buffer,
  unsubscribe: vi.fn().mockResolvedValue(true),
})

interface Browser {
  permission?: NotificationPermission
  // What the browser answers when asked for permission
  ask?: NotificationPermission
  subscription?: FakeSubscription | null
  subscribeFails?: boolean
  serviceWorker?: boolean
  registered?: boolean
  pushManager?: boolean
}
const define = (target: object, name: string, value: unknown) => Object.defineProperty(target, name, { value, configurable: true, writable: true })

// A stand-in for what the browser offers; returns what the tests look at
function browser(over: Browser = {}) {
  const held = { subscription: over.subscription ?? null }
  const made = subscription()
  const subscribe = vi.fn(async (_options: PushSubscriptionOptionsInit) => {
    if (over.subscribeFails) throw new Error('the push service is not reachable')
    held.subscription = made
    return made
  })
  const registration = { pushManager: { subscribe, getSubscription: async () => held.subscription } }
  // What was asked of the browser, in order
  const asked: string[] = []
  const notification = {
    permission: over.permission ?? 'default',
    requestPermission: vi.fn(async () => {
      asked.push('permission')
      notification.permission = over.ask ?? 'granted'
      return notification.permission
    }),
  }
  define(navigator, 'serviceWorker', over.serviceWorker === false ? undefined : {
    getRegistration: async () => { asked.push('registration'); return over.registered === false ? undefined : registration },
  })
  define(window, 'PushManager', over.pushManager === false ? undefined : function PushManager() {})
  define(window, 'Notification', notification)
  return { subscribe, made, requestPermission: notification.requestPermission, asked }
}
const on = (over: Browser = {}) => browser({ permission: 'granted', subscription: subscription(), ...over })
const device = (over: Record<string, unknown> = {}) => ({
  id: 'd1', user_id: 'u1', endpoint: ENDPOINT, p256dh: 'AQID', auth: 'BAUG', time_zone: 'Asia/Riyadh', notify_hour: 9, notify_minute: 0, language: 'en', last_sent_on: null, ...over,
})
const saved = (hour: number, language = 'en', minute = 0) => ({
  fn: 'save_push_subscription',
  args: { p_endpoint: ENDPOINT, p_p256dh: 'AQID', p_auth: 'BAUG', p_time_zone: 'Asia/Riyadh', p_notify_hour: hour, p_language: language, p_notify_minute: minute },
})

beforeEach(() => {
  resetDb()
  localStorage.clear()
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', APP_KEY)
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'Asia/Riyadh' } as Intl.ResolvedDateTimeFormatOptions)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  for (const [target, name] of [[navigator, 'serviceWorker'], [window, 'PushManager'], [window, 'Notification'], [window, 'matchMedia']] as const) {
    delete (target as unknown as Record<string, unknown>)[name]
  }
})

describe('what this device can do', () => {
  it.each([
    ['a service worker', { serviceWorker: false }],
    ['a registered service worker', { registered: false }],
    ['push in the browser', { pushManager: false }],
  ] as [string, Browser][])('cannot push without %s', async (_what, over) => {
    browser(over)
    expect(await readPushState()).toEqual({ support: 'unsupported', permission: 'default', on: false, hour: 7, minute: 0 })
  })

  it("cannot push without the app's key", async () => {
    browser()
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')
    expect((await readPushState()).support).toBe('unsupported')
  })

  it('asks an iPhone not on the Home Screen to be added first', async () => {
    browser({ pushManager: false })
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
    define(window, 'matchMedia', () => ({ matches: false }))
    expect((await readPushState()).support).toBe('needsInstall')
  })

  it('an iPhone opened from the Home Screen can push', async () => {
    browser()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
    define(window, 'matchMedia', () => ({ matches: true }))
    expect((await readPushState()).support).toBe('ok')
  })

  it('an iPhone on the Home Screen whose system is too old for push says it cannot', async () => {
    browser({ pushManager: false })
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
    define(window, 'matchMedia', () => ({ matches: true }))
    expect((await readPushState()).support).toBe('unsupported')
  })
})

describe('readPushState', () => {
  it('is off with the default hour on a fresh device', async () => {
    browser()
    expect(await readPushState()).toEqual({ support: 'ok', permission: 'default', on: false, hour: 7, minute: 0 })
  })
  it("is on with the stored time when the browser's address is in the table", async () => {
    resetDb({ push_subscriptions: [device({ notify_hour: 9, notify_minute: 45 })] })
    on()
    expect(await readPushState()).toEqual({ support: 'ok', permission: 'granted', on: true, hour: 9, minute: 45 })
  })
  it('is off when the browser has an address the table does not know', async () => {
    resetDb({ push_subscriptions: [device({ endpoint: 'https://push.test/other' })] })
    on()
    expect(await readPushState()).toMatchObject({ on: false, hour: 7 })
  })
  it('is off when notifications are blocked, even with a row', async () => {
    resetDb({ push_subscriptions: [device()] })
    on({ permission: 'denied' })
    expect(await readPushState()).toMatchObject({ permission: 'denied', on: false })
  })
  it('shows the time remembered on the device while it is off', async () => {
    localStorage.setItem(KEY, '{"hour":6,"minute":30}')
    browser()
    expect(await readPushState()).toMatchObject({ on: false, hour: 6, minute: 30 })
  })
  it('an hour remembered before minutes existed is on the hour', async () => {
    localStorage.setItem(KEY, '{"hour":6}')
    browser()
    expect(await readPushState()).toMatchObject({ hour: 6, minute: 0 })
  })
  it.each(['{"hour":6,"minute":10}', '{"hour":6,"minute":"30"}', '{"hour":6,"minute":60}'])('remembered minutes that are not a quarter count as none (%s)', async (damaged) => {
    localStorage.setItem(KEY, damaged)
    browser()
    expect(await readPushState()).toMatchObject({ hour: 6, minute: 0 })
  })
  it.each(['not json', '{"hour":24}', '{"hour":"7"}', 'null', '[]'])('ignores a damaged remembered hour (%s)', async (damaged) => {
    localStorage.setItem(KEY, damaged)
    browser()
    expect((await readPushState()).hour).toBe(7)
  })
  it('is off, not broken, when the table cannot be read', async () => {
    on()
    db.errors.push_subscriptions = { message: 'down' }
    expect(await readPushState()).toMatchObject({ support: 'ok', on: false })
  })
})

describe('turnOnPush', () => {
  it("asks, subscribes with the app's key and saves the device", async () => {
    const { subscribe, requestPermission } = browser()
    expect(await turnOnPush(8, 30, 'ar-EG')).toBe('on')
    expect(requestPermission).toHaveBeenCalledTimes(1)
    const options = subscribe.mock.calls[0][0]
    expect(options.userVisibleOnly).toBe(true)
    expect((options.applicationServerKey as Uint8Array).length).toBe(65)
    expect((options.applicationServerKey as Uint8Array)[0]).toBe(4)
    expect(db.rpcs).toEqual([saved(8, 'ar', 30)])
    expect(localStorage.getItem(KEY)).toBe('{"hour":8,"minute":30}')
  })
  it('asks for permission straight from the tap, before anything else is waited for', async () => {
    // An iPhone shows the question only when it is asked for directly by the tap
    const { asked } = browser()
    await turnOnPush(7, 0, 'en')
    expect(asked[0]).toBe('permission')
  })
  it('does not ask on a device that cannot push', async () => {
    const { requestPermission } = browser({ pushManager: false })
    expect(await turnOnPush(7, 0, 'en')).toBe('failed')
    expect(requestPermission).not.toHaveBeenCalled()
  })
  it('uses the address the browser already holds instead of asking for another', async () => {
    const { subscribe } = browser({ subscription: subscription() })
    expect(await turnOnPush(7, 0, 'en')).toBe('on')
    expect(subscribe).not.toHaveBeenCalled()
    expect(db.rpcs).toEqual([saved(7)])
  })
  it('reports blocked when the browser says no', async () => {
    const { subscribe } = browser({ ask: 'denied' })
    expect(await turnOnPush(7, 0, 'en')).toBe('blocked')
    expect(subscribe).not.toHaveBeenCalled()
    expect(db.rpcs).toEqual([])
  })
  it('reports dismissed when the question is closed unanswered', async () => {
    const { subscribe } = browser({ ask: 'default' })
    expect(await turnOnPush(7, 0, 'en')).toBe('dismissed')
    expect(subscribe).not.toHaveBeenCalled()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
  it('gives the address back when the save is refused', async () => {
    const { made } = browser()
    db.rpcResults.save_push_subscription = { data: null, error: { message: 'schedule feature needed' } }
    expect(await turnOnPush(7, 0, 'en')).toBe('failed')
    expect(made.unsubscribe).toHaveBeenCalled()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
  it('keeps an address it did not make when the save is refused', async () => {
    const held = subscription()
    browser({ subscription: held })
    db.rpcResults.save_push_subscription = { data: null, error: { message: 'down' } }
    expect(await turnOnPush(7, 0, 'en')).toBe('failed')
    expect(held.unsubscribe).not.toHaveBeenCalled()
  })
  it('fails without leaving anything when the browser cannot subscribe', async () => {
    browser({ subscribeFails: true })
    expect(await turnOnPush(7, 0, 'en')).toBe('failed')
    expect(db.rpcs).toEqual([])
    expect(localStorage.getItem(KEY)).toBeNull()
  })
  it('fails on a device that cannot push', async () => {
    browser({ serviceWorker: false })
    expect(await turnOnPush(7, 0, 'en')).toBe('failed')
  })
})

describe('setPushTime', () => {
  it('saves the new time and remembers it', async () => {
    on()
    expect(await setPushTime(10, 15, 'en')).toBe(true)
    expect(db.rpcs).toEqual([saved(10, 'en', 15)])
    expect(localStorage.getItem(KEY)).toBe('{"hour":10,"minute":15}')
  })
  it('reports a refused save and keeps the old hour remembered', async () => {
    localStorage.setItem(KEY, '{"hour":9}')
    on()
    db.rpcResults.save_push_subscription = { data: null, error: { message: 'down' } }
    expect(await setPushTime(10, 15, 'en')).toBe(false)
    expect(localStorage.getItem(KEY)).toBe('{"hour":9}')
  })
  it('is false on a device that is off', async () => {
    browser({ permission: 'granted' })
    expect(await setPushTime(10, 15, 'en')).toBe(false)
    expect(db.rpcs).toEqual([])
  })
})

describe('turnOffPush', () => {
  it('deletes the device, gives the address back and forgets the hour', async () => {
    resetDb({ push_subscriptions: [device(), device({ id: 'd2', endpoint: 'https://push.test/d2' })] })
    localStorage.setItem(KEY, '{"hour":9}')
    const held = subscription()
    on({ subscription: held })
    expect(await turnOffPush()).toBe(true)
    expect(rows('push_subscriptions').map((r) => r.id)).toEqual(['d2'])
    expect(held.unsubscribe).toHaveBeenCalled()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
  it('still gives the address back when the delete fails, and says it failed', async () => {
    const held = subscription()
    on({ subscription: held })
    db.errors.push_subscriptions = { message: 'down' }
    expect(await turnOffPush()).toBe(false)
    expect(held.unsubscribe).toHaveBeenCalled()
  })
  it('is done at once on a device that is already off', async () => {
    browser()
    expect(await turnOffPush()).toBe(true)
  })
})

describe('sendTestPush', () => {
  it('calls the function for this device', async () => {
    on()
    expect(await sendTestPush()).toBe(true)
    expect(db.invokes).toEqual([{ name: 'send-morning-push', body: { test: true, endpoint: ENDPOINT } }])
  })
  it('reports a failed test', async () => {
    on()
    db.functionResults['send-morning-push'] = { data: null, error: { message: 'x' } }
    expect(await sendTestPush()).toBe(false)
  })
  it('is false with no address', async () => {
    browser({ permission: 'granted' })
    expect(await sendTestPush()).toBe(false)
    expect(db.invokes).toEqual([])
  })
})

describe('keepPushRight', () => {
  const remembered = () => localStorage.setItem(KEY, '{"hour":9,"minute":30}')
  it('saves again when the time zone changed', async () => {
    resetDb({ push_subscriptions: [device({ time_zone: 'Europe/Berlin', notify_hour: 6, notify_minute: 45 })] })
    remembered()
    on()
    await keepPushRight('en')
    // The stored time, not the remembered one: another change may not have reached this device yet
    expect(db.rpcs).toEqual([saved(6, 'en', 45)])
  })
  it('saves again when the language changed', async () => {
    resetDb({ push_subscriptions: [device({ notify_hour: 9 })] })
    remembered()
    on()
    await keepPushRight('ar')
    expect(db.rpcs).toEqual([saved(9, 'ar')])
  })
  it('saves again when the browser renewed the address', async () => {
    resetDb({ push_subscriptions: [device({ endpoint: 'https://push.test/old' })] })
    remembered()
    on()
    await keepPushRight('en')
    expect(db.rpcs).toEqual([saved(9, 'en', 30)])
  })
  it.each([
    ['everything is as stored', () => { resetDb({ push_subscriptions: [device()] }); remembered(); on() }],
    ['the device was never turned on here', () => { on() }],
    ['the browser holds no address', () => { remembered(); browser({ permission: 'granted' }) }],
    ['notifications are blocked', () => { remembered(); on({ permission: 'denied' }) }],
    ['the device cannot push', () => { remembered(); browser({ serviceWorker: false }) }],
  ])('does nothing when %s', async (_when, arrange) => {
    arrange()
    await keepPushRight('en')
    expect(db.rpcs).toEqual([])
  })
  it('never throws, and saves nothing, when the table cannot be read', async () => {
    remembered()
    on()
    db.errors.push_subscriptions = { message: 'down' }
    await expect(keepPushRight('en')).resolves.toBeUndefined()
    expect(db.rpcs).toEqual([])
  })
})

describe('forgetPush', () => {
  it('deletes the device, gives the address back and forgets the hour', async () => {
    resetDb({ push_subscriptions: [device()] })
    localStorage.setItem(KEY, '{"hour":9}')
    const held = subscription()
    on({ subscription: held })
    await forgetPush()
    expect(rows('push_subscriptions')).toEqual([])
    expect(held.unsubscribe).toHaveBeenCalled()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
  it('gives the address back even when the delete fails', async () => {
    const held = subscription()
    on({ subscription: held })
    db.errors.push_subscriptions = { message: 'down' }
    await expect(forgetPush()).resolves.toBeUndefined()
    expect(held.unsubscribe).toHaveBeenCalled()
  })
  it('does nothing on a device that is off', async () => {
    browser()
    await forgetPush()
    expect(db.writes).toEqual([])
  })
  it('never throws when the browser has no service worker', async () => {
    browser({ serviceWorker: false })
    await expect(forgetPush()).resolves.toBeUndefined()
  })
})
