// Tabs above the ladder: "Everyone" (the overall leaderboard), one tab per group you're in, and "New group".
// Only when logged in: groups are for members. The open tab is underlined in yellow, like the main nav.
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { useCurrentUser } from '../auth.ts'
import { useMyGroups } from '../groups.ts'

export default function LeaderboardTabs() {
  const currentUser = useCurrentUser()
  const groups = useMyGroups(Boolean(currentUser))
  if (!currentUser) return null

  return (
    <nav aria-label="Leaderboards" className="mb-6 flex flex-wrap gap-x-1 border-b border-line">
      <Tab to="/leaderboard">Everyone</Tab>
      {groups.data?.map((group) => (
        <Tab key={group.id} to={`/groups/${group.id}`}>
          {group.name}
        </Tab>
      ))}
      <Tab to="/groups/new" quiet>
        New group
      </Tab>
    </nav>
  )
}

function Tab({ to, quiet = false, children }: { to: string; quiet?: boolean; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold ${
          isActive ? 'border-accent text-ink' : `border-transparent hover:text-ink ${quiet ? 'text-muted' : 'text-soft'}`
        }`
      }
    >
      {children}
    </NavLink>
  )
}
