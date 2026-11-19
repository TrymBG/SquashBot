// Dev only: a "Log in as…" dropdown for testing with many players in one browser. Renders nothing unless the API
// runs with DEV_LOGIN=1 (`npm run dev:web` does); in production the route doesn't exist, so this never shows.
import { useCurrentUser, useDevLoginAs, useDevUsers } from '../auth.ts'

export default function DevLoginSwitcher() {
  const users = useDevUsers()
  const currentUser = useCurrentUser()
  const loginAs = useDevLoginAs()

  if (!users.data || users.data.length === 0) return null

  return (
    <select
      aria-label="Dev: log in as"
      title="Dev only: switch to another test account"
      value={currentUser?.playerId ?? ''}
      disabled={loginAs.isPending}
      onChange={(e) => e.target.value && loginAs.mutate(e.target.value)}
      className="rounded border border-dashed border-amber-700 bg-slate-950 px-2 py-1 text-xs text-amber-300"
    >
      <option value="">Dev: log in as…</option>
      {users.data.map((u) => (
        <option key={u.playerId} value={u.playerId}>
          {u.displayName}
        </option>
      ))}
    </select>
  )
}
