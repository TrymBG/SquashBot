// A player's matches, newest first, 20 at a time with a "Load more" button, optionally filtered.
// useInfiniteQuery keeps every loaded page; each next page asks for the matches older than the last one
// shown (the API's `nextBefore` cursor). The filters are part of the query key, so each filter combination
// gets its own cached pages and a fresh start when the filters change.
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchPlayerMatches, type MatchFilters, type PlayerMatch } from '../api.ts'
import { formatDate, formatMatchFormat, formatRatingChange } from '../format.ts'
import Avatar from './Avatar.tsx'
import ResultBadge from './ResultBadge.tsx'

export default function MatchHistory({ playerId, filters = {} }: { playerId: string; filters?: MatchFilters }) {
  const { data, isPending, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['playerMatches', playerId, filters],
    queryFn: ({ pageParam }) => fetchPlayerMatches(playerId, filters, pageParam),
    initialPageParam: undefined as number | undefined, // the first page has no cursor
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined, // undefined = no more pages
  })

  if (isPending) return <p className="text-muted">Loading matches…</p>
  if (isError) return <p className="text-loss">Could not load the match history.</p>

  const matches = data.pages.flatMap((page) => page.matches)
  if (matches.length === 0) return <p className="text-muted">No matches with these filters.</p>

  return (
    <div>
      <ul className="divide-y divide-line">
        {matches.map((match) => {
          return (
            <li key={match.matchId} className="flex items-center gap-3 py-3">
              <ResultBadge result={match.won ? 'W' : 'L'} />
              <Link to={`/players/${match.opponentId}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
                <Avatar name={match.opponentName} url={match.opponentAvatarUrl} />
                <span className="truncate">{match.opponentName}</span>
              </Link>
              {match.tournament && (
                <Link to={`/tournaments/${match.tournament.id}`} className="truncate text-xs text-accent hover:underline">
                  🏆 {match.tournament.name}
                </Link>
              )}
              <span className="font-semibold tabular-nums">
                {match.myGames}–{match.opponentGames}
              </span>
              <span className="w-10 text-sm text-muted">{formatMatchFormat(match.format)}</span>
              <span className="hidden w-28 text-sm text-muted sm:inline">{formatDate(match.playedAt)}</span>
              <RatingChange match={match} />
            </li>
          )
        })}
      </ul>

      {hasNextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-4 w-full rounded border border-line-strong py-2 text-sm text-soft hover:bg-surface-hover disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}

// "+16" / "−12" for a rated match; "Unranked" for a match that never counts; "Pending" for a ranked tournament
// match whose tournament hasn't finished yet (it's rated when it does).
function RatingChange({ match }: { match: PlayerMatch }) {
  if (match.ratingBefore !== null && match.ratingAfter !== null) {
    return (
      <span className={`w-16 text-right font-semibold tabular-nums ${match.won ? 'text-win' : 'text-loss'}`}>
        {formatRatingChange(match.ratingBefore, match.ratingAfter)}
      </span>
    )
  }
  return (
    <span className="w-16 text-right text-xs text-faint" title={match.ranked ? 'Rated when the tournament is finished' : undefined}>
      {match.ranked ? 'Pending' : 'Unranked'}
    </span>
  )
}
