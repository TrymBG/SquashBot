// Display formatting. Ratings are stored unrounded and only rounded here; times are stored in UTC
// and shown in Norwegian time.
import type { TournamentSummary } from './api.ts'
import { findFormat } from './formats.ts'

const dateFormat = new Intl.DateTimeFormat('nb-NO', {
  timeZone: 'Europe/Oslo',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

// "8. nov. 2026"
export function formatDate(isoTimestamp: string): string {
  return dateFormat.format(new Date(isoTimestamp))
}

export function formatRating(rating: number): string {
  return String(Math.round(rating))
}

// "+16", "−12" (a real minus sign), "±0". Rounded the same way as the ratings, so the numbers add up on screen.
export function formatRatingChange(before: number, after: number): string {
  const change = Math.round(after) - Math.round(before)
  if (change > 0) return `+${change}`
  if (change < 0) return `−${-change}`
  return '±0'
}

// 0.774 → "77%"
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

// "bo5" → "Bo5", "r15" → "R15". An unknown format is shown as it is.
export function formatMatchFormat(format: string): string {
  return findFormat(format)?.short ?? format
}

// "Round robin, 15 rallies, ranked by points" / "Knockout, Best of 3, with 3rd-place match"
export function describeTournament(
  t: Pick<TournamentSummary, 'type' | 'matchFormat' | 'ranking' | 'thirdPlace' | 'ranked'>,
): string {
  const format = findFormat(t.matchFormat)?.label ?? t.matchFormat
  const unranked = t.ranked ? '' : ', unranked'
  if (t.type === 'knockout') {
    return `Knockout, ${format}${t.thirdPlace ? ', with 3rd-place match' : ''}${unranked}`
  }
  return `Round robin, ${format}, ranked by ${t.ranking === 'points' ? 'points' : 'wins'}${unranked}`
}

// "Draft", "Ongoing 3/6 played", "Finished"
export function statusText(t: Pick<TournamentSummary, 'status' | 'matchCount' | 'playedCount'>): string {
  if (t.status === 'draft') return 'Draft'
  if (t.matchCount > 0 && t.playedCount === t.matchCount) return 'Finished'
  return `Ongoing ${t.playedCount}/${t.matchCount} played`
}

// "just now", "5 min", "2 h", "3 d", and the date once it's more than a week old. For the activity feed.
export function formatTimeAgo(isoTimestamp: string, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(isoTimestamp).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  if (days <= 7) return `${days} d`
  return formatDate(isoTimestamp)
}
