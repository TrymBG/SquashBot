// The front page's feed: everyone's latest matches, newest first, 20 at a time with "Load more".
// Each row: "Nora beat Jonas 3–1" with the score in scoreboard type, then the format tag, the tournament and the winner's
// rating change (or Unranked / Pending); how long ago sits on the right.
import { Link } from 'react-router'
import type { FeedMatch } from '../api.ts'
import { formatTimeAgo } from '../format.ts'
import { useRecentMatches } from '../home.ts'
import Avatar from './Avatar.tsx'
import FormatTag from './FormatTag.tsx'
import Meta from './Meta.tsx'
import TrophyIcon from './TrophyIcon.tsx'

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
          <span className="type-figure text-lg">
            {match.winnerGames}–{match.loserGames}
          </span>
        </p>
        <Meta>
          <FormatTag format={match.format} />
          {match.tournament && (
            <Link to={`/tournaments/${match.tournament.id}`} className="inline-flex items-center gap-1 text-accent hover:underline">
              <TrophyIcon />
              {match.tournament.name}
            </Link>
          )}
          <WinnerChange match={match} />
        </Meta>
      </div>
      <span className="self-start pt-1 text-sm whitespace-nowrap text-faint">{formatTimeAgo(match.playedAt)}</span>
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
    return (
      <span>
        <span className="font-semibold text-win tabular-nums">+{Math.round(match.winnerChange)}</span> rating
      </span>
    )
  }
  return <span className="text-faint">{match.ranked ? 'Rating pending' : 'Unranked'}</span>
}
