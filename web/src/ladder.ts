// Small ladder rules shared by the Ladder and NextRung components (kept out of the component files, so React's
// fast refresh keeps working: a component file should only export components).
import { STARTING_RATING, type LeaderboardRow } from './api.ts'

// True between the last plate at or above the starting rating and the first one below it: where the "1000 start"
// line goes.
export function crossesStart(above: LeaderboardRow | undefined, player: LeaderboardRow): boolean {
  return above !== undefined && above.rating >= STARTING_RATING && player.rating < STARTING_RATING
}
