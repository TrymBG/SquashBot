// /groups/new: name a group, create it, and land on its page (where the invite link is ready to share).
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useCurrentUser } from '../auth.ts'
import LeaderboardTabs from '../components/LeaderboardTabs.tsx'
import TextField from '../components/TextField.tsx'
import { useCreateGroup } from '../groups.ts'

export default function NewGroupPage() {
  const currentUser = useCurrentUser()
  const navigate = useNavigate()
  const create = useCreateGroup()
  const [name, setName] = useState('')

  if (currentUser === undefined) return null
  if (currentUser === null) return <Navigate to="/login?next=/groups/new" replace />

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    create.mutate(name, { onSuccess: (group) => navigate(`/groups/${group.id}`) })
  }

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="type-title mb-6">Leaderboard</h1>
      <LeaderboardTabs />
      <h2 className="type-heading">New group</h2>
      <p className="mt-1 mb-4 text-muted">
        A group gets its own leaderboard with just its members, ranked by the same ratings. You get a link to invite
        people.
      </p>
      <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
        <TextField label="Group name" required maxLength={40} value={name} onValueChange={setName} />
        {create.error && <p className="text-sm text-loss">{create.error.message}</p>}
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
        >
          {create.isPending ? 'Creating…' : 'Create group'}
        </button>
      </form>
    </section>
  )
}
