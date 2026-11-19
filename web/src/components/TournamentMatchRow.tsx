// One scheduled match of a tournament, with what you can do about it:
//   played    → the score
//   pending   → "Ola reported 8–7": Confirm / Reject if you're the opponent, Cancel if you reported it
//   unplayed  → your match: "Report result" opens a small form (only valid results for the tournament's format)
import { useState, type FormEvent } from 'react'
import type { TournamentMatch, User } from '../api.ts'
import { useCancelReport, useConfirmReport, useCreateReport, useRejectReport } from '../reports.ts'
import { validResults } from '../scores.ts'

interface Props {
  match: TournamentMatch
  matchFormat: string
  currentUser: User | null | undefined
}

const buttonClass = 'rounded px-3 py-1 text-sm font-semibold disabled:opacity-50'

export default function TournamentMatchRow({ match, matchFormat, currentUser }: Props) {
  const me = currentUser?.playerId
  const mine = me === match.playerA.id || me === match.playerB.id

  return (
    <li className={`rounded px-3 py-2 ${mine ? 'bg-slate-900 ring-1 ring-sky-800' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex-1">
          {match.playerA.displayName} <span className="text-slate-500">vs</span> {match.playerB.displayName}
        </span>
        {match.state === 'played' && (
          <span className="font-semibold tabular-nums">
            {match.scoreA}–{match.scoreB}
          </span>
        )}
        {match.state === 'unplayed' && !mine && <span className="text-sm text-slate-500">Not played</span>}
      </div>
      {match.state === 'pending' && match.pendingReport && <PendingReport match={match} me={me} />}
      {match.state === 'unplayed' && mine && me && <ReportForm match={match} matchFormat={matchFormat} me={me} />}
    </li>
  )
}

// "Ola reported 8–7" (scores in schedule order, player A first), plus the buttons for whoever may act.
function PendingReport({ match, me }: { match: TournamentMatch; me: string | undefined }) {
  const report = match.pendingReport!
  const confirm = useConfirmReport()
  const reject = useRejectReport()
  const cancel = useCancelReport()
  const reporterIsA = report.reporterId === match.playerA.id
  const reporterName = reporterIsA ? match.playerA.displayName : match.playerB.displayName
  const opponentName = reporterIsA ? match.playerB.displayName : match.playerA.displayName
  const scoreA = reporterIsA ? report.reporterScore : report.opponentScore
  const scoreB = reporterIsA ? report.opponentScore : report.reporterScore
  const busy = confirm.isPending || reject.isPending || cancel.isPending
  const error = confirm.error ?? reject.error ?? cancel.error
  const iAmOpponent = me !== undefined && me !== report.reporterId && (me === match.playerA.id || me === match.playerB.id)

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="flex-1 text-slate-300">
        {reporterName} reported {scoreA}–{scoreB}
        {!iAmOpponent && <span className="text-slate-500"> · waiting for {opponentName}</span>}
      </span>
      {iAmOpponent && (
        <>
          <button type="button" disabled={busy} onClick={() => confirm.mutate(report.id)} className={`${buttonClass} bg-emerald-600 hover:bg-emerald-500`}>
            Confirm
          </button>
          <button type="button" disabled={busy} onClick={() => reject.mutate(report.id)} className={`${buttonClass} border border-slate-600 hover:bg-slate-800`}>
            Reject
          </button>
        </>
      )}
      {me === report.reporterId && (
        <button type="button" disabled={busy} onClick={() => cancel.mutate(report.id)} className={`${buttonClass} border border-slate-600 hover:bg-slate-800`}>
          Cancel
        </button>
      )}
      {error && <p className="w-full text-rose-400">{error.message}</p>}
    </div>
  )
}

// Report your own tournament match. The result list only offers valid results for the tournament's format,
// from your side ("Won 8–7"). No date field: tournament matches are reported when played ("now").
function ReportForm({ match, matchFormat, me }: { match: TournamentMatch; matchFormat: string; me: string }) {
  const [open, setOpen] = useState(false)
  const [resultIndex, setResultIndex] = useState(0)
  const create = useCreateReport()
  const results = validResults(matchFormat)
  const opponent = me === match.playerA.id ? match.playerB : match.playerA

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-sm text-sky-400 hover:underline">
        Report result
      </button>
    )
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const result = results[resultIndex]
    if (!result) return
    create.mutate({
      opponentId: opponent.id,
      format: matchFormat,
      myGames: result.myGames,
      opponentGames: result.opponentGames,
      tournamentMatchId: match.id,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-400">vs {opponent.displayName}:</span>
      <select
        aria-label="Result"
        value={resultIndex}
        onChange={(e) => setResultIndex(Number(e.target.value))}
        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
      >
        {results.map((r, index) => (
          <option key={r.label} value={index}>
            {r.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={create.isPending} className={`${buttonClass} bg-sky-600 hover:bg-sky-500`}>
        {create.isPending ? 'Sending…' : `Send to ${opponent.displayName}`}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:underline">
        Cancel
      </button>
      {create.error && <p className="w-full text-rose-400">{create.error.message}</p>}
    </form>
  )
}
