// The push part of the app's service worker. The generated service worker loads this file
// (vite.config.ts: workbox importScripts); it is plain script, with no imports.
//
// A push carries { title, body, url, tag, lang, dir }, made by the server function
// send-morning-push. It is shown as a notification; a tap opens the app at `url`.

const ICON = '/icons/icon-192.png'
// Android shows this one small and in one colour in the status bar
const BADGE = '/icons/badge-96.png'

// The message of a push, or null when there is none that can be read
function messageOf(event) {
  try {
    const message = event.data ? event.data.json() : null
    return message && typeof message === 'object' && typeof message.title === 'string' && message.title ? message : null
  } catch {
    return null
  }
}

self.addEventListener('push', (event) => {
  const message = messageOf(event)
  // A push must always show something: an iPhone can withdraw the permission from an app
  // whose pushes show nothing. What cannot be read is shown under the app's name, which
  // reads the same in every language.
  const shown = message
    ? self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      lang: message.lang,
      dir: message.dir,
      icon: ICON,
      badge: BADGE,
      data: { url: typeof message.url === 'string' ? message.url : '/admin' },
    })
    : self.registration.showNotification('ScoreLeader', { tag: 'today', icon: ICON, badge: BADGE, data: { url: '/admin' } })
  event.waitUntil(shown)
})

// Brings an open window of the app to the front and takes it to the address; opens a new one
// when there is none, or when the window cannot be taken there
async function openApp(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of windows) {
    if (!client.url.startsWith(`${self.location.origin}/`) || typeof client.navigate !== 'function') continue
    try {
      await client.navigate(url)
      await client.focus()
      return
    } catch { /* this window cannot be taken there: try the next, or open a new one */ }
  }
  await self.clients.openWindow(url)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data
  event.waitUntil(openApp(data && typeof data.url === 'string' ? data.url : '/admin'))
})
