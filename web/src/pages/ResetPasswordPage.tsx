// /reset?token=…: choose a new password with the one-time link the admin made (npm run reset-link).
// On success you're logged in (and logged out everywhere else) and land on the front page.
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useResetPassword } from '../auth.ts'
import TextField from '../components/TextField.tsx'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const reset = useResetPassword()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [mismatch, setMismatch] = useState(false)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    // Checked here only: the server just needs one password, typing it twice is for catching typos.
    setMismatch(password !== repeat)
    if (password !== repeat) return
    reset.mutate({ token, password }, { onSuccess: () => navigate('/') })
  }

  if (!token) {
    return (
      <section className="mx-auto max-w-sm">
        <h1 className="mb-4 type-title">Reset password</h1>
        <p className="text-muted">
          This page needs a reset link. Ask the admin for one, or{' '}
          <Link to="/login" className="text-accent hover:underline">
            log in
          </Link>
          .
        </p>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-sm">
      <h1 className="mb-6 type-title">Choose a new password</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label="New password (at least 8 characters)"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          value={password}
          onValueChange={setPassword}
        />
        <TextField
          label="New password again"
          type="password"
          autoComplete="new-password"
          required
          value={repeat}
          onValueChange={setRepeat}
        />
        {mismatch && <p className="text-sm text-loss">The two passwords are different.</p>}
        {reset.error && <p className="text-sm text-loss">{reset.error.message}</p>}
        <button
          type="submit"
          disabled={reset.isPending}
          className="w-full rounded bg-accent py-2 font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
        >
          {reset.isPending ? 'Saving…' : 'Save new password'}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted">This logs you out on every other device.</p>
    </section>
  )
}
