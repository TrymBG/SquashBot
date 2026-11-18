// The page frame (header) and the route table: which URL shows which page.
import { Link, Route, Routes, useNavigate } from 'react-router'
import { useCurrentUser, useLogout } from './auth.ts'
import LeaderboardPage from './pages/LeaderboardPage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import PlayerPage from './pages/PlayerPage.tsx'
import ResultsPage from './pages/ResultsPage.tsx'
import SignupPage from './pages/SignupPage.tsx'
import { useReports } from './reports.ts'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-lg font-bold tracking-tight">
            Squash Ladder
          </Link>
          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <Routes>
          <Route path="/" element={<LeaderboardPage />} />
          <Route path="/players/:id" element={<PlayerPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="*" element={<p className="text-slate-400">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  )
}

// Right side of the header: "Results" (with a badge when something waits for you), your name and "Log out"
// when logged in, otherwise "Log in" / "Sign up".
function AccountMenu() {
  const currentUser = useCurrentUser()
  const logoutMutation = useLogout()
  const navigate = useNavigate()
  // Refetched by TanStack Query when you come back to the tab, so the badge catches up without polling.
  const reports = useReports(Boolean(currentUser))
  const waitingForMe = reports.data?.incoming.length ?? 0

  // Still asking /api/me: show nothing, so the wrong buttons don't flash for a moment.
  if (currentUser === undefined) return null

  if (currentUser === null) {
    return (
      <nav className="flex gap-4 text-sm">
        <Link to="/login" className="text-slate-300 hover:underline">
          Log in
        </Link>
        <Link to="/signup" className="text-slate-300 hover:underline">
          Sign up
        </Link>
      </nav>
    )
  }

  return (
    <nav className="flex items-center gap-4 text-sm">
      <Link to="/results" className="flex items-center gap-1 text-slate-300 hover:underline">
        Results
        {waitingForMe > 0 && (
          <span className="rounded-full bg-rose-600 px-1.5 text-xs font-bold text-white" aria-label={`${waitingForMe} waiting for you`}>
            {waitingForMe}
          </span>
        )}
      </Link>
      <Link to={`/players/${currentUser.playerId}`} className="font-semibold hover:underline">
        {currentUser.displayName}
      </Link>
      <button
        type="button"
        disabled={logoutMutation.isPending}
        onClick={() => logoutMutation.mutate(undefined, { onSuccess: () => navigate('/') })}
        className="text-slate-400 hover:underline disabled:opacity-50"
      >
        Log out
      </button>
    </nav>
  )
}
