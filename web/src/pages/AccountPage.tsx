// /account: your account details and "Delete my account". Needs a login.
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import type { User } from '../api.ts'
import { useCurrentUser, useDeleteAccount } from '../auth.ts'
import Panel from '../components/Panel.tsx'
import TextField from '../components/TextField.tsx'

export default function AccountPage() {
  const currentUser = useCurrentUser()

  if (currentUser === undefined) return null // still asking /api/me
  if (currentUser === null) return <Navigate to="/login" replace />

  return (
    <section className="mx-auto max-w-xl space-y-6">
      <h1 className="type-title">Account</h1>
      <Panel title="Your account">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted">Name</dt>
          <dd>
            <Link to={`/players/${currentUser.playerId}`} className="hover:underline">
              {currentUser.displayName}
            </Link>
          </dd>
          <dt className="text-muted">Email</dt>
          <dd>{currentUser.email} (only used to log in, never shown to others)</dd>
        </dl>
        <p className="mt-4 text-sm text-muted">
          Forgot your password or want a new one? Ask the admin for a reset link.{' '}
          <Link to="/privacy" className="text-accent hover:underline">
            How your data is used
          </Link>
        </p>
      </Panel>
      <DeleteAccount user={currentUser} />
    </section>
  )
}

// Two steps, so it can't happen by one accidental click: first open the form, then confirm with your password.
function DeleteAccount({ user }: { user: User }) {
  const navigate = useNavigate()
  const deletion = useDeleteAccount()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    deletion.mutate(password, { onSuccess: () => navigate('/') })
  }

  return (
    <Panel title="Delete my account">
      <p className="text-sm text-soft">
        Your email, password and logins are deleted for good. Your matches stay, so your opponents' ratings and histories
        don't change, but your name is replaced by "Deleted player" and you disappear from the leaderboard. Results waiting
        for confirmation are cancelled, and you leave tournaments that haven't started. This can't be undone.
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded border border-loss px-4 py-2 text-sm font-semibold text-loss hover:bg-loss/10"
        >
          Delete my account…
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <TextField
            label={`Your password, to confirm deleting ${user.displayName}`}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onValueChange={setPassword}
          />
          {deletion.error && <p className="text-sm text-loss">{deletion.error.message}</p>}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={deletion.isPending}
              className="rounded bg-loss-strong px-4 py-2 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50"
            >
              {deletion.isPending ? 'Deleting…' : 'Delete for good'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:underline">
              Cancel
            </button>
          </div>
        </form>
      )}
    </Panel>
  )
}
