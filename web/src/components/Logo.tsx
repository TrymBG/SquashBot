// The mark: a squash ball with two yellow dots, the ball used in competition. Same drawing as public/favicon.svg,
// but coloured with the design tokens. Decorative next to the "Squash Ladder" text, so hidden from screen readers.
export default function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="14" className="fill-canvas stroke-line-strong" strokeWidth="2" />
      <circle cx="11.5" cy="13" r="3.2" className="fill-accent" />
      <circle cx="20.5" cy="13" r="3.2" className="fill-accent" />
    </svg>
  )
}
