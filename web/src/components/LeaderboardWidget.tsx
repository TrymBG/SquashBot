// The compact leaderboard for the front page's side column: top 10, your own row highlighted, link to the full table.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchLeaderboard } from '../api.ts'
import { useCurrentUser } from '../auth.ts'
import { formatRating } from '../format.ts'
import Panel from './Panel.tsx'

const ROWS = 10

export default function LeaderboardWidget() {
  // Same query key as the leaderboard page, so the two share one cached answer.
  const { data: players, isPending, isError } = useQuery({ queryKey: ['leaderboard'], queryFn: fetchLeaderboard })
  const me = useCurrentUser()?.playerId

  return (
    <Panel
      title="Leaderboard"
      action={
        <Link to="/leaderboard" className="text-sm text-accent hover:underline">
          Full →
        </Link>
      }
    >
      {isPending && <p className="text-sm text-muted">Loading…</p>}
      {isError && <p className="text-sm text-loss">Could not load.</p>}
      {players?.length === 0 && <p className="text-sm text-muted">No rated matches yet.</p>}
      <ol className="space-y-1">
        {players?.slice(0, ROWS).map((player, index) => (
          <li key={player.id}>
            <Link
              to={`/players/${player.id}`}
              className={`flex items-center gap-2 rounded px-2 py-1 hover:bg-surface-hover ${player.id === me ? 'bg-accent/10' : ''}`}
            >
              <span className="w-5 text-sm text-muted tabular-nums">{index + 1}</span>
              <span className="flex-1 truncate">{player.displayName}</span>
              <span className="text-sm font-semibold tabular-nums">{formatRating(player.rating)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  )
}
