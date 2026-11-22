// The match format as a small tag ("Bo5", "R15"), so it reads as a property of the match, not part of a sentence.
import { formatMatchFormat } from '../format.ts'

export default function FormatTag({ format }: { format: string }) {
  return (
    <span className="rounded-sm border border-line-strong px-1.5 text-xs font-semibold text-soft [font-stretch:87.5%]">
      {formatMatchFormat(format)}
    </span>
  )
}
