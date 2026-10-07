// The page shown before any app code runs must already look like the app's loading screen,
// so a reload goes dark "Loading…" → page, never white.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8')
const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8')
const GRAY_900 = '#101828' // Tailwind v4 gray-900, the app background

it('paints the app background before any code runs', () => {
  expect(html).toMatch(new RegExp(`<html[^>]*style="[^"]*background(-color)?:\\s*${GRAY_900}`, 'i'))
  expect(html).toMatch(/<meta name="theme-color" content="#101828"/)
})

it('shows the same Loading… as the app until the app takes over', () => {
  const root = html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script/)?.[1] ?? ''
  expect(root).toContain('Loading…')
  // Arabic users see the Arabic text and right-to-left layout from the start
  expect(html).toContain('جار التحميل…')
  expect(html).toMatch(/localStorage\.getItem\('lang'\)/)
})

it('does not hold the styles back waiting for the web font', () => {
  expect(css).not.toMatch(/@import url\(['"]?https:\/\/fonts\.googleapis/)
  expect(html).toMatch(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin/)
  expect(html).toMatch(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*Cairo[^"]*" media="print" onload="this\.media='all'"/)
})

it('keeps the background dark after the app loads too', () => {
  expect(css).toMatch(/html,\s*body\s*\{[^}]*background-color:\s*var\(--color-gray-900\)/)
})
