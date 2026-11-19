// A labelled text input for the forms. Extra props (type, required, minLength, …) go straight to the <input>.
import type { InputHTMLAttributes } from 'react'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  value: string
  onValueChange: (value: string) => void
}

export default function TextField({ label, value, onValueChange, ...inputProps }: TextFieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      <input
        {...inputProps}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className="w-full rounded border border-line-strong bg-surface px-3 py-2 text-ink outline-none focus:border-accent"
      />
    </label>
  )
}
