// Opponent and format filters for a profile's match history. The values live in the URL (?opponent=…&format=…),
// so a reload, the back button and a shared link keep them. The parent page reads them with useSearchParams too.
import { useSearchParams } from 'react-router'
import type { OpponentRecord } from '../api.ts'
import { FORMATS } from '../formats.ts'

const selectClass =
  'rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-sky-500'

export default function MatchFilters({ opponents }: { opponents: OpponentRecord[] }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const opponent = searchParams.get('opponent') ?? ''
  const format = searchParams.get('format') ?? ''

  // Sets one filter (or removes it when empty) and keeps the others. `replace` so filter changes don't fill
  // the back button's history with every click.
  function setFilter(name: 'opponent' | 'format', value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(name, value)
    else next.delete(name)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Opponent"
        value={opponent}
        onChange={(e) => setFilter('opponent', e.target.value)}
        className={selectClass}
      >
        <option value="">All opponents</option>
        {opponents.map((o) => (
          <option key={o.id} value={o.id}>
            {o.displayName} ({o.played})
          </option>
        ))}
      </select>
      <select aria-label="Format" value={format} onChange={(e) => setFilter('format', e.target.value)} className={selectClass}>
        <option value="">All formats</option>
        {FORMATS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      {(opponent || format) && (
        <button type="button" onClick={() => setSearchParams({}, { replace: true })} className="text-sm text-slate-400 hover:underline">
          Clear filters
        </button>
      )}
    </div>
  )
}
