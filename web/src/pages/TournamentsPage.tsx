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
        {tournaments.isPending && <p className="text-muted">Loading…</p>}
        {tournaments.isError && <p className="text-loss">Could not load the tournaments.</p>}
        {tournaments.data?.length === 0 && <p className="text-muted">No tournaments yet.</p>}
        <ul className="divide-y divide-line">
          {tournaments.data?.map((t) => (
            <li key={t.id} className="py-3">
              <Link to={`/tournaments/${t.id}`} className="font-semibold hover:underline">
                {t.name}
              </Link>
              <p className="text-sm text-muted">
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
  'w-full rounded border border-line-strong bg-surface px-3 py-2 text-ink outline-none focus:border-accent'

function CreateTournamentForm() {
  const navigate = useNavigate()
  const create = useCreateTournament()
  const [name, setName] = useState('')
  const [type, setType] = useState<'round_robin' | 'knockout'>('round_robin')
  const [matchFormat, setMatchFormat] = useState('bo3')
  const [ranking, setRanking] = useState<TournamentRanking>('wins')
  const [thirdPlace, setThirdPlace] = useState(false)
  const [unranked, setUnranked] = useState(false)
  const isRally = findFormat(matchFormat)?.rallies !== null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    // Each type only sends its own option: ranking for round robin, the 3rd-place match for knockout.
    const options = type === 'round_robin' ? { ranking } : { thirdPlace }
    create.mutate({ name, matchFormat, type, ranked: !unranked, ...options }, { onSuccess: (t) => navigate(`/tournaments/${t.id}`) })
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <TextField label="Name" required maxLength={60} value={name} onValueChange={setName} />
      <label className="block">
        <span className="mb-1 block text-sm text-muted">Type</span>
        <select value={type} onChange={(e) => setType(e.target.value as 'round_robin' | 'knockout')} className={selectClass}>
          <option value="round_robin">Round robin</option>
          <option value="knockout">Knockout</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-muted">Match format</span>
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
      {type === 'round_robin' ? (
        <label className="block">
          <span className="mb-1 block text-sm text-muted">Ranked by</span>
          <select value={ranking} onChange={(e) => setRanking(e.target.value as TournamentRanking)} className={selectClass}>
            <option value="wins">Match wins</option>
            <option value="points" disabled={!isRally}>
              Points scored{isRally ? '' : ' (rally formats only)'}
            </option>
          </select>
        </label>
      ) : (
        <label className="flex items-center gap-2 self-end pb-2">
          <input type="checkbox" checked={thirdPlace} onChange={(e) => setThirdPlace(e.target.checked)} />
          <span className="text-sm">Play a 3rd-place match</span>
        </label>
      )}
      <label className="flex items-center gap-2 sm:col-span-2">
        <input type="checkbox" checked={unranked} onChange={(e) => setUnranked(e.target.checked)} />
        <span className="text-sm">Unranked tournament</span>
        <span className="text-sm text-muted">(results don't change anyone's rating)</span>
      </label>
      <div className="sm:col-span-2">
        <p className="mb-2 text-sm text-muted">
          {type === 'round_robin'
            ? 'Round robin: everyone plays everyone once (3–16 players).'
            : 'Knockout: lose once and you are out (4–16 players, seeded by rating, byes for the top seeds).'}{' '}
          You add the players next.
        </p>
        {create.error && <p className="mb-2 text-sm text-loss">{create.error.message}</p>}
        <button type="submit" disabled={create.isPending} className="rounded bg-accent text-on-accent px-4 py-2 font-semibold hover:bg-accent-hover disabled:opacity-50">
          {create.isPending ? 'Creating…' : 'Create tournament'}
        </button>
      </div>
    </form>
  )
}
