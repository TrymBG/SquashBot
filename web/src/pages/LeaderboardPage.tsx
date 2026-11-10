// The front page: everyone with at least one match, highest rating first.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchLeaderboard } from '../api.ts'
import Avatar from '../components/Avatar.tsx'

export default function LeaderboardPage() {
  // TanStack Query runs fetchLeaderboard, caches the result under this key, and re-renders on loading/success/error.
  const { data: players, isPending, isError } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: fetchLeaderboard,
  })

  if (isPending) return <p className="text-slate-400">Loading…</p>
  if (isError) return <p className="text-red-400">Could not load the leaderboard. Is the API running?</p>
  if (players.length === 0) return <p className="text-slate-400">No matches yet. Use /result in Discord to log one!</p>

  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">Leaderboard</h1>
      <table className="w-full text-left">
        <thead className="text-sm text-slate-400">
          <tr>
            <th className="w-12 py-2">#</th>
            <th className="py-2">Player</th>
            <th className="py-2 text-right">Rating</th>
            <th className="py-2 text-right">W–L</th>
            <th className="py-2 text-right">Win %</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, index) => {
            const played = player.wins + player.losses
            return (
              <tr key={player.id} className="border-t border-slate-800">
                <td className="py-3 text-slate-400">{index + 1}</td>
                <td className="py-3">
                  <Link to={`/players/${player.id}`} className="flex items-center gap-3 hover:underline">
                    <Avatar name={player.displayName} url={player.avatarUrl} />
                    {player.displayName}
                  </Link>
                </td>
                <td className="py-3 text-right font-semibold tabular-nums">{Math.round(player.rating)}</td>
                <td className="py-3 text-right tabular-nums">
                  {player.wins}–{player.losses}
                </td>
                <td className="py-3 text-right tabular-nums">{Math.round((player.wins / played) * 100)}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
