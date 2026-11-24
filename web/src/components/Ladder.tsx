// The leaderboard drawn as a club ladder: the board on the wall with a name plate per player, best at the top.
// Two rails (the left and right borders) with the players as rungs. Your own plate is the only yellow one.
// Each plate: position, name, rating and the movement since last week (▲2 / ▼1 / New). The full version
// (leaderboard page) also shows the avatar and the W–L record; the compact one (front page) leaves them out.
// A dashed line marks where ratings cross 1000, the rating everyone starts at: above it you've gained, below it lost.
import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'
import { STARTING_RATING, type LeaderboardRow } from '../api.ts'
import { crossesStart } from '../ladder.ts'
import { formatRating } from '../format.ts'
import Avatar from './Avatar.tsx'

interface Props {
  players: LeaderboardRow[]
  me?: string | undefined // your player id: that plate is highlighted
  full?: boolean
  notOnLadder?: string | undefined // your name, if you're logged in but have no rated match yet: a dashed plate at the bottom
}

export default function Ladder({ players, me, full = false, notOnLadder }: Props) {
  return (
    <Rails>
      {players.map((player, index) => (
        <Fragment key={player.id}>
          {crossesStart(players[index - 1], player) && <StartLine />}
          <li>
            <Plate player={player} position={index + 1} mine={player.id === me} full={full} />
          </li>
        </Fragment>
      ))}
      {notOnLadder && (
        <li className="flex min-h-11 items-center gap-3 rounded-sm border border-dashed border-line-strong px-3 py-1.5 text-muted">
          <span className="w-6" />
          <span className="flex-1 font-semibold [font-stretch:87.5%]">{notOnLadder}</span>
          <span className="text-sm">Not on the ladder yet</span>
        </li>
      )}
    </Rails>
  )
}

// The two rails of the ladder (left and right border) around a list of rungs.
export function Rails({ children }: { children: ReactNode }) {
  return <ol className="space-y-1.5 border-x-2 border-line-strong px-1.5 py-1.5">{children}</ol>
}

export function StartLine() {
  return (
    <li className="flex items-center gap-2 px-1 text-xs text-faint" aria-label={`Start rating ${STARTING_RATING}`}>
      <span className="flex-1 border-t border-dashed border-line-strong" />
      <span aria-hidden="true">{STARTING_RATING} start</span>
      <span className="w-4 border-t border-dashed border-line-strong" />
    </li>
  )
}

export function Plate({ player, position, mine, full }: { player: LeaderboardRow; position: number; mine: boolean; full: boolean }) {
  // On your yellow plate everything is dark text (green and red are unreadable on yellow); elsewhere quiet greys.
  const quiet = mine ? 'text-on-accent/70' : 'text-muted'
  return (
    <Link
      to={`/players/${player.id}`}
      aria-current={mine ? 'true' : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-sm px-3 py-1.5 ${
        mine ? 'bg-accent text-on-accent hover:bg-accent-hover' : 'bg-surface hover:bg-surface-hover'
      }`}
    >
      <span className={`type-figure w-6 text-right text-lg ${quiet}`}>{position}</span>
      {full && <Avatar name={player.displayName} url={player.avatarUrl} />}
      <span className="min-w-0 flex-1 truncate font-semibold [font-stretch:87.5%]">
        {player.displayName}
        {mine && <span className="sr-only"> (you)</span>}
      </span>
      {full && (
        <span className={`hidden text-sm tabular-nums sm:inline ${quiet}`}>
          {player.wins}–{player.losses}
        </span>
      )}
      <span className="type-figure w-12 text-right text-lg">{formatRating(player.rating)}</span>
      <Movement change={player.rankChange} onAccent={mine} />
    </Link>
  )
}

// ▲2 / ▼1 / New / nothing. The arrow and the number carry the meaning; the colour only repeats it.
function Movement({ change, onAccent }: { change: number | null; onAccent: boolean }) {
  const box = 'w-10 text-right text-sm font-semibold'
  if (change === null) {
    return <span className={`${box} ${onAccent ? 'text-on-accent/70' : 'text-accent'}`}>New</span>
  }
  if (change === 0) {
    return (
      <span className={box}>
        <span className="sr-only">Same place as last week</span>
      </span>
    )
  }
  const up = change > 0
  const colour = onAccent ? '' : up ? 'text-win' : 'text-loss'
  return (
    <span className={`${box} tabular-nums ${colour}`}>
      <span aria-hidden="true">
        {up ? '▲' : '▼'}
        {Math.abs(change)}
      </span>
      <span className="sr-only">
        {up ? 'Up' : 'Down'} {Math.abs(change)} since last week
      </span>
    </span>
  )
}
