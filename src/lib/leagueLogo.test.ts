import { logoPath } from './leagueLogo'

it('names logos per league with a timestamp', () => {
  expect(logoPath('L', 7)).toBe('L/logo-7.jpg')
})
