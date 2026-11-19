// Every match format, in one place for the website (a copy of the backend's src/formats.ts, with display names).
// The report form, the match filters, the profile and the score list all read from here.

export interface FormatInfo {
  value: string // stored and sent to the API: "bo5", "r15"
  label: string // in dropdowns: "Best of 5", "15 rallies"
  short: string // in lists: "Bo5", "R15"
  rallies: number | null // fixed-rally formats: points played per match; null for games formats
}

export const FORMATS: FormatInfo[] = [
  { value: 'bo1', label: 'Best of 1', short: 'Bo1', rallies: null },
  { value: 'bo3', label: 'Best of 3', short: 'Bo3', rallies: null },
  { value: 'bo5', label: 'Best of 5', short: 'Bo5', rallies: null },
  { value: 'ft6', label: 'First to 6', short: 'FT6', rallies: null },
  { value: 'r11', label: '11 rallies', short: 'R11', rallies: 11 },
  { value: 'r15', label: '15 rallies', short: 'R15', rallies: 15 },
  { value: 'r21', label: '21 rallies', short: 'R21', rallies: 21 },
]

export function findFormat(value: string | null): FormatInfo | undefined {
  return FORMATS.find((f) => f.value === value)
}
