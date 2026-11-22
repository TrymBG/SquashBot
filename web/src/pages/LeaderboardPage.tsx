// /leaderboard: the whole ladder, best rating at the top, with the movement since last week.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchLeaderboard } from '../api.ts'
import { useCurrentUser } from '../auth.ts'
import Ladder from '../components/Ladder.tsx'

export default function LeaderboardPage() {
  // TanStack Query runs fetchLeaderboard, caches the result under this key, and re-renders on loading/success/error.
  const { data: players, isPending, isError } = useQuery({ queryKey: ['leaderboard'], queryFn: fetchLeaderboard })
  const me = useCurrentUser()?.playerId

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="type-title">Leaderboard</h1>
      <p className="mt-1 mb-6 text-muted">Ranked by rating. Arrows show places gained or lost since last week.</p>
      {isPending && <p className="text-muted">Loading…</p>}
      {isError && <p className="text-loss">Could not load the leaderboard. Reload the page to try again.</p>}
      {players?.length === 0 && (
        <p className="text-muted">
          Nobody is on the ladder yet.{' '}
          <Link to="/results" className="text-accent hover:underline">
            Register a result
          </Link>{' '}
          to get on it.
        </p>
      )}
      {players && players.length > 0 && <Ladder players={players} me={me} full />}
    </section>
  )
}
