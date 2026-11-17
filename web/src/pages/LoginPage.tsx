// Log in with email and password. On success: go to your own profile.
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { useCurrentUser, useLogin } from '../auth.ts'
import TextField from '../components/TextField.tsx'

export default function LoginPage() {
  const currentUser = useCurrentUser()
  const loginMutation = useLogin()
  // "Controlled" inputs: React state holds each field's value, the input just shows it.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Logged in (already, or just now: a successful login puts the user in the cache) → go to your profile.
  if (currentUser) return <Navigate to={`/players/${currentUser.playerId}`} replace />

  function handleSubmit(event: FormEvent) {
    event.preventDefault() // stop the browser's own form submit (a full page reload)
    loginMutation.mutate({ email, password })
  }

  return (
    <section className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Log in</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField label="Email" type="email" autoComplete="email" required value={email} onValueChange={setEmail} />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onValueChange={setPassword}
        />
        {loginMutation.error && <p className="text-sm text-rose-400">{loginMutation.error.message}</p>}
        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="w-full rounded bg-sky-600 py-2 font-semibold hover:bg-sky-500 disabled:opacity-50"
        >
          {loginMutation.isPending ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-6 text-sm text-slate-400">
        Got an invite?{' '}
        <Link to="/signup" className="text-sky-400 hover:underline">
          Sign up
        </Link>
      </p>
    </section>
  )
}
