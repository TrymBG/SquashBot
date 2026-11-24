// The front page. Logged in: your dashboard (rating, results waiting for you, your tournament matches) and the
// activity feed. Logged out: a short intro and the feed. The top of the ladder sits in the right column on wide
// screens and right after the dashboard on phones. The dashboard is the hero: no card around it, your rating in big type.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchPlayerProfile, type User } from '../api.ts'
import { useCurrentUser } from '../auth.ts'
import ActivityFeed from '../components/ActivityFeed.tsx'
import FormatTag from '../components/FormatTag.tsx'
import LeaderboardWidget from '../components/LeaderboardWidget.tsx'
import NextRung from '../components/NextRung.tsx'
import ReportList from '../components/ReportList.tsx'
import StatTile from '../components/StatTile.tsx'
import TrophyIcon from '../components/TrophyIcon.tsx'
import { formatRating } from '../format.ts'
import { useMyTournamentMatches } from '../home.ts'
import { useReports } from '../reports.ts'

export default function HomePage() {
  const currentUser = useCurrentUser()

  return (
    // Order in the page = order on a phone: dashboard, ladder, feed (the ladder shouldn't sit under 20 matches).
    // On wide screens the grid puts the ladder in the right column, next to both (row-span-2), at the top.
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr]">
      <div>{currentUser ? <Dashboard user={currentUser} /> : currentUser === null ? <LoggedOut /> : null}</div>
      <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <LeaderboardWidget />
      </aside>
      <section>
        <h2 className="type-heading mb-2">Latest matches</h2>
        <ActivityFeed />
      </section>
    </div>
  )
}

function Dashboard({ user }: { user: User }) {
  // Same query key as the profile page, so both share one cached profile.
  const profile = useQuery({ queryKey: ['player', user.playerId], queryFn: () => fetchPlayerProfile(user.playerId) })
  const reports = useReports(true)
  const tournamentMatches = useMyTournamentMatches(true)
  const waiting = reports.data?.incoming ?? []
  const toPlay = tournamentMatches.data ?? []
  // On the ladder = has at least one rated match (the profile's position is null until then).
  const onLadder = profile.data ? profile.data.position !== null : undefined

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">Hi {user.displayName}</h1>
          <Link to={`/players/${user.playerId}`} className="text-sm text-accent hover:underline">
            Your profile
          </Link>
        </div>
        {onLadder && profile.data && (
          <StatTile
            label="Your rating"
            value={formatRating(profile.data.rating)}
            change={{ amount: profile.data.ratingChangeWeek, period: 'this week' }}
          />
        )}
      </div>

      {onLadder === false && <NotOnLadderYet />}
      {onLadder && <NextRung me={user.playerId} />}

      {waiting.length > 0 && (
        <div className="mt-6">
          <h2 className="type-heading mb-1">Waiting for you</h2>
          <ReportList reports={waiting} kind="incoming" />
        </div>
      )}

      {toPlay.length > 0 && (
        <div className="mt-6">
          <h2 className="type-heading mb-1">Your tournament matches</h2>
          <ul className="divide-y divide-line">
            {toPlay.map((m) => (
              <li key={m.tournamentMatchId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    vs <span className="font-semibold">{m.opponent.displayName}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm text-muted">
                    <TrophyIcon />
                    {m.tournamentName}
                  </span>
                  <FormatTag format={m.matchFormat} />
                </span>
                <Link to={`/tournaments/${m.tournamentId}`} className="text-sm text-accent hover:underline">
                  Report result
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onLadder && reports.isSuccess && tournamentMatches.isSuccess && waiting.length === 0 && toPlay.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          All caught up. Played a match?{' '}
          <Link to="/results" className="text-accent hover:underline">
            Register a result
          </Link>
        </p>
      )}
    </section>
  )
}

// A new player's first visit: no rating to show yet, so say what gets them on the ladder.
function NotOnLadderYet() {
  return (
    <div className="mt-6 rounded-sm border border-dashed border-line-strong p-5">
      <h2 className="type-heading">You're not on the ladder yet</h2>
      <p className="mt-1 text-muted">Play a match and register it. Your plate goes up with your first rated result.</p>
      <Link
        to="/results"
        className="mt-4 inline-block rounded bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-hover"
      >
        Register a result
      </Link>
    </div>
  )
}

function LoggedOut() {
  return (
    <section>
      <h1 className="type-title">Squash Ladder</h1>
      <p className="mt-1 text-muted">
        Ratings, results and tournaments for our squash group.{' '}
        <Link to="/login" className="text-accent hover:underline">
          Log in
        </Link>{' '}
        to register results.
      </p>
    </section>
  )
}
