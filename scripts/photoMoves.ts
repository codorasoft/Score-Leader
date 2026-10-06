export type PhotoMove = { playerId: string; from: string; to: string }
type PlayerRow = { id: string; league_id: string; photo_url: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const inLeagueFolder = (path: string) => UUID.test(path.split('/')[0])

function pathOf(url: string | null, publicPrefix: string): string | null {
  if (!url || !url.startsWith(publicPrefix)) return null
  const raw = url.slice(publicPrefix.length).split('?')[0]
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function planPhotoMoves(players: PlayerRow[], publicPrefix: string): PhotoMove[] {
  const moves: PhotoMove[] = []
  for (const p of players) {
    const from = pathOf(p.photo_url, publicPrefix)
    if (from && !inLeagueFolder(from)) moves.push({ playerId: p.id, from, to: `${p.league_id}/${from}` })
  }
  return moves
}

export function strayObjects(allPaths: string[], referenced: Set<string>): string[] {
  return allPaths.filter((p) => !inLeagueFolder(p) && !referenced.has(p))
}

export type MoveGroup = { from: string; targets: { playerId: string; to: string }[] }

// One group per legacy object: several players may share it, and it may only be removed after all of them moved.
export function groupMovesByFrom(moves: PhotoMove[]): MoveGroup[] {
  const groups = new Map<string, MoveGroup>()
  for (const m of moves) {
    const g = groups.get(m.from) ?? { from: m.from, targets: [] }
    g.targets.push({ playerId: m.playerId, to: m.to })
    groups.set(m.from, g)
  }
  return [...groups.values()]
}
