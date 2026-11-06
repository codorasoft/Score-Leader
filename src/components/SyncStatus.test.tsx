import { render, screen, act, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { SyncStatus } from './SyncStatus'
import { createOutbox } from '../lib/outbox'
import { inArabic } from '../test/arabic'

const memoryStorage = () => {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) } }
}

const memoryWarning = 'Changes are only kept in this open page. Keep it open until they finish sending.'

it('stays hidden when nothing is waiting, then shows how many changes are saved on the phone', async () => {
  const client = { from: () => ({ insert: vi.fn(), update: vi.fn(), delete: vi.fn() }) } as never
  const outbox = createOutbox({ client, storage: memoryStorage(), isOnline: () => false })
  const { container } = render(<SyncStatus outbox={outbox} />)
  expect(container).toBeEmptyDOMElement()

  await act(async () => {
    await outbox.runOrQueue({ id: '1', kind: 'insert', table: 'match_events', row: { id: 'g1' } })
    await outbox.runOrQueue({ id: '2', kind: 'insert', table: 'match_events', row: { id: 'g2' } })
  })
  expect(screen.getByRole('status')).toHaveTextContent('No signal')
  expect(screen.getByRole('status')).toHaveTextContent('2 changes saved on this phone')
})

it('retries sending when tapped', async () => {
  const insert = vi.fn().mockResolvedValue({ error: null, status: 201 })
  let online = false
  const outbox = createOutbox({ client: { from: () => ({ insert, update: vi.fn(), delete: vi.fn() }) } as never, storage: memoryStorage(), isOnline: () => online })
  await outbox.runOrQueue({ id: '1', kind: 'insert', table: 'match_events', row: { id: 'g1' } })
  render(<SyncStatus outbox={outbox} />)
  online = true
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try now' })) })
  expect(insert).toHaveBeenCalledWith({ id: 'g1' })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('keeps a warning on screen about saved changes the server refused, until it is dismissed', async () => {
  const insert = vi.fn().mockResolvedValue({ error: { message: 'violates foreign key constraint', code: '23503' }, status: 409 })
  let online = false
  const outbox = createOutbox({ client: { from: () => ({ insert, update: vi.fn(), delete: vi.fn() }) } as never, storage: memoryStorage(), isOnline: () => online })
  await outbox.runOrQueue({ id: '1', kind: 'insert', table: 'match_events', row: { id: 'g1' } })
  render(<SyncStatus outbox={outbox} />)
  online = true
  await act(async () => { await outbox.flush() })

  // Nothing is waiting any more, but the warning stays
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('1 saved change could not be sent')
  expect(screen.getByRole('alert')).toHaveTextContent('Check the score and the timeline')
  fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('warns when storage is blocked, keeps the warning while sending, and clears it after delivery', async () => {
  let finish!: (result: { error: null; status: number }) => void
  const insert = vi.fn(() => new Promise<{ error: null; status: number }>((resolve) => { finish = resolve }))
  let online = false
  const outbox = createOutbox({
    client: { from: () => ({ insert, update: vi.fn(), delete: vi.fn() }) } as never,
    storage: { getItem: () => { throw new Error('Storage blocked') }, setItem: () => { throw new Error('Storage blocked') } },
    isOnline: () => online,
  })
  const { container } = render(<SyncStatus outbox={outbox} />)
  expect(container).toBeEmptyDOMElement()
  await act(async () => { await outbox.runOrQueue({ id: '1', kind: 'insert', table: 'match_events', row: { id: 'g1' } }) })
  expect(screen.getByRole('status')).toHaveTextContent(memoryWarning)
  expect(screen.queryByText(/saved on this phone/)).not.toBeInTheDocument()

  online = true
  let sent!: Promise<boolean>
  await act(async () => { sent = outbox.flush() })
  expect(screen.getByRole('status')).toHaveTextContent('Sending saved changes')
  expect(screen.getByRole('status')).toHaveTextContent(memoryWarning)
  expect(screen.queryByRole('button', { name: 'Try now' })).not.toBeInTheDocument()
  await act(async () => { finish({ error: null, status: 201 }); await sent })
  expect(container).toBeEmptyDOMElement()
})

it('warns for memory fallback even when its in-memory writes succeed', async () => {
  const client = { from: () => ({ insert: vi.fn(), update: vi.fn(), delete: vi.fn() }) } as never
  const outbox = createOutbox({ client, storage: memoryStorage(), persistent: false, isOnline: () => false })
  await outbox.runOrQueue({ id: '1', kind: 'insert', table: 'match_events', row: { id: 'g1' } })
  render(<SyncStatus outbox={outbox} />)
  expect(screen.getByRole('status')).toHaveTextContent(memoryWarning)
  expect(screen.queryByText(/saved on this phone/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Try now' })).toBeInTheDocument()
})

it('only restores the saved-on-phone message after the entire queue is persisted again', async () => {
  const stored = memoryStorage()
  let full = true
  const storage = {
    getItem: stored.getItem,
    setItem: (key: string, value: string) => { if (full) throw new Error('Quota exceeded'); stored.setItem(key, value) },
  }
  const client = { from: () => ({ insert: vi.fn(), update: vi.fn(), delete: vi.fn() }) } as never
  const outbox = createOutbox({ client, storage, isOnline: () => false })
  render(<SyncStatus outbox={outbox} />)
  await act(async () => { await outbox.runOrQueue({ id: '1', kind: 'insert', table: 'match_events', row: { id: 'g1' } }) })
  expect(screen.getByRole('status')).toHaveTextContent(memoryWarning)

  full = false
  await act(async () => { await outbox.runOrQueue({ id: '2', kind: 'insert', table: 'match_events', row: { id: 'g2' } }) })
  expect(screen.getByRole('status')).toHaveTextContent('2 changes saved on this phone')
  expect(screen.queryByText(memoryWarning)).not.toBeInTheDocument()
  expect(JSON.parse(stored.getItem('scoreleader.outbox')!)).toHaveLength(2)
})

it('explains temporary storage in Arabic', async () => {
  await inArabic(async () => {
    const client = { from: () => ({ insert: vi.fn(), update: vi.fn(), delete: vi.fn() }) } as never
    const outbox = createOutbox({ client, storage: memoryStorage(), persistent: false, isOnline: () => false })
    await outbox.runOrQueue({ id: '1', kind: 'insert', table: 'match_events', row: { id: 'g1' } })
    const { unmount } = render(<SyncStatus outbox={outbox} />)
    expect(screen.getByRole('status')).toHaveTextContent('التغييرات محفوظة في هذه الصفحة المفتوحة فقط. أبقِها مفتوحة حتى يكتمل إرسالها.')
    expect(screen.queryByText(/محفوظ على هذا الهاتف/)).not.toBeInTheDocument()
    unmount()
  })
})
