// Your part of the ladder on the front page: the player just above you, you, and the player just below, with the
// rating gaps written on the rails between the plates ("72 to pass Lars", "29 ahead of Ingrid"). It turns your
// rating into a target. Nothing is shown if you're not on the ladder (the dashboard says so instead).
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { fetchLeaderboard } from '../api.ts'
import { crossesStart } from '../ladder.ts'
import { Plate, Rails, StartLine } from './Ladder.tsx'

export default function NextRung({ me }: { me: string }) {
  // Same query key as the ladder widget: one request for both.
  const { data: players } = useQuery({ queryKey: ['leaderboard'], queryFn: fetchLeaderboard })
  const index = players?.findIndex((p) => p.id === me) ?? -1
  if (!players || index === -1) return null

  const mine = players[index]!
  const above = players[index - 1]
  const below = players[index + 1]

  return (
    <section aria-labelledby="next-rung" className="mt-8">
      <h2 id="next-rung" className="type-heading mb-2">
        {above ? 'Next rung' : 'Top of the ladder'}
      </h2>
      <Rails>
        {above && (
          <>
            <li>
              <Plate player={above} position={index} mine={false} full={false} />
            </li>
            <Gap>
              <Points value={above.rating - mine.rating} /> to pass {above.displayName}
            </Gap>
            {crossesStart(above, mine) && <StartLine />}
          </>
        )}
        <li>
          <Plate player={mine} position={index + 1} mine full={false} />
        </li>
        {below && (
          <>
            {crossesStart(mine, below) && <StartLine />}
            <Gap>
              <Points value={mine.rating - below.rating} /> ahead of {below.displayName}
            </Gap>
            <li>
              <Plate player={below} position={index + 2} mine={false} full={false} />
            </li>
          </>
        )}
      </Rails>
    </section>
  )
}

// The text written on the rails between two plates.
function Gap({ children }: { children: ReactNode }) {
  return <li className="py-0.5 pl-12 text-sm text-muted">{children}</li>
}

// A rating gap as a whole number, at least 1 (a gap of 0.4 still means "not passed yet").
function Points({ value }: { value: number }) {
  return <span className="type-figure text-ink">{Math.max(1, Math.round(value))}</span>
}
