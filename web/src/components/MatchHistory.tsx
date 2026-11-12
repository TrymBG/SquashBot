// A player's matches, newest first, 20 at a time with a "Load more" button.
// useInfiniteQuery keeps every loaded page; each next page asks for the matches older than the last one
// shown (the API's `nextBefore` cursor).
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchPlayerMatches } from '../api.ts'
import { formatDate, formatMatchFormat, formatRatingChange } from '../format.ts'
import Avatar from './Avatar.tsx'
import ResultBadge from './ResultBadge.tsx'

export default function MatchHistory({ playerId }: { playerId: string }) {
  const { data, isPending, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['playerMatches', playerId],
    queryFn: ({ pageParam }) => fetchPlayerMatches(playerId, pageParam),
    initialPageParam: undefined as number | undefined, // the first page has no cursor
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined, // undefined = no more pages
  })

  if (isPending) return <p className="text-slate-400">Loading matches…</p>
  if (isError) return <p className="text-red-400">Could not load the match history.</p>

  const matches = data.pages.flatMap((page) => page.matches)

  return (
    <div>
      <ul className="divide-y divide-slate-800">
        {matches.map((match) => {
          const change = formatRatingChange(match.ratingBefore, match.ratingAfter)
          return (
            <li key={match.matchId} className="flex items-center gap-3 py-3">
              <ResultBadge result={match.won ? 'W' : 'L'} />
              <Link to={`/players/${match.opponentId}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
                <Avatar name={match.opponentName} url={match.opponentAvatarUrl} />
                <span className="truncate">{match.opponentName}</span>
              </Link>
              <span className="font-semibold tabular-nums">
                {match.myGames}–{match.opponentGames}
              </span>
              <span className="w-10 text-sm text-slate-400">{formatMatchFormat(match.format)}</span>
              <span className="hidden w-28 text-sm text-slate-400 sm:inline">{formatDate(match.playedAt)}</span>
              <span className={`w-12 text-right font-semibold tabular-nums ${match.won ? 'text-emerald-400' : 'text-rose-400'}`}>
                {change}
              </span>
            </li>
          )
        })}
      </ul>

      {hasNextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-4 w-full rounded border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-900 disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
