// The components of the types extension (types.extension.tsx).
import type { FieldProps } from '#editor/editor.ts'
import { AngleDial, ColorField, NumberField } from '#editor/ui/fields.tsx'

const DEG = 180 / Math.PI

export function Color({ value, onChange, label }: FieldProps<number | string>) {
  return <ColorField label={label} value={value} onChange={onChange} />
}

export function Angle({ value, onChange, label }: FieldProps<number>) {
  return <NumberField label={label} step={1} value={+(value * DEG).toFixed(3)} onChange={(v, done) => onChange(v / DEG, done)} />
}

export function Integer({ value, onChange, label }: FieldProps<number>) {
  return <NumberField label={label} integer value={value} onChange={onChange} />
}

export function Bearing({ value, onChange, label }: FieldProps<number>) {
  return <AngleDial label={label} value={value} onChange={onChange} />
}
