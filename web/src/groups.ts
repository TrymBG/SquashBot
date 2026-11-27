// Hooks for groups, same pattern as tournaments.ts: queries read from the cache; mutations change something and then
// mark group data as out of date ("invalidate"), so TanStack Query refetches it.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  createGroup,
  deleteGroup,
  fetchGroup,
  fetchGroupLeaderboard,
  fetchInvite,
  fetchMyGroups,
  joinGroup,
  leaveGroup,
  removeGroupMember,
  renewGroupInvite,
} from './api.ts'

// ['group'] also matches ['group', id] and ['group', id, 'leaderboard'] (TanStack compares key prefixes).
function invalidateGroups(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['groups'] }),
    queryClient.invalidateQueries({ queryKey: ['group'] }),
  ])
}

// Your groups (for the tabs). Only asked when logged in.
export function useMyGroups(enabled: boolean) {
  return useQuery({ queryKey: ['groups'], queryFn: fetchMyGroups, enabled })
}

export function useGroup(id: number) {
  return useQuery({ queryKey: ['group', id], queryFn: () => fetchGroup(id) })
}

export function useGroupLeaderboard(id: number) {
  return useQuery({ queryKey: ['group', id, 'leaderboard'], queryFn: () => fetchGroupLeaderboard(id) })
}

export function useInvite(code: string, enabled: boolean) {
  return useQuery({ queryKey: ['invite', code], queryFn: () => fetchInvite(code), enabled, retry: false })
}

export function useCreateGroup() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: createGroup, onSuccess: () => invalidateGroups(queryClient) })
}

export function useJoinGroup() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: joinGroup, onSuccess: () => invalidateGroups(queryClient) })
}

export function useRenewInvite(id: number) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: () => renewGroupInvite(id), onSuccess: () => invalidateGroups(queryClient) })
}

export function useRemoveMember(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (playerId: string) => removeGroupMember(id, playerId),
    onSuccess: () => invalidateGroups(queryClient),
  })
}

export function useLeaveGroup(id: number) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: () => leaveGroup(id), onSuccess: () => invalidateGroups(queryClient) })
}

export function useDeleteGroup(id: number) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: () => deleteGroup(id), onSuccess: () => invalidateGroups(queryClient) })
}
