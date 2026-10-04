import { useState } from 'react'
import type { Player, Team } from '../lib/types'

interface TeamWithPlayers {
  team: Team
  players: Player[]
}

interface SwapDialogProps {
  teams: TeamWithPlayers[]
  onSwap: (p1Id: string, p2Id: string) => void
  onClose: () => void
}

const colorLabel: Record<string, string> = { red: 'Red', blue: 'Blue', yellow: 'Yellow' }

export function SwapDialog({ teams, onSwap, onClose }: SwapDialogProps) {
  const [firstId, setFirstId] = useState<string | null>(null)
  const [firstTeamId, setFirstTeamId] = useState<string | null>(null)

  const handleSelect = (playerId: string, teamId: string) => {
    if (!firstId) {
      setFirstId(playerId)
      setFirstTeamId(teamId)
    } else {
      onSwap(firstId, playerId)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold mb-2">Swap Players</h2>
        <p className="text-sm text-gray-400 mb-4">
          {!firstId ? 'Select first player' : 'Select player to swap with'}
        </p>

        {teams.map(({ team, players }) => (
          <div key={team.id} className="mb-4">
            <h3 className="text-xs uppercase text-gray-400 mb-2">{colorLabel[team.color]} Team</h3>
            <div className="space-y-1">
              {players.map((p) => {
                const isFirst = p.id === firstId
                const isDisabledSecond = firstId !== null && firstTeamId === team.id
                return (
                  <button
                    key={p.id}
                    disabled={isDisabledSecond && !isFirst}
                    onClick={() => handleSelect(p.id, team.id)}
                    className={`w-full text-left px-3 py-2 rounded text-sm ${
                      isFirst ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600 disabled:opacity-40'
                    }`}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <button onClick={onClose} className="text-sm text-gray-400">Cancel</button>
      </div>
    </div>
  )
}
