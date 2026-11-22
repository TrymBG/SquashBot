// Sign up with an invite code. An invite link like /signup?code=XYZ fills in the code, so friends only type
// their name, email and password. The browser checks (required, minLength, …) mirror the server's rules for
// instant feedback; the server still checks everything.
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { useCurrentUser, useSignup } from '../auth.ts'
import TextField from '../components/TextField.tsx'

export default function SignupPage() {
  const currentUser = useCurrentUser()
  const signupMutation = useSignup()
  const [searchParams] = useSearchParams()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState(searchParams.get('code') ?? '')

  // Logged in (already, or just now: a successful sign-up puts the user in the cache) → go to your profile.
  if (currentUser) return <Navigate to={`/players/${currentUser.playerId}`} replace />

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    signupMutation.mutate({ displayName, email, password, inviteCode })
  }

  return (
    <section className="mx-auto max-w-sm">
      <h1 className="mb-6 type-title">Sign up</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label="Name (shown on the leaderboard)"
          autoComplete="nickname"
          required
          maxLength={32}
          value={displayName}
          onValueChange={setDisplayName}
        />
        <TextField label="Email" type="email" autoComplete="email" required value={email} onValueChange={setEmail} />
        <TextField
          label="Password (at least 8 characters)"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          value={password}
          onValueChange={setPassword}
        />
        <TextField label="Invite code" required value={inviteCode} onValueChange={setInviteCode} />
        {signupMutation.error && <p className="text-sm text-loss">{signupMutation.error.message}</p>}
        <button
          type="submit"
          disabled={signupMutation.isPending}
          className="w-full rounded bg-accent text-on-accent py-2 font-semibold hover:bg-accent-hover disabled:opacity-50"
        >
          {signupMutation.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted">
        <Link to="/privacy" className="text-accent hover:underline">
          How your data is used
        </Link>
      </p>
      <p className="mt-2 text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="text-accent hover:underline">
          Log in
        </Link>
      </p>
    </section>
  )
}
