// A round robin's table. Ranked by wins: shows the game difference. Ranked by points: shows the points scored.
// Positions come from the backend (equal players share one), so this only displays them.
import { Link } from 'react-router'
import type { StandingRow, TournamentRanking } from '../api.ts'

export default function StandingsTable({ rows, ranking }: { rows: StandingRow[]; ranking: TournamentRanking }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-slate-400">
        <tr>
          <th className="w-10 py-2">#</th>
          <th className="py-2">Player</th>
          <th className="py-2 text-right">P</th>
          <th className="py-2 text-right">W</th>
          <th className="py-2 text-right">L</th>
          <th className="py-2 text-right">{ranking === 'points' ? 'Points' : '+/−'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const difference = row.scoreFor - row.scoreAgainst
          return (
            <tr key={row.playerId} className="border-t border-slate-800">
              <td className="py-2 text-slate-400">{row.position}</td>
              <td className="py-2">
                <Link to={`/players/${row.playerId}`} className="hover:underline">
                  {row.displayName}
                </Link>
              </td>
              <td className="py-2 text-right tabular-nums">{row.played}</td>
              <td className="py-2 text-right tabular-nums">{row.wins}</td>
              <td className="py-2 text-right tabular-nums">{row.losses}</td>
              <td className="py-2 text-right font-semibold tabular-nums">
                {ranking === 'points' ? row.scoreFor : difference > 0 ? `+${difference}` : difference}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
