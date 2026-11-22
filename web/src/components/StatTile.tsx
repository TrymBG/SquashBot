// One headline number with an optional change, e.g. your rating and how it moved this week.
// The change carries an arrow and a sign (▲ +14 / ▼ −6), so it never relies on colour alone; green = up, red = down.
// Proportional figures on the big number (equal-width digits look loose at large sizes).
interface Props {
  label: string
  value: string
  change?: { amount: number; period: string } // e.g. { amount: 14, period: 'this week' }
}

export default function StatTile({ label, value, change }: Props) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <p className="flex items-baseline gap-3">
        <span className="text-3xl font-semibold">{value}</span>
        {change && <Change {...change} />}
      </p>
    </div>
  )
}

function Change({ amount, period }: { amount: number; period: string }) {
  const rounded = Math.round(amount)
  if (rounded === 0) return <span className="text-sm text-muted">±0 {period}</span>
  const up = rounded > 0
  return (
    <span className={`text-sm font-semibold ${up ? 'text-win' : 'text-loss'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span> {up ? `+${rounded}` : `−${-rounded}`}{' '}
      <span className="font-normal text-muted">{period}</span>
    </span>
  )
}
