import { vi, beforeEach, afterEach } from 'vitest'
import { shareToMessenger } from './messengerShare'

const writeText = vi.fn().mockResolvedValue(undefined)
const open = vi.fn()

beforeEach(() => {
  writeText.mockClear()
  open.mockClear()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  vi.stubGlobal('open', open)
})
afterEach(() => {
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
  vi.unstubAllGlobals()
})

it('uses the phone share sheet when available, so Messenger can be picked', async () => {
  const share = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'share', { value: share, configurable: true })
  expect(await shareToMessenger('hello')).toBe('shared')
  expect(share).toHaveBeenCalledWith({ text: 'hello' })
  expect(open).not.toHaveBeenCalled()
})

it('treats a dismissed share sheet as not shared without falling back', async () => {
  Object.defineProperty(navigator, 'share', { value: vi.fn().mockRejectedValue(new Error('AbortError')), configurable: true })
  expect(await shareToMessenger('hello')).toBe('cancelled')
  expect(writeText).not.toHaveBeenCalled()
})

it('on desktop copies the text and opens messenger.com to paste it', async () => {
  expect(await shareToMessenger('hello')).toBe('copied')
  expect(writeText).toHaveBeenCalledWith('hello')
  expect(open).toHaveBeenCalledWith('https://www.messenger.com/', '_blank', 'noopener')
})
