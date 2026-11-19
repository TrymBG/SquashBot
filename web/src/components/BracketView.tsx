// A knockout bracket: one column per round, left to right ("Quarterfinals" → "Semifinals" → "Final"), with the
// 3rd-place match under the final. On a phone the columns scroll sideways. Each match is a TournamentMatchRow card,
// so reporting and confirming work exactly like in the round-robin schedule.
import type { TournamentDetails, User } from '../api.ts'
import TournamentMatchRow from './TournamentMatchRow.tsx'

export default function BracketView({ t, currentUser }: { t: TournamentDetails; currentUser: User | null | undefined }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex gap-4">
        {t.rounds.map(({ round, name }) => {
          const matches = t.matches.filter((m) => m.round === round && !m.thirdPlace)
          const thirdPlace = t.matches.find((m) => m.round === round && m.thirdPlace)
          return (
            <section key={round} className="flex w-56 shrink-0 flex-col">
              <h3 className="mb-2 text-sm font-semibold text-slate-400">{name}</h3>
              {/* justify-around spreads the cards so each sits roughly between the two it comes from */}
              <ul className="flex flex-1 flex-col justify-around gap-3">
                {matches.map((m) => (
                  <TournamentMatchRow key={m.id} match={m} matchFormat={t.matchFormat} currentUser={currentUser} compact />
                ))}
              </ul>
              {thirdPlace && (
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-semibold text-slate-400">3rd place</h3>
                  <ul>
                    <TournamentMatchRow match={thirdPlace} matchFormat={t.matchFormat} currentUser={currentUser} compact />
                  </ul>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
