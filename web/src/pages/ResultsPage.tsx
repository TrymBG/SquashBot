// /results: register a result, and handle reports waiting for you or for your opponents. Needs a login.
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useCurrentUser } from '../auth.ts'
import ReportForm from '../components/ReportForm.tsx'
import ReportList from '../components/ReportList.tsx'
import { useReports } from '../reports.ts'

export default function ResultsPage() {
  const currentUser = useCurrentUser()
  const reports = useReports(Boolean(currentUser))

  if (currentUser === undefined) return <p className="text-slate-400">Loading…</p>
  if (currentUser === null) return <Navigate to="/login" replace />

  return (
    <div className="space-y-10">
      <section>
        <h1 className="mb-4 text-2xl font-bold">Register a result</h1>
        <ReportForm />
      </section>

      <Section title="Waiting for you">
        {reports.data ? <ReportList reports={reports.data.incoming} kind="incoming" /> : <ReportsStatus isError={reports.isError} />}
      </Section>

      <Section title="Waiting for your opponent">
        {reports.data ? <ReportList reports={reports.data.outgoing} kind="outgoing" /> : <ReportsStatus isError={reports.isError} />}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      {children}
    </section>
  )
}

function ReportsStatus({ isError }: { isError: boolean }) {
  return isError ? <p className="text-red-400">Could not load the reports.</p> : <p className="text-slate-400">Loading…</p>
}
