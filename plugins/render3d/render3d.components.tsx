// The components of render3d's extension (render3d.extension.tsx): the fields of its prefab.
import type { FieldProps } from '#editor/editor.ts'
import { Select, Slider } from '#editor/ui/fields.tsx'
import { shadowings, tones } from './render3d.plugin.ts'

// The camera's vertical field of view, in degrees, from 10 to 120.
export function Fov({ value, onChange, label }: FieldProps<number>) {
  return <Slider label={label} min={10} max={120} step={1} value={value} onChange={onChange} />
}

export function Tone({ value, onChange, label }: FieldProps<string>) {
  return <Select<string> label={label} value={value} options={tones.map(v => ({ value: v }))} onChange={onChange} />
}

export function Shadows({ value, onChange, label }: FieldProps<string>) {
  return <Select<string> label={label} value={value} options={shadowings.map(v => ({ value: v }))} onChange={onChange} />
}
