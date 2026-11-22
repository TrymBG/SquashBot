// The front page's feed: everyone's latest matches, newest first, 20 at a time with "Load more".
// Each row: "Nora beat Jonas 3–1", the format, the winner's rating change (or Unranked / Pending), the tournament, and when.
import { Link } from 'react-router'
import type { FeedMatch } from '../api.ts'
import { formatMatchFormat, formatTimeAgo } from '../format.ts'
import { useRecentMatches } from '../home.ts'
import Avatar from './Avatar.tsx'

export default function ActivityFeed() {
  const { data, isPending, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useRecentMatches()

  if (isPending) return <p className="text-muted">Loading…</p>
  if (isError) return <p className="text-loss">Could not load the latest matches.</p>

  const matches = data.pages.flatMap((page) => page.matches)
  if (matches.length === 0) return <p className="text-muted">No matches yet.</p>

  return (
    <div>
      <ul className="divide-y divide-line">
        {matches.map((match) => (
          <FeedRow key={match.matchId} match={match} />
        ))}
      </ul>
      {hasNextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-3 w-full rounded border border-line-strong py-2 text-sm text-soft hover:bg-surface-hover disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}

function FeedRow({ match }: { match: FeedMatch }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <Avatar name={match.winner.displayName} url={match.winner.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate">
          <PlayerLink player={match.winner} /> <span className="text-muted">beat</span> <PlayerLink player={match.loser} />{' '}
          <span className="font-semibold">
            {match.winnerGames}–{match.loserGames}
          </span>
        </p>
        <p className="truncate text-sm text-muted">
          {formatMatchFormat(match.format)}
          {match.tournament && (
            <>
              {' · '}
              <Link to={`/tournaments/${match.tournament.id}`} className="text-accent hover:underline">
                🏆 {match.tournament.name}
              </Link>
            </>
          )}
          {' · '}
          {formatTimeAgo(match.playedAt)}
        </p>
      </div>
      <WinnerChange match={match} />
    </li>
  )
}

function PlayerLink({ player }: { player: FeedMatch['winner'] }) {
  return (
    <Link to={`/players/${player.id}`} className="font-semibold hover:underline">
      {player.displayName}
    </Link>
  )
}

// The winner's gain ("+14"), or why there is none.
function WinnerChange({ match }: { match: FeedMatch }) {
  if (match.winnerChange !== null) {
    return <span className="text-sm font-semibold text-win">+{Math.round(match.winnerChange)}</span>
  }
  return <span className="text-xs text-faint">{match.ranked ? 'Pending' : 'Unranked'}</span>
}
