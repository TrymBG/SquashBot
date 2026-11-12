// A small green W or red L square, used in the form strip and the match history.
import type { Result } from '../api.ts'

export default function ResultBadge({ result }: { result: Result }) {
  const colors = result === 'W' ? 'bg-emerald-600' : 'bg-rose-600'
  return (
    <span className={`inline-flex size-6 items-center justify-center rounded text-xs font-bold ${colors}`}>
      {result}
    </span>
  )
}
