// Server, auth and database messages arrive in English; map the ones we know to a translation key
// so the Arabic screens never show raw English. Anything unknown gets a translated general message.
const RULES: [RegExp, string][] = [
  [/^network$/, 'network'],
  [/^forbidden$/, 'forbidden'],
  [/already (been )?registered|already exists/i, 'emailTaken'],
  [/invalid login credentials|email not confirmed/i, 'invalidLogin'],
  [/password/i, 'password'],
  [/email/i, 'email'],
  [/cannot reset superadmin/i, 'cannotResetSuperadmin'],
  [/admin not found/i, 'adminNotFound'],
  [/league not found/i, 'leagueNotFound'],
  [/name does not match/i, 'nameMismatch'],
  [/league limit reached/i, 'leagueLimit'],
  [/row-level security/i, 'notAllowed'],
  [/duplicate key/i, 'duplicate'],
  [/another league/i, 'otherLeague'],
]

export function serverErrorKey(message: string | undefined): string {
  const hit = message ? RULES.find(([pattern]) => pattern.test(message)) : undefined
  return `serverErrors.${hit ? hit[1] : 'generic'}`
}
