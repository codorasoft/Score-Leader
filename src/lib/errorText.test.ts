import { serverErrorKey } from './errorText'

it.each([
  ['network', 'serverErrors.network'],
  ['forbidden', 'serverErrors.forbidden'],
  ['A user with this email address has already been registered', 'serverErrors.emailTaken'],
  ['Invalid login credentials', 'serverErrors.invalidLogin'],
  ['Email not confirmed', 'serverErrors.invalidLogin'],
  ['password must be at least 8 characters', 'serverErrors.password'],
  ['Password should be at least 6 characters.', 'serverErrors.password'],
  ['Unable to validate email address: invalid format', 'serverErrors.email'],
  ['invalid email', 'serverErrors.email'],
  ['cannot reset superadmin', 'serverErrors.cannotResetSuperadmin'],
  ['admin not found', 'serverErrors.adminNotFound'],
  ['league not found', 'serverErrors.leagueNotFound'],
  ['name does not match', 'serverErrors.nameMismatch'],
  ['league limit reached', 'serverErrors.leagueLimit'],
  ['new row violates row-level security policy for table "players"', 'serverErrors.notAllowed'],
  ['duplicate key value violates unique constraint "leagues_slug_key"', 'serverErrors.duplicate'],
  ['player belongs to another league', 'serverErrors.otherLeague'],
  ['some brand new failure', 'serverErrors.generic'],
])('serverErrorKey(%s) = %s', (message, key) => expect(serverErrorKey(message)).toBe(key))

it('treats a missing message as generic', () => expect(serverErrorKey(undefined)).toBe('serverErrors.generic'))
