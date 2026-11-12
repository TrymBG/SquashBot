// Rating over time. The x-axis is the match number (evenly spaced, even when several matches are played the
// same evening); the tooltip shows the date. Point 0 is the starting rating, so the line starts at 1000.
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { STARTING_RATING, type PlayerProfile } from '../api.ts'
import { formatDate, formatRating } from '../format.ts'

interface ChartPoint {
  match: number // 0 = start, 1 = first match, …
  rating: number
  playedAt: string | null // null for the start point
}

export default function RatingChart({ history }: { history: PlayerProfile['ratingHistory'] }) {
  const points: ChartPoint[] = [
    { match: 0, rating: STARTING_RATING, playedAt: null },
    ...history.map((point, index) => ({ match: index + 1, rating: point.rating, playedAt: point.playedAt })),
  ]

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="#1e293b" vertical={false} />
          <XAxis dataKey="match" stroke="#64748b" tickLine={false} />
          {/* Fit the axis to this player's range, so a 50-point swing isn't a flat line. */}
          <YAxis
            domain={['dataMin - 20', 'dataMax + 20']}
            tickFormatter={(value: number) => formatRating(value)}
            stroke="#64748b"
            tickLine={false}
            width={44}
          />
          <ReferenceLine y={STARTING_RATING} stroke="#475569" strokeDasharray="4 4" />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 6 }}
            labelStyle={{ color: '#94a3b8' }}
            labelFormatter={(_label, payload) => {
              const point = payload[0]?.payload as ChartPoint | undefined
              if (!point) return ''
              return point.playedAt ? `Match ${point.match} · ${formatDate(point.playedAt)}` : 'Start'
            }}
            formatter={(value) => [formatRating(Number(value)), 'Rating']}
          />
          <Line type="monotone" dataKey="rating" stroke="#38bdf8" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
