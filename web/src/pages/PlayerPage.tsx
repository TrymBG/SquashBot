// A player's profile: header with rating and record, recent form, rating chart and match history.
import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router'
import { fetchPlayerProfile, isNotFound, STARTING_RATING, type MatchFilters as Filters, type PlayerProfile } from '../api.ts'
import { useCurrentUser } from '../auth.ts'
import { formatPercent, formatRating } from '../format.ts'
import { findFormat } from '../formats.ts'
import Avatar from '../components/Avatar.tsx'
import MatchFilters from '../components/MatchFilters.tsx'
import MatchHistory from '../components/MatchHistory.tsx'
import RatingChart from '../components/RatingChart.tsx'
import ResultBadge from '../components/ResultBadge.tsx'


export default function PlayerPage() {
  const { id = '' } = useParams() // the :id part of /players/:id (always there on this route)
  const [searchParams] = useSearchParams() // ?opponent=…&format=… (set by MatchFilters)
  const isMe = useCurrentUser()?.playerId === id
  const { data: profile, isPending, error } = useQuery({
    queryKey: ['player', id],
    queryFn: () => fetchPlayerProfile(id),
  })

  if (isPending) return <p className="text-muted">Loading…</p>
  if (isNotFound(error)) return <NotFound />
  if (error) return <p className="text-loss">Could not load this player. Is the API running?</p>

  const played = profile.wins + profile.losses

  // Filters from the URL. Values that don't fit (an opponent they never played, a made-up format) are ignored,
  // so an old or hand-edited link shows all matches instead of an error.
  const opponent = profile.opponents.find((o) => o.id === searchParams.get('opponent'))
  const format = findFormat(searchParams.get('format'))?.value
  const filters: Filters = { ...(opponent ? { opponent: opponent.id } : {}), ...(format ? { format } : {}) }

  return (
    <div className="space-y-8">
      <Link to="/leaderboard" className="text-sm text-muted hover:underline">
        ← Leaderboard
      </Link>

      <ProfileHeader profile={profile} />

      {played === 0 ? (
        <NoMatchesYet name={profile.displayName} isMe={isMe} />
      ) : (
        <>
          <section>
            <h2 className="mb-2 type-heading">Recent form</h2>
            <div className="flex gap-1">
              {profile.recentForm.map((result, index) => (
                <ResultBadge key={index} result={result} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 type-heading">Rating</h2>
            <RatingChart history={profile.ratingHistory} />
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="type-heading">Matches</h2>
              <MatchFilters opponents={profile.opponents} />
            </div>
            {/* The record against the chosen opponent, over all their matches (not just the loaded page). */}
            {opponent && (
              <p className="mb-2 text-sm">
                vs <span className="font-semibold">{opponent.displayName}</span>: {opponent.wins}–{opponent.losses}
              </p>
            )}
            {/* key: a fresh match list when going from one profile to another (e.g. clicking an opponent) */}
            <MatchHistory key={profile.id} playerId={profile.id} filters={filters} />
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
        <h1 className="type-title">{profile.displayName}</h1>
        {profile.position !== null && (
          <p className="text-sm text-muted">
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
      <dt className="text-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

// A profile with no matches: an invitation for yourself, a plain note for someone else.
function NoMatchesYet({ name, isMe }: { name: string; isMe: boolean }) {
  if (!isMe) return <p className="text-muted">{name} hasn't played a match yet.</p>
  return (
    <div className="rounded-sm border border-dashed border-line-strong p-5">
      <h2 className="type-heading">No matches yet</h2>
      <p className="mt-1 text-muted">
        Your rating chart and match history start with your first result. Everyone starts at {STARTING_RATING}.
      </p>
      <Link
        to="/results"
        className="mt-4 inline-block rounded bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-hover"
      >
        Register a result
      </Link>
    </div>
  )
}

function NotFound() {
  return (
    <div className="space-y-4">
      <p className="text-muted">Player not found.</p>
      <Link to="/leaderboard" className="text-sm text-muted hover:underline">
        ← Leaderboard
      </Link>
    </div>
  )
}
