import { vi } from 'vitest'
import { isHandled, markHandled, resetTodaySeen } from './todaySeen'

const KEY = 'scoreleader.todaySeen'

beforeEach(() => { localStorage.clear(); resetTodaySeen() })
afterEach(() => vi.restoreAllMocks())

it('remembers the handled day for each league', () => {
  expect(isHandled('L1', '2026-10-13')).toBe(false)
  markHandled('L1', '2026-10-13')
  expect(isHandled('L1', '2026-10-13')).toBe(true)
  expect(isHandled('L2', '2026-10-13')).toBe(false)
  expect(isHandled('L1', '2026-10-14')).toBe(false)
  markHandled('L2', '2026-10-13')
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ L1: '2026-10-13', L2: '2026-10-13' })
})

it('still knows after a reload', () => {
  markHandled('L1', '2026-10-13')
  resetTodaySeen()
  expect(isHandled('L1', '2026-10-13')).toBe(true)
})

it('falls back to memory when storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  expect(isHandled('L1', '2026-10-13')).toBe(false)
  expect(() => markHandled('L1', '2026-10-13')).not.toThrow()
  expect(isHandled('L1', '2026-10-13')).toBe(true)
})

it('falls back to memory when storage can be read but not written', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
  markHandled('L1', '2026-10-13')
  expect(isHandled('L1', '2026-10-13')).toBe(true)
})

it.each(['not json', '[]', 'null', '"text"', '{"L1":5}'])('treats a damaged value (%s) as nothing handled, and replaces it', (damaged) => {
  localStorage.setItem(KEY, damaged)
  expect(isHandled('L1', '2026-10-13')).toBe(false)
  markHandled('L1', '2026-10-13')
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ L1: '2026-10-13' })
})
