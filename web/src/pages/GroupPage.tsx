// /groups/:id, for members only: the group's ladder (the overall ratings, filtered to the members), the invite link to
// share, the member list, and leaving or deleting the group. The owner also renews the link and removes members.
import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { isNotFound, type GroupView, type User } from '../api.ts'
import { useCurrentUser } from '../auth.ts'
import Avatar from '../components/Avatar.tsx'
import Ladder from '../components/Ladder.tsx'
import LeaderboardTabs from '../components/LeaderboardTabs.tsx'
import { useDeleteGroup, useGroup, useGroupLeaderboard, useLeaveGroup, useRemoveMember, useRenewInvite } from '../groups.ts'

export default function GroupPage() {
  const { id = '' } = useParams()
  const currentUser = useCurrentUser()

  if (currentUser === undefined) return null
  if (currentUser === null) return <Navigate to={`/login?next=/groups/${id}`} replace />
  if (!/^\d+$/.test(id)) return <NotFound />
  return <Group id={Number(id)} user={currentUser} />
}

function Group({ id, user }: { id: number; user: User }) {
  const group = useGroup(id)
  const ladder = useGroupLeaderboard(id)

  if (group.isPending) return <p className="text-muted">Loading…</p>
  if (isNotFound(group.error)) return <NotFound />
  if (group.isError) return <p className="text-loss">Could not load the group. Reload the page to try again.</p>

  const g = group.data
  const onLadder = new Set(ladder.data?.map((p) => p.id))
  const notYet = g.members.filter((m) => !onLadder.has(m.playerId))
  const meNotYet = ladder.data && !onLadder.has(user.playerId) ? user.displayName : undefined

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="type-title mb-6">Leaderboard</h1>
      <LeaderboardTabs />

      <p className="mb-4 text-muted">
        {g.name}: {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}. Same ratings as everywhere; arrows show
        places gained or lost within the group since last week.
      </p>
      {ladder.isError && <p className="text-loss">Could not load the group's ladder.</p>}
      {ladder.data && ladder.data.length > 0 && <Ladder players={ladder.data} me={user.playerId} full notOnLadder={meNotYet} />}
      {ladder.data?.length === 0 && <p className="text-muted">Nobody in the group is on the ladder yet. Play a match!</p>}
      {notYet.filter((m) => m.playerId !== user.playerId).length > 0 && (
        <p className="mt-3 text-sm text-muted">
          Not on the ladder yet:{' '}
          {notYet
            .filter((m) => m.playerId !== user.playerId)
            .map((m) => m.displayName)
            .join(', ')}
        </p>
      )}

      <InviteLink group={g} />
      <Members group={g} me={user.playerId} />
      <LeaveOrDelete group={g} />
    </section>
  )
}

// The link to share, with a Copy button. The owner can make a new one (the old link stops working).
function InviteLink({ group }: { group: GroupView }) {
  const renew = useRenewInvite(group.id)
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/join/${group.inviteCode}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The clipboard can be blocked (e.g. plain http): the link is selectable in the box anyway.
    }
  }

  return (
    <section className="mt-10">
      <h2 className="type-heading mb-1">Invite people</h2>
      <p className="mb-3 text-sm text-muted">Anyone with this link and an account can join the group.</p>
      <div className="flex flex-wrap gap-2">
        <input
          readOnly
          value={link}
          aria-label="Invite link"
          onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 rounded border border-line-strong bg-surface px-3 py-2 text-sm text-soft"
        />
        <button
          type="button"
          onClick={copy}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      {group.myRole === 'owner' && (
        <p className="mt-2 text-sm text-muted">
          Shared it too widely?{' '}
          <button type="button" disabled={renew.isPending} onClick={() => renew.mutate()} className="text-accent hover:underline">
            Make a new link
          </button>{' '}
          (the old one stops working).
        </p>
      )}
      {renew.error && <p className="mt-1 text-sm text-loss">{renew.error.message}</p>}
    </section>
  )
}

function Members({ group, me }: { group: GroupView; me: string }) {
  const remove = useRemoveMember(group.id)
  const isOwner = group.myRole === 'owner'

  return (
    <section className="mt-10">
      <h2 className="type-heading mb-2">Members</h2>
      <ul className="divide-y divide-line">
        {group.members.map((m) => (
          <li key={m.playerId} className="flex items-center gap-3 py-2">
            <Avatar name={m.displayName} url={m.avatarUrl} />
            <Link to={`/players/${m.playerId}`} className="flex-1 font-semibold hover:underline">
              {m.displayName}
            </Link>
            {m.role === 'owner' && <span className="text-sm text-muted">Owner</span>}
            {isOwner && m.playerId !== me && (
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(m.playerId)}
                className="rounded border border-line-strong px-3 py-1 text-sm hover:bg-surface-hover disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {remove.error && <p className="mt-1 text-sm text-loss">{remove.error.message}</p>}
    </section>
  )
}

// Leave (anyone) or delete (owner), each with a confirm step so one click can't do it by accident.
function LeaveOrDelete({ group }: { group: GroupView }) {
  const navigate = useNavigate()
  const leave = useLeaveGroup(group.id)
  const remove = useDeleteGroup(group.id)
  const [confirming, setConfirming] = useState<'leave' | 'delete' | null>(null)
  const done = { onSuccess: () => navigate('/leaderboard') }
  const error = leave.error ?? remove.error
  const ownerNote =
    group.myRole === 'owner' && group.memberCount > 1 ? ' The longest-standing member becomes the owner.' : ''

  return (
    <section className="mt-10 border-t border-line pt-6">
      {confirming === null && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setConfirming('leave')}
            className="rounded border border-line-strong px-4 py-2 text-sm hover:bg-surface-hover"
          >
            Leave group
          </button>
          {group.myRole === 'owner' && (
            <button
              type="button"
              onClick={() => setConfirming('delete')}
              className="rounded border border-loss px-4 py-2 text-sm font-semibold text-loss hover:bg-loss/10"
            >
              Delete group
            </button>
          )}
        </div>
      )}
      {confirming !== null && (
        <div className="space-y-3">
          <p className="text-sm text-soft">
            {confirming === 'leave'
              ? `Leave ${group.name}? You can join again with the invite link.${ownerNote}`
              : `Delete ${group.name} for everyone? Matches and ratings stay; only the group and its ladder go.`}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={leave.isPending || remove.isPending}
              onClick={() => (confirming === 'leave' ? leave.mutate(undefined, done) : remove.mutate(undefined, done))}
              className="rounded bg-loss-strong px-4 py-2 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50"
            >
              {confirming === 'leave' ? 'Leave group' : 'Delete group'}
            </button>
            <button type="button" onClick={() => setConfirming(null)} className="text-sm text-muted hover:underline">
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-loss">{error.message}</p>}
    </section>
  )
}

function NotFound() {
  return (
    <div className="space-y-4">
      <p className="text-muted">Group not found, or you're not a member.</p>
      <Link to="/leaderboard" className="text-sm text-muted hover:underline">
        ← Leaderboard
      </Link>
    </div>
  )
}
