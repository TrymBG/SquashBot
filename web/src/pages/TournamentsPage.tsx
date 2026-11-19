// /tournaments: every tournament, newest first, and (logged in) a form to create one.
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import type { TournamentRanking } from '../api.ts'
import { useCurrentUser } from '../auth.ts'
import TextField from '../components/TextField.tsx'
import { describeTournament, statusText } from '../format.ts'
import { findFormat, FORMATS } from '../formats.ts'
import { useCreateTournament, useTournaments } from '../tournaments.ts'

export default function TournamentsPage() {
  const currentUser = useCurrentUser()
  const tournaments = useTournaments()

  return (
    <div className="space-y-10">
      {currentUser && (
        <section>
          <h1 className="mb-4 text-2xl font-bold">New tournament</h1>
          <CreateTournamentForm />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-2xl font-bold">Tournaments</h2>
        {tournaments.isPending && <p className="text-slate-400">Loading…</p>}
        {tournaments.isError && <p className="text-red-400">Could not load the tournaments.</p>}
        {tournaments.data?.length === 0 && <p className="text-slate-400">No tournaments yet.</p>}
        <ul className="divide-y divide-slate-800">
          {tournaments.data?.map((t) => (
            <li key={t.id} className="py-3">
              <Link to={`/tournaments/${t.id}`} className="font-semibold hover:underline">
                {t.name}
              </Link>
              <p className="text-sm text-slate-400">
                {describeTournament(t)} · by {t.organizerName} · {t.playerCount} players · {statusText(t)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

const selectClass =
  'w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-sky-500'

function CreateTournamentForm() {
  const navigate = useNavigate()
  const create = useCreateTournament()
  const [name, setName] = useState('')
  const [matchFormat, setMatchFormat] = useState('bo3')
  const [ranking, setRanking] = useState<TournamentRanking>('wins')
  const isRally = findFormat(matchFormat)?.rallies !== null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    create.mutate({ name, matchFormat, ranking }, { onSuccess: (t) => navigate(`/tournaments/${t.id}`) })
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-3">
      <TextField label="Name" required maxLength={60} value={name} onValueChange={setName} />
      <label className="block">
        <span className="mb-1 block text-sm text-slate-400">Match format</span>
        <select
          value={matchFormat}
          onChange={(e) => {
            setMatchFormat(e.target.value)
            // Ranking by points only makes sense when the score is in points.
            if (findFormat(e.target.value)?.rallies === null) setRanking('wins')
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
        <span className="mb-1 block text-sm text-slate-400">Ranked by</span>
        <select value={ranking} onChange={(e) => setRanking(e.target.value as TournamentRanking)} className={selectClass}>
          <option value="wins">Match wins</option>
          <option value="points" disabled={!isRally}>
            Points scored{isRally ? '' : ' (rally formats only)'}
          </option>
        </select>
      </label>
      <div className="sm:col-span-3">
        <p className="mb-2 text-sm text-slate-400">Round robin: everyone plays everyone once. You add the players next.</p>
        {create.error && <p className="mb-2 text-sm text-rose-400">{create.error.message}</p>}
        <button type="submit" disabled={create.isPending} className="rounded bg-sky-600 px-4 py-2 font-semibold hover:bg-sky-500 disabled:opacity-50">
          {create.isPending ? 'Creating…' : 'Create tournament'}
        </button>
      </div>
    </form>
  )
}
