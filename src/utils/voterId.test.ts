import { getVoterId } from './voterId'

const memoryStorage = () => {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) } }
}

it('gives two phones different ids, even when they are the same model with the same settings', () => {
  // Nothing about the device goes into the id: only what each phone has stored
  expect(getVoterId(memoryStorage())).not.toBe(getVoterId(memoryStorage()))
})

it('keeps the same id on one phone, so it cannot vote twice', () => {
  const phone = memoryStorage()
  const first = getVoterId(phone)
  expect(first).toMatch(/^[0-9a-f-]{36}$/)
  expect(getVoterId(phone)).toBe(first)
})

it('still gives an id when the browser blocks storage', () => {
  const blocked = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
  }
  expect(getVoterId(blocked)).toMatch(/^[0-9a-f-]{36}$/)
})
