// "Register a result": pick the opponent, the format and the result (only valid results are offered), and the date.
// The result is sent to the opponent, who has to confirm it before it counts.
import { useState, type FormEvent } from 'react'
import { useCreateReport, useOpponents } from '../reports.ts'
import { FORMATS } from '../formats.ts'
import { validResults } from '../scores.ts'


const MAX_DAYS_BACK = 30 // same limit as the server

// A date as "YYYY-MM-DD" in the browser's time zone (what <input type="date"> uses).
function localDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Today → undefined, so the server uses "now" with the exact time. Another day → noon that day (local time),
// which stays the same calendar day in Norway whatever the summer/winter time.
function playedAtFor(dateString: string): string | undefined {
  if (dateString === localDateString(new Date())) return undefined
  return new Date(`${dateString}T12:00:00`).toISOString()
}

const selectClass =
  'w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-sky-500'

export default function ReportForm() {
  const opponents = useOpponents()
  const createMutation = useCreateReport()
  // Worked out once when the form first appears (a function passed to useState runs only then), so the
  // date limits stay the same on every re-render instead of reading the clock each time.
  const [{ today, earliest }] = useState(() => ({
    today: localDateString(new Date()),
    earliest: localDateString(new Date(Date.now() - MAX_DAYS_BACK * 24 * 60 * 60 * 1000)),
  }))

  const [opponentId, setOpponentId] = useState('')
  const [format, setFormat] = useState('bo5')
  const [resultIndex, setResultIndex] = useState(0)
  const [date, setDate] = useState(today)
  const [sentTo, setSentTo] = useState<string | null>(null) // name shown in the "sent" message

  if (opponents.isPending) return <p className="text-slate-400">Loading players…</p>
  if (opponents.isError) return <p className="text-red-400">Could not load the players.</p>
  if (opponents.data.length === 0) {
    return <p className="text-slate-400">Nobody else has an account yet. Send your friends the invite link.</p>
  }

  const results = validResults(format)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const result = results[resultIndex]
    const opponent = opponents.data?.find((o) => o.id === opponentId)
    if (!result || !opponent) return
    const playedAt = playedAtFor(date)
    createMutation.mutate(
      {
        opponentId,
        format,
        myGames: result.myGames,
        opponentGames: result.opponentGames,
        ...(playedAt ? { playedAt } : {}),
      },
      {
        onSuccess: () => {
          setSentTo(opponent.displayName)
          setOpponentId('')
          setResultIndex(0)
          setDate(today)
        },
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-sm text-slate-400">Opponent</span>
        <select required value={opponentId} onChange={(e) => setOpponentId(e.target.value)} className={selectClass}>
          <option value="" disabled>
            Choose a player…
          </option>
          {opponents.data.map((o) => (
            <option key={o.id} value={o.id}>
              {o.displayName}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-slate-400">Format</span>
        <select
          value={format}
          onChange={(e) => {
            setFormat(e.target.value)
            setResultIndex(0) // the old result may not exist in the new format
          }}
          className={selectClass}
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-slate-400">Result (your score first)</span>
        <select value={resultIndex} onChange={(e) => setResultIndex(Number(e.target.value))} className={selectClass}>
          {results.map((r, index) => (
            <option key={r.label} value={index}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-slate-400">Played on</span>
        <input
          type="date"
          required
          min={earliest}
          max={today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={selectClass}
        />
      </label>

      <div className="sm:col-span-2">
        {createMutation.error && <p className="mb-2 text-sm text-rose-400">{createMutation.error.message}</p>}
        {sentTo && !createMutation.error && (
          <p className="mb-2 text-sm text-emerald-400">Sent to {sentTo} for confirmation.</p>
        )}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded bg-sky-600 px-4 py-2 font-semibold hover:bg-sky-500 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Sending…' : 'Send for confirmation'}
        </button>
      </div>
    </form>
  )
}
