// Shown while the clock is stopped between periods: the score so far and the one thing to do next.
export function BetweenPeriods({ finished, team1Score, team2Score, actionLabel, onAction }: {
  finished: string
  team1Score: number
  team2Score: number
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 text-center">
      <div className="text-3xl font-bold mb-1">{team1Score} – {team2Score}</div>
      <p className="text-sm text-gray-300 mb-4">{finished}</p>
      <button onClick={onAction} className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-xl font-bold">
        {actionLabel}
      </button>
    </div>
  )
}
