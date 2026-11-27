// /join/:code, the group invite link. Logged in: "Join Tuesday crew (5 members)" and a button. Logged out: log in or sign
// up first; `next` brings you back here afterwards. Groups are members-only, so a logged-out visitor doesn't see the name.
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { isNotFound } from '../api.ts'
import { useCurrentUser } from '../auth.ts'
import { useInvite, useJoinGroup } from '../groups.ts'

export default function JoinPage() {
  const { code = '' } = useParams()
  const currentUser = useCurrentUser()
  const invite = useInvite(code, Boolean(currentUser))
  const join = useJoinGroup()
  const navigate = useNavigate()
  const next = encodeURIComponent(`/join/${code}`)

  if (currentUser === undefined) return null

  if (currentUser === null) {
    return (
      <Box title="You're invited to a group">
        <p className="text-muted">Log in or sign up to see the group and join its leaderboard.</p>
        <div className="mt-4 flex gap-3">
          <Link to={`/login?next=${next}`} className="rounded bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-hover">
            Log in
          </Link>
          <Link to={`/signup?next=${next}`} className="rounded border border-line-strong px-4 py-2 font-semibold hover:bg-surface-hover">
            Sign up
          </Link>
        </div>
      </Box>
    )
  }

  if (invite.isPending) return <p className="text-muted">Loading…</p>
  if (invite.isError) {
    return (
      <Box title="This link doesn't work">
        <p className="text-muted">
          {isNotFound(invite.error)
            ? 'The invite link was renewed or the group was deleted. Ask a member for the current link.'
            : invite.error.message}
        </p>
      </Box>
    )
  }

  const group = invite.data
  return (
    <Box title={`Join ${group.name}`}>
      <p className="text-muted">
        {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}. The group has its own leaderboard with
        just its members; your rating stays the same everywhere.
      </p>
      {join.error && <p className="mt-2 text-sm text-loss">{join.error.message}</p>}
      <button
        type="button"
        disabled={join.isPending}
        onClick={() => join.mutate(code, { onSuccess: ({ groupId }) => navigate(`/groups/${groupId}`) })}
        className="mt-4 rounded bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
      >
        {join.isPending ? 'Joining…' : `Join ${group.name}`}
      </button>
    </Box>
  )
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-md rounded-sm border border-line p-6">
      <h1 className="type-title mb-2">{title}</h1>
      {children}
    </section>
  )
}
