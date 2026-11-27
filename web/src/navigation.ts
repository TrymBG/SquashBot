// Where to go after logging in or signing up: the `?next=` page (e.g. back to a group's join link), but only a path
// on this site. "/x" is fine; "//evil.com" and "/\evil.com" are rejected, because browsers read them as links to another
// site (an "open redirect" a phishing link could abuse).
export function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value[1] === '/' || value[1] === '\\') return null
  return value
}
