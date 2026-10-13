// The app's icons: the page and the manifest must name files that really exist, or the home
// screen and the notification show a blank.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const html = readFileSync(resolve(root, 'index.html'), 'utf8')
const config = readFileSync(resolve(root, 'vite.config.ts'), 'utf8')

it('the page names the tab icon and the iPhone home-screen icon', () => {
  expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')
  expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />')
  expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />')
  expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />')
  expect(html).toContain('<meta name="apple-mobile-web-app-title" content="ScoreLeader" />')
})

it('every icon the manifest and the page name is a real file', () => {
  const named = [...config.matchAll(/src: '([^']+\.png)'/g)].map((m) => m[1])
  expect(named.sort()).toEqual(['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'])
  for (const path of [...named, 'favicon.svg', 'apple-touch-icon.png', 'icons/badge-96.png']) {
    expect(existsSync(resolve(root, 'public', path)), path).toBe(true)
  }
})

it('the maskable icon is listed as maskable and the others as plain', () => {
  expect(config).toMatch(/src: 'icons\/icon-maskable-512\.png'[^}]*purpose: 'maskable'/)
  expect(config).toMatch(/src: 'icons\/icon-512\.png'[^}]*purpose: 'any'/)
})
