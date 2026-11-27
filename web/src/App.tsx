// The page frame (header, footer) and the route table: which URL shows which page.
// Header: the logo, the main nav (current page underlined in yellow) and an account menu. On a phone the main nav
// drops to its own row under the logo, so nothing has to squeeze into one line.
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import type { User } from './api.ts'
import { useCurrentUser, useLogout } from './auth.ts'
import DevLoginSwitcher from './components/DevLoginSwitcher.tsx'
import Logo from './components/Logo.tsx'
import AccountPage from './pages/AccountPage.tsx'
import GroupPage from './pages/GroupPage.tsx'
import HomePage from './pages/HomePage.tsx'
import JoinPage from './pages/JoinPage.tsx'
import LeaderboardPage from './pages/LeaderboardPage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import NewGroupPage from './pages/NewGroupPage.tsx'
import PlayerPage from './pages/PlayerPage.tsx'
import PrivacyPage from './pages/PrivacyPage.tsx'
import ResetPasswordPage from './pages/ResetPasswordPage.tsx'
import ResultsPage from './pages/ResultsPage.tsx'
import SignupPage from './pages/SignupPage.tsx'
import TournamentPage from './pages/TournamentPage.tsx'
import TournamentsPage from './pages/TournamentsPage.tsx'
import { useReports } from './reports.ts'

export default function App() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 px-4">
          <Link to="/" className="flex items-center gap-2 py-3 text-xl font-bold [font-stretch:75%]">
            <Logo />
            Squash Ladder
          </Link>
          <MainNav />
          <div className="ml-auto flex items-center gap-3 py-3">
            <DevLoginSwitcher />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/groups/new" element={<NewGroupPage />} />
          <Route path="/groups/:id" element={<GroupPage />} />
          <Route path="/join/:code" element={<JoinPage />} />
          <Route path="/players/:id" element={<PlayerPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/reset" element={<ResetPasswordPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/tournaments" element={<TournamentsPage />} />
          <Route path="/tournaments/:id" element={<TournamentPage />} />
          <Route path="*" element={<p className="text-muted">Page not found.</p>} />
        </Routes>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl gap-4 px-4 py-6 text-sm text-faint">
          <span>Squash Ladder</span>
          <Link to="/privacy" className="hover:underline">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  )
}

// The main pages. NavLink knows whether its page is open: that one gets the yellow underline (and aria-current,
// so screen readers say "current page"). Each item is at least 44px tall, so it's easy to tap.
// On a phone it takes a full row under the logo (order-last + w-full); from `sm` up it sits next to the logo.
function MainNav() {
  const currentUser = useCurrentUser()
  // Refetched by TanStack Query when you come back to the tab, so the badge catches up without polling.
  const reports = useReports(Boolean(currentUser))
  const waitingForMe = reports.data?.incoming.length ?? 0

  return (
    <nav aria-label="Main" className="order-last -ml-3 flex w-full sm:order-none sm:w-auto">
      <NavItem to="/leaderboard" alsoActiveUnder="/groups/">
        Leaderboard
      </NavItem>
      <NavItem to="/tournaments">Tournaments</NavItem>
      {currentUser && (
        <NavItem to="/results">
          Results
          {waitingForMe > 0 && (
            <span className="rounded-full bg-loss-strong px-1.5 text-xs font-bold text-ink">
              {waitingForMe}
              <span className="sr-only"> waiting for you</span>
            </span>
          )}
        </NavItem>
      )}
    </nav>
  )
}

// alsoActiveUnder: another URL prefix that belongs to the same section (a group's ladder is under Leaderboard).
function NavItem({ to, alsoActiveUnder, children }: { to: string; alsoActiveUnder?: string; children: ReactNode }) {
  const { pathname } = useLocation()
  const inSection = alsoActiveUnder !== undefined && pathname.startsWith(alsoActiveUnder)
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold ${
          isActive || inSection ? 'border-accent text-ink' : 'border-transparent text-soft hover:text-ink'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

// Logged out: "Log in" and "Sign up". Logged in: your name opens a small menu (profile, account, log out).
// A native <details> element does the opening and closing (keyboard included); we only close it after you pick
// something, change page, or click somewhere else.
function AccountMenu() {
  const currentUser = useCurrentUser()

  // Still asking /api/me: show nothing, so the wrong buttons don't flash for a moment.
  if (currentUser === undefined) return null

  if (currentUser === null) {
    return (
      <nav aria-label="Account" className="flex items-center gap-2 text-sm">
        <Link to="/login" className="flex min-h-11 items-center px-2 text-soft hover:text-ink">
          Log in
        </Link>
        <Link to="/signup" className="rounded bg-accent px-3 py-1.5 font-semibold text-on-accent hover:bg-accent-hover">
          Sign up
        </Link>
      </nav>
    )
  }
  return <UserMenu user={currentUser} />
}

function UserMenu({ user }: { user: User }) {
  const logoutMutation = useLogout()
  const navigate = useNavigate()
  const menu = useRef<HTMLDetailsElement>(null)
  const { pathname } = useLocation()

  const close = () => menu.current?.removeAttribute('open')

  // Close on page change, and on a click outside the menu.
  useEffect(close, [pathname])
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const item = 'block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-hover'
  return (
    <details ref={menu} className="relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded px-2 font-semibold hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
        {user.displayName}
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-muted" aria-hidden="true">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded border border-line-strong bg-surface py-1 shadow-lg">
        <Link to={`/players/${user.playerId}`} className={item}>
          Your profile
        </Link>
        <Link to="/account" className={item}>
          Account
        </Link>
        <div className="my-1 border-t border-line" />
        <button
          type="button"
          disabled={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate(undefined, { onSuccess: () => navigate('/') })}
          className={`${item} text-muted disabled:opacity-50`}
        >
          Log out
        </button>
      </div>
    </details>
  )
}
