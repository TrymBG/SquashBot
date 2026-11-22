// A small trophy for tournament links and winners, drawn with lines in the current text colour (replaces the 🏆 emoji,
// which looks different on every phone and can't follow the colours). Decorative: the tournament name is next to it.
export default function TrophyIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
      <path d="M12 14v4M8 21h8M9 18h6" />
    </svg>
  )
}
