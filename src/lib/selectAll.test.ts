import { vi } from 'vitest'
import { selectAll } from './selectAll'

it('keeps requesting pages until a short page arrives', async () => {
  const total = 2500
  const page = vi.fn(async (from: number, to: number) => ({
    data: Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i),
    error: null,
  }))
  const rows = await selectAll(page)
  expect(rows).toHaveLength(2500)
  expect(page.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
})

it('stops on an error and returns what it has', async () => {
  const page = vi.fn()
    .mockResolvedValueOnce({ data: Array(1000).fill(1), error: null })
    .mockResolvedValueOnce({ data: null, error: new Error('boom') })
  expect(await selectAll(page)).toHaveLength(1000)
})

it('tells the caller when a page failed', async () => {
  const onError = vi.fn()
  await selectAll(vi.fn().mockResolvedValue({ data: null, error: new Error('boom') }), onError)
  expect(onError).toHaveBeenCalledTimes(1)
  await selectAll(vi.fn().mockResolvedValue({ data: [1], error: null }), onError)
  expect(onError).toHaveBeenCalledTimes(1)
})
