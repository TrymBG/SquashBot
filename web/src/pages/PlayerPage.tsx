// A player's profile: header with rating and record, recent form, rating chart and match history.
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { fetchPlayerProfile, isNotFound, type PlayerProfile } from '../api.ts'
import { formatPercent, formatRating } from '../format.ts'
import Avatar from '../components/Avatar.tsx'
import MatchHistory from '../components/MatchHistory.tsx'
import RatingChart from '../components/RatingChart.tsx'
import ResultBadge from '../components/ResultBadge.tsx'

export default function PlayerPage() {
  const { id = '' } = useParams() // the :id part of /players/:id (always there on this route)
  const { data: profile, isPending, error } = useQuery({
    queryKey: ['player', id],
    queryFn: () => fetchPlayerProfile(id),
  })

  if (isPending) return <p className="text-slate-400">Loading…</p>
  if (isNotFound(error)) return <NotFound />
  if (error) return <p className="text-red-400">Could not load this player. Is the API running?</p>

  const played = profile.wins + profile.losses

  return (
    <div className="space-y-8">
      <Link to="/" className="text-sm text-slate-400 hover:underline">
        ← Leaderboard
      </Link>

      <ProfileHeader profile={profile} />

      {played === 0 ? (
        <p className="text-slate-400">No matches yet.</p>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Recent form</h2>
            <div className="flex gap-1">
              {profile.recentForm.map((result, index) => (
                <ResultBadge key={index} result={result} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Rating</h2>
            <RatingChart history={profile.ratingHistory} />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Matches</h2>
            {/* key: a fresh match list when going from one profile to another (e.g. clicking an opponent) */}
            <MatchHistory key={profile.id} playerId={profile.id} />
          </section>
        </>
      )}
    </div>
  )
}

function ProfileHeader({ profile }: { profile: PlayerProfile }) {
  const streak = profile.streak
  return (
    <header className="flex flex-wrap items-center gap-4">
      <Avatar name={profile.displayName} url={profile.avatarUrl} size="lg" />
      <div className="flex-1">
        <h1 className="text-2xl font-bold">{profile.displayName}</h1>
        {profile.position !== null && (
          <p className="text-sm text-slate-400">
            #{profile.position} of {profile.rankedPlayers}
          </p>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <Stat label="Rating" value={formatRating(profile.rating)} />
        <Stat label="Peak" value={formatRating(profile.peakRating)} />
        <Stat
          label="Record"
          value={`${profile.wins}–${profile.losses}${profile.winRate === null ? '' : ` (${formatPercent(profile.winRate)})`}`}
        />
        <Stat label="Streak" value={streak ? `${streak.count} ${streak.result}` : '–'} />
      </dl>
    </header>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function NotFound() {
  return (
    <div className="space-y-4">
      <p className="text-slate-400">Player not found.</p>
      <Link to="/" className="text-sm text-slate-400 hover:underline">
        ← Leaderboard
      </Link>
    </div>
  )
}
