// A round avatar: the Discord picture if we have one, otherwise the first letter of the name (seed players).
export default function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return <img src={url} alt="" className="size-8 rounded-full" />
  }
  return (
    <div className="flex size-8 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
