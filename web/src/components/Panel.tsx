// A card: a rounded, bordered block on the page background. The front page is built from these, so related things
// sit together instead of one long list. Optional title, and an optional link on the right of the title row.
import type { ReactNode } from 'react'

interface Props {
  title?: string
  action?: ReactNode // e.g. a "Full leaderboard →" link
  children: ReactNode
  className?: string
}

export default function Panel({ title, action, children, className = '' }: Props) {
  return (
    <section className={`rounded-lg border border-line bg-surface p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-baseline justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
