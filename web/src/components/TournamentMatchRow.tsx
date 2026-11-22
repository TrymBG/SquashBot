// One tournament match, with what you can do about it:
//   played    → the score
//   pending   → "Ola reported 8–7": Confirm / Reject if you're the opponent, Cancel if you reported it
//   unplayed  → your match: "Report result" opens a small form (only valid results for the tournament's format)
// Knockout: a side can still be empty ("TBD") until the match before it is played; seeds show as "(1)".
import { useState, type FormEvent } from 'react'
import type { MatchPlayer, TournamentMatch, User } from '../api.ts'
import { useCancelReport, useConfirmReport, useCreateReport, useRejectReport } from '../reports.ts'
import { validResults } from '../scores.ts'

interface Props {
  match: TournamentMatch
  matchFormat: string
  currentUser: User | null | undefined
  compact?: boolean // bracket cards: names on two lines
}

const buttonClass = 'rounded px-3 py-1 text-sm font-semibold disabled:opacity-50'

function PlayerName({ player }: { player: MatchPlayer | null }) {
  if (!player) return <span className="text-faint">TBD</span>
  return (
    <span>
      {player.displayName}
      {player.seed !== null && <span className="text-xs text-faint"> ({player.seed})</span>}
    </span>
  )
}

export default function TournamentMatchRow({ match, matchFormat, currentUser, compact = false }: Props) {
  const me = currentUser?.playerId
  const mine = me !== undefined && (me === match.playerA?.id || me === match.playerB?.id)
  const bothKnown = match.playerA !== null && match.playerB !== null

  return (
    <li className={`rounded px-3 py-2 ${mine ? 'bg-surface ring-1 ring-accent/40' : compact ? 'bg-surface/50' : ''}`}>
      {compact ? (
        // Bracket card: one player per line, each with their score.
        <div className="space-y-1">
          {[
            { player: match.playerA, score: match.scoreA },
            { player: match.playerB, score: match.scoreB },
          ].map((side, index) => (
            <div key={index} className="flex justify-between gap-3">
              <PlayerName player={side.player} />
              {match.state === 'played' && <span className="font-semibold tabular-nums">{side.score}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex-1">
            <PlayerName player={match.playerA} /> <span className="text-faint">vs</span> <PlayerName player={match.playerB} />
          </span>
          {match.state === 'played' && (
            <span className="font-semibold tabular-nums">
              {match.scoreA}–{match.scoreB}
            </span>
          )}
          {match.state === 'unplayed' && !mine && <span className="text-sm text-faint">Not played</span>}
        </div>
      )}
      {match.state === 'pending' && match.pendingReport && bothKnown && <PendingReport match={match} me={me} />}
      {match.state === 'unplayed' && mine && bothKnown && me && <ReportForm match={match} matchFormat={matchFormat} me={me} />}
    </li>
  )
}

// "Ola reported 8–7" (scores in match order, player A first), plus the buttons for whoever may act.
function PendingReport({ match, me }: { match: TournamentMatch; me: string | undefined }) {
  const report = match.pendingReport!
  const playerA = match.playerA!
  const playerB = match.playerB!
  const confirm = useConfirmReport()
  const reject = useRejectReport()
  const cancel = useCancelReport()
  const reporterIsA = report.reporterId === playerA.id
  const reporterName = reporterIsA ? playerA.displayName : playerB.displayName
  const opponentName = reporterIsA ? playerB.displayName : playerA.displayName
  const scoreA = reporterIsA ? report.reporterScore : report.opponentScore
  const scoreB = reporterIsA ? report.opponentScore : report.reporterScore
  const busy = confirm.isPending || reject.isPending || cancel.isPending
  const error = confirm.error ?? reject.error ?? cancel.error
  const iAmOpponent = me !== undefined && me !== report.reporterId && (me === playerA.id || me === playerB.id)

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="flex-1 text-soft">
        {reporterName} reported {scoreA}–{scoreB}
        {!iAmOpponent && <span className="block text-faint">Waiting for {opponentName} to confirm</span>}
      </span>
      {iAmOpponent && (
        <>
          <button type="button" disabled={busy} onClick={() => confirm.mutate(report.id)} className={`${buttonClass} bg-win-strong hover:brightness-110`}>
            Confirm
          </button>
          <button type="button" disabled={busy} onClick={() => reject.mutate(report.id)} className={`${buttonClass} border border-line-strong hover:bg-surface-hover`}>
            Reject
          </button>
        </>
      )}
      {me === report.reporterId && (
        <button type="button" disabled={busy} onClick={() => cancel.mutate(report.id)} className={`${buttonClass} border border-line-strong hover:bg-surface-hover`}>
          Cancel
        </button>
      )}
      {error && <p className="w-full text-loss">{error.message}</p>}
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
  const opponent = me === match.playerA?.id ? match.playerB! : match.playerA!

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-sm text-accent hover:underline">
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
      <span className="text-muted">vs {opponent.displayName}:</span>
      <select
        aria-label="Result"
        value={resultIndex}
        onChange={(e) => setResultIndex(Number(e.target.value))}
        className="rounded border border-line-strong bg-surface px-2 py-1 text-ink"
      >
        {results.map((r, index) => (
          <option key={r.label} value={index}>
            {r.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={create.isPending} className={`${buttonClass} bg-accent text-on-accent hover:bg-accent-hover`}>
        {create.isPending ? 'Sending…' : `Send to ${opponent.displayName}`}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-muted hover:underline">
        Cancel
      </button>
      {create.error && <p className="w-full text-loss">{create.error.message}</p>}
    </form>
  )
}
