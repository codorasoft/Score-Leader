const PAGE = 1000

// Supabase returns at most 1000 rows per request; page through so long histories aren't truncated.
// onError hears about a failed page, so callers can tell a short result from a complete one.
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  onError?: () => void,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error || !data) { onError?.(); break }
    rows.push(...data)
    if (data.length < PAGE) break
  }
  return rows
}

// Every row of a query, page by page. Throws when a page fails, for callers that must not
// mistake a cut-off list for a complete one.
export async function selectAllOrThrow<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  let failed = false
  const rows = await selectAll<T>(
    async (from, to) => {
      const { data, error } = await page(from, to)
      return { data: data as T[] | null, error }
    },
    () => { failed = true },
  )
  if (failed) throw new Error('request failed')
  return rows
}
