// "Who is logged in", shared by every page. A hook is a reusable function that can use React state and the
// query cache, a bit like a small service class. No React Context needed: every component that calls
// useCurrentUser() reads the same cached answer under the key ['me'], and the mutations below update that entry.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe, login, logout, signup, type User } from './api.ts'

const ME = ['me']

// undefined while loading, null when logged out, the user when logged in.
export function useCurrentUser(): User | null | undefined {
  const { data } = useQuery({ queryKey: ME, queryFn: fetchMe })
  return data
}

// useMutation is TanStack Query's tool for requests that change something (POST). It gives `mutate` to start it,
// plus `isPending` and `error` for the form. On success we store the user in the cache, so the header updates at once.
export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => queryClient.setQueryData(ME, user),
  })
}

export function useSignup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: signup,
    onSuccess: (user) => queryClient.setQueryData(ME, user),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onSuccess: () => queryClient.setQueryData(ME, null),
  })
}
