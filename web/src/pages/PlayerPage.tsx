// A player's profile. Placeholder for now: the real page (stats, rating chart, match history) is milestone 4.
import { Link, useParams } from 'react-router'

export default function PlayerPage() {
  const { id } = useParams() // the :id part of /players/:id

  return (
    <section>
      <p className="text-slate-400">Profile for player {id} is coming soon.</p>
      <Link to="/" className="mt-4 inline-block text-sm text-slate-400 hover:underline">
        ← Back to leaderboard
      </Link>
    </section>
  )
}
