// A round avatar: the Discord picture if we have one, otherwise the first letter of the name (seed players).
const SIZES = {
  sm: 'size-8 text-sm',
  lg: 'size-16 text-2xl',
}

export default function Avatar({ name, url, size = 'sm' }: { name: string; url: string | null; size?: keyof typeof SIZES }) {
  if (url) {
    return <img src={url} alt="" className={`${SIZES[size]} rounded-full`} />
  }
  return (
    <div className={`flex ${SIZES[size]} shrink-0 items-center justify-center rounded-full bg-slate-700 font-semibold`}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
