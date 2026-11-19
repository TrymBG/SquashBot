// A list of pending reports, each written from the viewer's side.
// Incoming (someone reported a match against you): Confirm / Reject. Outgoing (you reported): Cancel.
import type { Report } from '../api.ts'
import { formatDate, formatMatchFormat } from '../format.ts'
import { useCancelReport, useConfirmReport, useRejectReport } from '../reports.ts'

export default function ReportList({ reports, kind }: { reports: Report[]; kind: 'incoming' | 'outgoing' }) {
  if (reports.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        {kind === 'incoming' ? 'Nothing waiting for you.' : 'No reports waiting for your opponents.'}
      </p>
    )
  }
  return (
    <ul className="divide-y divide-slate-800">
      {reports.map((report) =>
        kind === 'incoming' ? <IncomingRow key={report.id} report={report} /> : <OutgoingRow key={report.id} report={report} />,
      )}
    </ul>
  )
}

// "won 3–1" / "lost 1–3" from the viewer's side. Scores are stored from the reporter's side, so flip them for the opponent.
function resultFromMySide(report: Report, iAmReporter: boolean): string {
  const mine = iAmReporter ? report.reporterGames : report.opponentGames
  const theirs = iAmReporter ? report.opponentGames : report.reporterGames
  return `${mine > theirs ? 'won' : 'lost'} ${mine}–${theirs}`
}

function Details({ report }: { report: Report }) {
  return (
    <span className="text-sm text-slate-400">
      {formatMatchFormat(report.format)} · {formatDate(report.playedAt)}
      {report.tournamentName && <span className="text-amber-300"> · 🏆 {report.tournamentName}</span>}
      {!report.ranked && <span className="text-sky-300"> · Unranked</span>}
    </span>
  )
}

function IncomingRow({ report }: { report: Report }) {
  // One mutation object per row, so each row has its own "sending…" state and error.
  const confirm = useConfirmReport()
  const reject = useRejectReport()
  const busy = confirm.isPending || reject.isPending
  const error = confirm.error ?? reject.error

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="flex-1">
        <p>
          <span className="font-semibold">{report.reporterName}</span> reported: you{' '}
          <span className="font-semibold">{resultFromMySide(report, false)}</span>
        </p>
        <Details report={report} />
        {error && <p className="text-sm text-rose-400">{error.message}</p>}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => confirm.mutate(report.id)}
        className="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"
      >
        Confirm
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => reject.mutate(report.id)}
        className="rounded border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800 disabled:opacity-50"
      >
        Reject
      </button>
    </li>
  )
}

function OutgoingRow({ report }: { report: Report }) {
  const cancel = useCancelReport()

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="flex-1">
        <p>
          You <span className="font-semibold">{resultFromMySide(report, true)}</span> vs{' '}
          <span className="font-semibold">{report.opponentName}</span>
          <span className="text-slate-400"> · waiting for {report.opponentName}</span>
        </p>
        <Details report={report} />
        {cancel.error && <p className="text-sm text-rose-400">{cancel.error.message}</p>}
      </div>
      <button
        type="button"
        disabled={cancel.isPending}
        onClick={() => cancel.mutate(report.id)}
        className="rounded border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800 disabled:opacity-50"
      >
        Cancel
      </button>
    </li>
  )
}
