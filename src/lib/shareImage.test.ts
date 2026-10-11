import { wrapLines } from './shareImage'

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
