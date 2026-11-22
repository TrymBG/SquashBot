// Small details under a title (format, date, tournament, status), laid out as separate items with space between,
// instead of one string glued together with " · ". Wraps on narrow screens. Empty items (false/null) are skipped.
import { Children, type ReactNode } from 'react'

export default function Meta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted ${className}`}>
      {Children.toArray(children).map((child, index) => (
        <span key={index} className="inline-flex items-center gap-1">
          {child}
        </span>
      ))}
    </div>
  )
}
