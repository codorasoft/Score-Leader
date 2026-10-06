import { slugError, suggestSlug } from './slug.ts'

it.each([['eagles', null], ['tigers-fc-2', null], ['ab', 'length'], ['a'.repeat(41), 'length'],
  ['Eagles', 'format'], ['-eagles', 'format'], ['eagles--fc', 'format'], ['النسور', 'format'], ['players', 'reserved'], ['super', 'reserved']])(
  'slugError(%s) = %s', (s, e) => expect(slugError(s as string)).toBe(e))
it('suggests from Latin names', () => expect(suggestSlug('  Tigers F.C. 2026 ')).toBe('tigers-f-c-2026'))
it('suggests nothing for Arabic names', () => expect(suggestSlug('دوري النمور')).toBe(''))
