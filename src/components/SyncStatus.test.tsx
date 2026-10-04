import { render, screen, act, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { SyncStatus } from './SyncStatus'
import { createOutbox } from '../lib/outbox'

const memoryStorage = () => {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) } }
}

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
