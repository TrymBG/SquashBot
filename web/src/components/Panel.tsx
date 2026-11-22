// A card: a rounded, bordered block on the page background, for a self-contained box like the account and privacy
// pages. Used sparingly on purpose: the front page uses plain sections, so the ladder stays the one "object".
// Optional title, and an optional link on the right of the title row.
import type { ReactNode } from 'react'

interface Props {
  title?: string
  action?: ReactNode // e.g. a "Full leaderboard" link
  children: ReactNode
  className?: string
}

export default function Panel({ title, action, children, className = '' }: Props) {
  return (
    <section className={`rounded-lg border border-line bg-surface p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-baseline justify-between gap-2">
          {title && <h2 className="type-heading">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
