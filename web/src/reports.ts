// Hooks for reporting results, same pattern as auth.ts: queries read from the cache, mutations change things
// and then tell the cache what's out of date ("invalidate"), so TanStack Query refetches it.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cancelReport, confirmReport, createReport, fetchOpponents, fetchReports, rejectReport } from './api.ts'

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REPORTS }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REPORTS }),
  })
}

export function useCancelReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: cancelReport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REPORTS }),
  })
}
