// The front page's side column: the top of the ladder (10 plates), your own plate highlighted, and a link to the rest.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchLeaderboard } from '../api.ts'
import { useCurrentUser } from '../auth.ts'
import Ladder from './Ladder.tsx'

const ROWS = 10

export default function LeaderboardWidget() {
  // Same query key as the leaderboard page, so the two share one cached answer.
  const { data: players, isPending, isError } = useQuery({ queryKey: ['leaderboard'], queryFn: fetchLeaderboard })
  const currentUser = useCurrentUser()
  const me = currentUser?.playerId
  // Logged in but not on the ladder (no rated match yet): show your name on a dashed plate at the bottom.
  const notOnLadder = currentUser && players && !players.some((p) => p.id === me) ? currentUser.displayName : undefined

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="type-heading">Leaderboard</h2>
        <Link to="/leaderboard" className="text-sm text-accent hover:underline">
          Full leaderboard
        </Link>
      </div>
      {isPending && <p className="text-sm text-muted">Loading…</p>}
      {isError && <p className="text-sm text-loss">Could not load the leaderboard.</p>}
      {players?.length === 0 && <p className="text-sm text-muted">Nobody is on the ladder yet.</p>}
      {players && players.length > 0 && <Ladder players={players.slice(0, ROWS)} me={me} notOnLadder={notOnLadder} />}
    </section>
  )
}
