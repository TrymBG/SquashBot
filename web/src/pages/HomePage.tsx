// The front page. Logged in: your dashboard (rating, results waiting for you, your tournament matches) and the
// activity feed. Logged out: a short "log in" note and the feed. The compact leaderboard sits in the right column
// on wide screens and below everything on phones.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchPlayerProfile, type User } from '../api.ts'
import { useCurrentUser } from '../auth.ts'
import ActivityFeed from '../components/ActivityFeed.tsx'
import LeaderboardWidget from '../components/LeaderboardWidget.tsx'
import Panel from '../components/Panel.tsx'
import ReportList from '../components/ReportList.tsx'
import StatTile from '../components/StatTile.tsx'
import { formatMatchFormat, formatRating } from '../format.ts'
import { useMyTournamentMatches } from '../home.ts'
import { useReports } from '../reports.ts'

export default function HomePage() {
  const currentUser = useCurrentUser()

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-6">
        {currentUser ? <Dashboard user={currentUser} /> : currentUser === null ? <LoggedOut /> : null}
        <Panel title="Latest matches">
          <ActivityFeed />
        </Panel>
      </div>
      <aside>
        <LeaderboardWidget />
      </aside>
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

  return (
    <Panel>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Hi {user.displayName}</h1>
          <Link to={`/players/${user.playerId}`} className="text-sm text-muted hover:underline">
            Your profile →
          </Link>
        </div>
        {profile.data && (
          <StatTile
            label="Your rating"
            value={formatRating(profile.data.rating)}
            change={{ amount: profile.data.ratingChangeWeek, period: 'this week' }}
          />
        )}
      </div>

      {waiting.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Waiting for you</h2>
          <ReportList reports={waiting} kind="incoming" />
        </div>
      )}

      {toPlay.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Your tournament matches</h2>
          <ul className="divide-y divide-line">
            {toPlay.map((m) => (
              <li key={m.tournamentMatchId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="flex-1">
                  vs <span className="font-semibold">{m.opponent.displayName}</span>{' '}
                  <span className="text-sm text-muted">
                    · 🏆 {m.tournamentName} · {formatMatchFormat(m.matchFormat)}
                  </span>
                </span>
                <Link to={`/tournaments/${m.tournamentId}`} className="text-sm text-accent hover:underline">
                  Report result →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reports.isSuccess && tournamentMatches.isSuccess && waiting.length === 0 && toPlay.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          All caught up. Played a match?{' '}
          <Link to="/results" className="text-accent hover:underline">
            Register a result
          </Link>
        </p>
      )}
    </Panel>
  )
}

function LoggedOut() {
  return (
    <Panel>
      <h1 className="text-xl font-bold">Squash Ladder</h1>
      <p className="mt-1 text-muted">
        Ratings, results and tournaments for our squash group.{' '}
        <Link to="/login" className="text-accent hover:underline">
          Log in
        </Link>{' '}
        to register results.
      </p>
    </Panel>
  )
}
