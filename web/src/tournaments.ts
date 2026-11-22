// Hooks for the tournament pages, same pattern as reports.ts: queries read from the cache, mutations change
// something and then mark the tournament data as out of date ("invalidate"), so TanStack Query refetches it.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  addTournamentPlayer,
  createTournament,
  fetchTournament,
  fetchTournaments,
  removeTournamentPlayer,
  startTournament,
} from './api.ts'

// ['tournament'] matches every ['tournament', id] key too (TanStack compares key prefixes).
// The front page's "Your tournament matches" changes with them (a reported match drops off the list).
export function invalidateTournaments(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['tournaments'] }),
    queryClient.invalidateQueries({ queryKey: ['tournament'] }),
    queryClient.invalidateQueries({ queryKey: ['myTournamentMatches'] }),
  ])
}

export function useTournaments() {
  return useQuery({ queryKey: ['tournaments'], queryFn: fetchTournaments })
}

export function useTournament(id: number) {
  return useQuery({ queryKey: ['tournament', id], queryFn: () => fetchTournament(id) })
}

export function useCreateTournament() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTournament,
    onSuccess: () => invalidateTournaments(queryClient),
  })
}

export function useAddPlayer(tournamentId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (playerId: string) => addTournamentPlayer(tournamentId, playerId),
    onSuccess: () => invalidateTournaments(queryClient),
  })
}

export function useRemovePlayer(tournamentId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (playerId: string) => removeTournamentPlayer(tournamentId, playerId),
    onSuccess: () => invalidateTournaments(queryClient),
  })
}

export function useStartTournament(tournamentId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => startTournament(tournamentId),
    onSuccess: () => invalidateTournaments(queryClient),
  })
}
