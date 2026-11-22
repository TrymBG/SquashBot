// Hooks for the front page: the activity feed (paged, like a profile's match history) and my open tournament matches.
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { fetchMyTournamentMatches, fetchRecentMatches } from './api.ts'

export function useRecentMatches() {
  return useInfiniteQuery({
    queryKey: ['recentMatches'],
    queryFn: ({ pageParam }) => fetchRecentMatches(pageParam),
    initialPageParam: undefined as number | undefined, // the first page has no cursor
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined, // undefined = no more pages
  })
}

// `enabled: false` while logged out: the endpoint needs a login.
export function useMyTournamentMatches(enabled: boolean) {
  return useQuery({ queryKey: ['myTournamentMatches'], queryFn: fetchMyTournamentMatches, enabled })
}
