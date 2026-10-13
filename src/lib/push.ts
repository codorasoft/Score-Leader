import { supabase } from './supabase'

// The morning notification on this device: what it can do, whether it is on, turning it on and
// off, and keeping what the server knows about it right. The server side is the table
// push_subscriptions (one row per browser) and the function send-morning-push.

export type PushSupport = 'ok' | 'needsInstall' | 'unsupported'

export interface PushState {
  // needsInstall: an iPhone or iPad delivers a push only to an app added to the Home Screen
  support: PushSupport
  permission: NotificationPermission
  // The browser holds a push address and the server knows it
  on: boolean
  // The hour of the notification, 0–23: the stored one when on, else the last one chosen here
  hour: number
}

export const DEFAULT_HOUR = 7

// The hour last chosen on this device. It also marks the device as "turned on here", so the
// app can save it again by itself when the browser renews its address.
const KEY = 'scoreleader.push'

function rememberedHour(): number | null {
  try {
    const hour = (JSON.parse(localStorage.getItem(KEY) ?? 'null') as { hour?: unknown } | null)?.hour
    return typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null
  } catch {
    return null
  }
}
function rememberHour(hour: number) {
  try { localStorage.setItem(KEY, JSON.stringify({ hour })) } catch { /* storage blocked: not remembered */ }
}
function forgetHour() {
  try { localStorage.removeItem(KEY) } catch { /* storage blocked */ }
}

// ===== The browser

const appKey = () => (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || ''
const permission = (): NotificationPermission => window.Notification?.permission ?? 'default'

// An iPad says it is a Mac; a Mac has no touch screen
const isApplePhone = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const fromHomeScreen = () =>
  !!window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

// What this device can do, with the service worker's registration when it can push. In local
// development there is no service worker and no key, so the answer is 'unsupported'.
async function device(): Promise<{ support: PushSupport; registration: ServiceWorkerRegistration | null }> {
  if (!navigator.serviceWorker || !window.PushManager || !window.Notification) {
    return { support: isApplePhone() && !fromHomeScreen() ? 'needsInstall' : 'unsupported', registration: null }
  }
  const registration = appKey() ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined
  return registration ? { support: 'ok', registration } : { support: 'unsupported', registration: null }
}

// base64url, as the push keys are written
function toBytes(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
function toText(bytes: ArrayBuffer | null): string {
  if (!bytes) return ''
  let raw = ''
  for (const byte of new Uint8Array(bytes)) raw += String.fromCharCode(byte)
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ===== The server

interface Stored { notify_hour: number; time_zone: string; language: string }

// The row of an address: null when the server does not know it. Throws when it cannot be read.
async function storedDevice(endpoint: string): Promise<Stored | null> {
  const { data, error } = await supabase.from('push_subscriptions').select('notify_hour, time_zone, language').eq('endpoint', endpoint).maybeSingle()
  if (error) throw new Error('the device could not be read')
  return (data as Stored | null) ?? null
}

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
const languageOf = (language: string) => (language.startsWith('ar') ? 'ar' : 'en')

async function save(subscription: PushSubscription, hour: number, language: string): Promise<boolean> {
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: toText(subscription.getKey('p256dh')),
    p_auth: toText(subscription.getKey('auth')),
    p_time_zone: timeZone(),
    p_notify_hour: hour,
    p_language: languageOf(language),
  })
  return !error
}

// ===== What the dialog and the app call

export async function readPushState(): Promise<PushState> {
  const hour = rememberedHour() ?? DEFAULT_HOUR
  const off = (support: PushSupport): PushState => ({ support, permission: permission(), on: false, hour })
  try {
    const { support, registration } = await device()
    if (!registration || permission() !== 'granted') return off(support)
    const subscription = await registration.pushManager.getSubscription()
    const stored = subscription ? await storedDevice(subscription.endpoint) : null
    return stored ? { support, permission: 'granted', on: true, hour: stored.notify_hour } : off(support)
  } catch {
    return off('ok')
  }
}

// 'blocked' when the browser says no; 'dismissed' when the question was closed unanswered
export async function turnOnPush(hour: number, language: string): Promise<'on' | 'blocked' | 'dismissed' | 'failed'> {
  try {
    const { registration } = await device()
    if (!registration) return 'failed'
    const answer = await window.Notification.requestPermission()
    if (answer === 'denied') return 'blocked'
    if (answer !== 'granted') return 'dismissed'
    const held = await registration.pushManager.getSubscription()
    const subscription = held ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(appKey()) })
    if (await save(subscription, hour, language)) {
      rememberHour(hour)
      return 'on'
    }
    // An address made just now and not saved would be an address nobody sends to
    if (!held) await subscription.unsubscribe().catch(() => {})
    return 'failed'
  } catch {
    return 'failed'
  }
}

export async function setPushHour(hour: number, language: string): Promise<boolean> {
  try {
    const subscription = await (await device()).registration?.pushManager.getSubscription()
    if (!subscription || !(await save(subscription, hour, language))) return false
    rememberHour(hour)
    return true
  } catch {
    return false
  }
}

// Deletes this device on the server and gives its address back to the browser. False when the
// delete failed; the address is given back all the same, so nothing can arrive any more.
export async function turnOffPush(): Promise<boolean> {
  try {
    const subscription = await (await device()).registration?.pushManager.getSubscription()
    forgetHour()
    if (!subscription) return true
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
    await subscription.unsubscribe().catch(() => {})
    return !error
  } catch {
    return false
  }
}

export async function sendTestPush(): Promise<boolean> {
  try {
    const subscription = await (await device()).registration?.pushManager.getSubscription()
    if (!subscription) return false
    const { error } = await supabase.functions.invoke('send-morning-push', { body: { test: true, endpoint: subscription.endpoint } })
    return !error
  } catch {
    return false
  }
}

// On opening the admin area. A device turned on here is saved again when the server does not
// know its address any more (the browser renewed it), or knows another time zone or language
// (the coach travelled, or switched language). Never throws.
export async function keepPushRight(language: string): Promise<void> {
  try {
    const hour = rememberedHour()
    if (hour === null || permission() !== 'granted') return
    const subscription = await (await device()).registration?.pushManager.getSubscription()
    if (!subscription) return
    const stored = await storedDevice(subscription.endpoint)
    if (stored && stored.time_zone === timeZone() && stored.language === languageOf(language)) return
    await save(subscription, stored?.notify_hour ?? hour, language)
  } catch { /* tried again the next time the admin area opens */ }
}

// On signing out: this browser stops getting the coach's notifications. Without a connection
// the address is still given back, and the next send finds it gone. Never throws.
export async function forgetPush(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    const subscription = await registration?.pushManager?.getSubscription()
    if (!subscription) return
    await Promise.resolve(supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)).catch(() => {})
    await subscription.unsubscribe()
  } catch { /* nothing more can be done from here */ } finally {
    forgetHour()
  }
}
