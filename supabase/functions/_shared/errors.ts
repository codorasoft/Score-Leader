export const INTERNAL_ERROR = 'internal error'

// Raw database, auth and storage messages stay in the function logs; the browser gets a stable
// code it can translate. Passing raw text through could match the wrong translation rule
// (a constraint name containing "email" would read as "Enter a valid email address").
export function internalError(where: string, e: unknown): { error: string } {
  const detail = e instanceof Error ? e.message : (e as { message?: unknown } | null)?.message ?? e
  console.error(`${where}:`, detail)
  return { error: INTERNAL_ERROR }
}
