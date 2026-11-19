// Hooks for reporting results, same pattern as auth.ts: queries read from the cache, mutations change things
// and then tell the cache what's out of date ("invalidate"), so TanStack Query refetches it.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cancelReport, confirmReport, createReport, fetchOpponents, fetchReports, rejectReport } from './api.ts'
import { invalidateTournaments } from './tournaments.ts'

const REPORTS = ['reports']

// `enabled: false` while logged out: these endpoints need a login, so don't ask (and get 401s) without one.
export function useOpponents(enabled = true) {
  return useQuery({ queryKey: ['opponents'], queryFn: fetchOpponents, enabled })
}

export function useReports(enabled = true) {
  return useQuery({ queryKey: REPORTS, queryFn: fetchReports, enabled })
}

export function useCreateReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createReport,
    // A tournament match moves to/from "waiting for confirmation", so refresh the tournament pages too.
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: REPORTS }), invalidateTournaments(queryClient)]),
  })
}

// Confirming records a match: ratings, the leaderboard, profiles and match lists all change, so refresh everything.
export function useConfirmReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: confirmReport,
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

export function useRejectReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: rejectReport,
    // A tournament match moves to/from "waiting for confirmation", so refresh the tournament pages too.
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: REPORTS }), invalidateTournaments(queryClient)]),
  })
}

export function useCancelReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: cancelReport,
    // A tournament match moves to/from "waiting for confirmation", so refresh the tournament pages too.
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: REPORTS }), invalidateTournaments(queryClient)]),
  })
}
