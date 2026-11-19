// Display formatting. Ratings are stored unrounded and only rounded here; times are stored in UTC
// and shown in Norwegian time.
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
