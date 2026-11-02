import { afterEach, beforeEach, vi } from 'vitest'
import { keepFullScreen, remeasure, resetForTests } from './iosViewport'

const screen = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
}

let root: HTMLElement
beforeEach(() => {
  resetForTests()
  root = document.createElement('div')
  document.body.append(root)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => {
  root.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('measures again when the screen stayed shorter than it was, keeping the scroll place', () => {
  screen(430, 932)
  expect(remeasure(root)).toBe(false)
  screen(430, 721) // the keyboard closed but the screen did not grow back
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 })
  const hide = vi.spyOn(root.style, 'display', 'set')
  expect(remeasure(root)).toBe(true)
  expect(hide.mock.calls).toEqual([['none'], ['']])
  expect(window.scrollTo).toHaveBeenCalledWith(0, 500)
})

it('leaves the screen alone while typing, or when only the phone turned', () => {
  screen(430, 932)
  remeasure(root)
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  screen(430, 590)
  expect(remeasure(root)).toBe(false)
  input.remove()
  screen(932, 430) // landscape: a new width, so nothing to compare
  expect(remeasure(root)).toBe(false)
})

it('only watches in the Home Screen app on an iPhone', () => {
  vi.useFakeTimers()
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)')
  screen(430, 932)
  const hide = vi.spyOn(root.style, 'display', 'set')
  const stop = keepFullScreen(root, true)
  screen(430, 721)
  document.dispatchEvent(new FocusEvent('focusout'))
  vi.advanceTimersByTime(300)
  expect(hide).toHaveBeenCalledWith('none')
  stop()
  hide.mockClear()
  keepFullScreen(root, false)
  document.dispatchEvent(new FocusEvent('focusout'))
  vi.advanceTimersByTime(300)
  expect(hide).not.toHaveBeenCalled()
})
