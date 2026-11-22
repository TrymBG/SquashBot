// /tournaments/:id. Draft: the player list (the organizer adds/removes players and starts it).
// Active or finished: the standings table and the schedule by round, where players report and confirm results.
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { isNotFound, type TournamentDetails, type User } from '../api.ts'
import { useCurrentUser } from '../auth.ts'
import BracketView from '../components/BracketView.tsx'
import Meta from '../components/Meta.tsx'
import TrophyIcon from '../components/TrophyIcon.tsx'
import StandingsTable from '../components/StandingsTable.tsx'
import TournamentMatchRow from '../components/TournamentMatchRow.tsx'
import { useOpponents } from '../reports.ts'
import { useAddPlayer, useRemovePlayer, useStartTournament, useTournament } from '../tournaments.ts'
import { describeTournament, statusText } from '../format.ts'

// Same rules as the server: a knockout needs 4 (with 3 there'd be no real semifinal).
const MIN_PLAYERS = { round_robin: 3, knockout: 4 }

export default function TournamentPage() {
  const { id = '' } = useParams()
  const tournament = useTournament(Number(id))
  const currentUser = useCurrentUser()

  if (tournament.isPending) return <p className="text-muted">Loading…</p>
  if (isNotFound(tournament.error) || !/^\d+$/.test(id)) return <p className="text-muted">Tournament not found.</p>
  if (tournament.isError) return <p className="text-loss">Could not load the tournament.</p>

  const t = tournament.data
  return (
    <div className="space-y-8">
      <Link to="/tournaments" className="text-sm text-muted hover:underline">
        ← Tournaments
      </Link>
      <header>
        <h1 className="type-title">{t.name}</h1>
        <Meta className="mt-1">
          {describeTournament(t)}
          <span>Organised by {t.organizer.displayName}</span>
          <span className="text-soft">{statusText(t)}</span>
        </Meta>
      </header>
      {t.status === 'active' && !t.finished && t.ranked && (
        <p className="text-sm text-muted">Ratings update when the tournament is finished.</p>
      )}
      {t.status === 'draft' ? <DraftView t={t} currentUser={currentUser} /> : <ActiveView t={t} currentUser={currentUser} />}
    </div>
  )
}

function DraftView({ t, currentUser }: { t: TournamentDetails; currentUser: User | null | undefined }) {
  const isOrganizer = currentUser?.playerId === t.organizer.id
  const remove = useRemovePlayer(t.id)
  const start = useStartTournament(t.id)
  const error = remove.error ?? start.error
  const minPlayers = MIN_PLAYERS[t.type]
  const tooFew = t.players.length < minPlayers

  return (
    <section className="space-y-4">
      <h2 className="type-heading">Players ({t.players.length})</h2>
      {t.players.length === 0 && <p className="text-muted">No players yet.</p>}
      <ul className="divide-y divide-line">
        {t.players.map((p) => (
          <li key={p.playerId} className="flex items-center justify-between py-2">
            <Link to={`/players/${p.playerId}`} className="hover:underline">
              {p.displayName}
            </Link>
            {isOrganizer && (
              <button
                type="button"
                aria-label={`Remove ${p.displayName}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(p.playerId)}
                className="text-faint hover:text-loss"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      {isOrganizer && currentUser ? (
        <>
          <AddPlayer t={t} currentUser={currentUser} />
          {error && <p className="text-sm text-loss">{error.message}</p>}
          <button
            type="button"
            disabled={tooFew || start.isPending}
            onClick={() => start.mutate()}
            className="rounded bg-win-strong px-4 py-2 font-semibold hover:brightness-110 disabled:opacity-50"
          >
            {start.isPending ? 'Starting…' : 'Start tournament'}
          </button>
          <p className="text-sm text-muted">
            {tooFew
              ? `Add at least ${minPlayers} players to start.`
              : t.type === 'knockout'
                ? 'Starting seeds the players by rating and draws the bracket; after that the player list is locked.'
                : 'Starting draws up the schedule; after that the player list is locked.'}
          </p>
        </>
      ) : (
        <p className="text-muted">Waiting for {t.organizer.displayName} to start the tournament.</p>
      )}
    </section>
  )
}

// A dropdown of web players who aren't in yet (yourself included), plus "Add".
function AddPlayer({ t, currentUser }: { t: TournamentDetails; currentUser: User }) {
  const opponents = useOpponents()
  const add = useAddPlayer(t.id)
  const [playerId, setPlayerId] = useState('')
  const joined = new Set(t.players.map((p) => p.playerId))
  const candidates = [
    { id: currentUser.playerId, displayName: `${currentUser.displayName} (you)` },
    ...(opponents.data ?? []),
  ].filter((p) => !joined.has(p.id))

  if (candidates.length === 0) return <p className="text-sm text-muted">Everyone with an account is in.</p>

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Player to add"
        value={playerId}
        onChange={(e) => setPlayerId(e.target.value)}
        className="rounded border border-line-strong bg-surface px-3 py-2 text-ink"
      >
        <option value="" disabled>
          Choose a player…
        </option>
        {candidates.map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!playerId || add.isPending}
        onClick={() => add.mutate(playerId, { onSuccess: () => setPlayerId('') })}
        className="rounded border border-line-strong px-3 py-2 hover:bg-surface-hover disabled:opacity-50"
      >
        Add
      </button>
      {add.error && <p className="w-full text-sm text-loss">{add.error.message}</p>}
    </div>
  )
}

function ActiveView({ t, currentUser }: { t: TournamentDetails; currentUser: User | null | undefined }) {
  if (t.type === 'knockout') return <KnockoutView t={t} currentUser={currentUser} />

  const winners = t.standings.filter((row) => row.position === 1).map((row) => row.displayName)

  return (
    <>
      {t.finished && (
        <p className="flex items-center gap-2 rounded-sm bg-accent/10 px-4 py-3 font-semibold text-accent">
          <TrophyIcon className="h-5 w-5" />
          {winners.length > 1 ? 'Shared first place' : 'Winner'}: {winners.join(' & ')}
        </p>
      )}

      <section>
        <h2 className="mb-2 type-heading">Standings</h2>
        <StandingsTable rows={t.standings} ranking={t.ranking ?? 'wins'} />
      </section>

      <section className="space-y-4">
        <h2 className="type-heading">Schedule</h2>
        {t.rounds.map(({ round, name }) => (
          <div key={round}>
            <h3 className="mb-1 text-sm text-muted">{name}</h3>
            <ul className="space-y-1">
              {t.matches
                .filter((m) => m.round === round)
                .map((m) => (
                  <TournamentMatchRow key={m.id} match={m} matchFormat={t.matchFormat} currentUser={currentUser} />
                ))}
            </ul>
          </div>
        ))}
      </section>
    </>
  )
}

// Knockout: the bracket, and the podium once it's finished.
function KnockoutView({ t, currentUser }: { t: TournamentDetails; currentUser: User | null | undefined }) {
  const podium = t.podium
  return (
    <>
      {t.finished && podium && (
        <div className="space-y-1 rounded bg-accent/10 px-4 py-3 text-ink">
          <p className="text-lg font-semibold text-accent">🥇 {podium.first?.displayName}</p>
          <p>🥈 {podium.second?.displayName}</p>
          {podium.third.length > 0 && <p>🥉 {podium.third.map((p) => p.displayName).join(' & ')}</p>}
        </div>
      )}
      <section>
        <h2 className="mb-2 type-heading">Bracket</h2>
        <BracketView t={t} currentUser={currentUser} />
      </section>
    </>
  )
}
