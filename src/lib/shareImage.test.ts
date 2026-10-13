import { vi } from 'vitest'
import { wrapLines, drawBoardImage } from './shareImage'

// Every character is 10 wide
const measure = (s: string) => s.length * 10

describe('wrapLines', () => {
  it('keeps a name that fits on one line', () => {
    expect(wrapLines('Ahmad Khalil', 120, measure)).toEqual(['Ahmad Khalil'])
  })

  it('moves the words that do not fit onto the next line', () => {
    expect(wrapLines('Abdulrahman Al-Najjar', 120, measure)).toEqual(['Abdulrahman', 'Al-Najjar'])
    expect(wrapLines('Ali bin Omar Saleh', 80, measure)).toEqual(['Ali bin', 'Omar', 'Saleh'])
  })

  it('never splits a word, even one wider than the line', () => {
    expect(wrapLines('Abdulrahman', 50, measure)).toEqual(['Abdulrahman'])
  })

  it('ignores extra spaces', () => {
    expect(wrapLines('  Mousa   Barakat ', 60, measure)).toEqual(['Mousa', 'Barakat'])
  })
})

describe('drawBoardImage', () => {
  // A stand-in canvas: remembers what is written, and in which colour
  function fakeCanvas() {
    const written: { text: string; fillStyle: unknown; x: number; y: number }[] = []
    const state: Record<string, unknown> = {}
    const ctx = new Proxy(state, {
      get: (target, key: string) => {
        if (key in target) return target[key]
        if (key === 'measureText') return (s: string) => ({ width: s.length * 18 })
        if (key === 'fillText') return (text: string, x: number, y: number) => { written.push({ text, fillStyle: target.fillStyle, x, y }) }
        return () => {}
      },
      set: (target, key: string, value) => { target[key] = value; return true },
    })
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never)
    return { written, restore: () => spy.mockRestore() }
  }

  it('writes a board text in its colour, where it sits on the pitch', async () => {
    const { written, restore } = fakeCanvas()
    await drawBoardImage({
      title: 'Tactics', subtitle: '0 players', players: [], footer: 'ScoreLeader',
      drawings: [{ id: 'n1', kind: 'text', color: 'red', text: 'Press high', x: 0.5, y: 0.5 }],
    })
    restore()
    const note = written.find((w) => w.text === 'Press high')!
    expect(note.fillStyle).toBe('#ef4444')
    // The image is 1080 wide; its pitch starts 170 down and is 1440 tall
    expect(note.x).toBe(540)
    expect(note.y).toBeGreaterThan(870)
    expect(note.y).toBeLessThan(910)
  })

  it('breaks a long board text onto several lines instead of running off the pitch', async () => {
    const { written, restore } = fakeCanvas()
    await drawBoardImage({
      title: 'Tactics', subtitle: '0 players', players: [], footer: 'ScoreLeader',
      drawings: [{ id: 'n1', kind: 'text', color: 'white', text: 'Full backs stay wide and very high today', x: 0.5, y: 0.5 }],
    })
    restore()
    const lines = written.filter((w) => w.fillStyle === '#ffffff' && /Full|backs|wide|today/.test(w.text))
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.map((l) => l.text).join(' ')).toBe('Full backs stay wide and very high today')
  })
  const sub = (name: string) => ({ name, photo_url: null })

  it('is as wide as ever without substitutes', async () => {
    const { written, restore } = fakeCanvas()
    const canvas = await drawBoardImage({ title: 'Friday', subtitle: 's', players: [], substitutes: [], substitutesTitle: 'Substitutes', footer: 'ScoreLeader' })
    restore()
    expect(canvas.width).toBe(1080)
    expect(written.find((w) => w.text === 'Substitutes')).toBeUndefined()
    expect(written.find((w) => w.text === 'Friday')!.x).toBe(540)
  })

  it('draws the substitutes in a column to the right of the pitch', async () => {
    const { written, restore } = fakeCanvas()
    const canvas = await drawBoardImage({
      title: 'Friday', subtitle: 's', players: [], footer: 'ScoreLeader',
      substitutes: [sub('Hadi'), sub('Zaid')], substitutesTitle: 'Substitutes',
    })
    restore()
    expect(canvas.width).toBe(1300)
    expect(written.find((w) => w.text === 'Substitutes')).toMatchObject({ x: 1150, y: 210 })
    const hadi = written.find((w) => w.text === 'Hadi')!, zaid = written.find((w) => w.text === 'Zaid')!
    expect(hadi.x).toBe(1150)
    expect(zaid.y - hadi.y).toBe(160)
    // The title and the footer are centred on the wider image
    expect(written.find((w) => w.text === 'Friday')!.x).toBe(650)
    expect(written.find((w) => w.text === 'ScoreLeader')!.x).toBe(650)
  })

  it('starts a second column after eight substitutes', async () => {
    const { written, restore } = fakeCanvas()
    const canvas = await drawBoardImage({
      title: 'T', subtitle: 's', players: [], footer: 'ScoreLeader',
      substitutes: Array.from({ length: 9 }, (_, i) => sub(`Sub${i + 1}`)), substitutesTitle: 'Substitutes',
    })
    restore()
    expect(canvas.width).toBe(1520)
    expect(written.find((w) => w.text === 'Sub9')).toMatchObject({ x: 1370, y: written.find((w) => w.text === 'Sub1')!.y })
    expect(written.filter((w) => w.text === 'Substitutes')).toHaveLength(1)
  })

  it('keeps the players on the pitch where they were, with substitutes beside it', async () => {
    const { written, restore } = fakeCanvas()
    await drawBoardImage({
      title: 'T', subtitle: 's', footer: 'ScoreLeader',
      players: [{ name: 'Omar', photo_url: null, x: 0.5, y: 0.5 }],
      substitutes: [sub('Hadi')], substitutesTitle: 'Substitutes',
    })
    restore()
    expect(written.find((w) => w.text === 'Omar')!.x).toBe(540)
  })
})
