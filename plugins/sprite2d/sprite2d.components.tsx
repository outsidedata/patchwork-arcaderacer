// The components of sprite2d's extension (sprite2d.extension.tsx): the field of a sprite's clip.
import { useMemo } from 'react'
import { useEditor, useText } from '#editor/context.ts'
import type { FieldProps } from '#editor/editor.ts'
import { Check, JsonField, NumberField, Select, TextField } from '#editor/ui/fields.tsx'
import { read } from '#plugins/loader/loader.sim.ts'
import { sheetFor } from './sprite2d.extension.tsx'

// A clip of the sheet the owner's `sheet` names, else of its kind's sheet (`sheetFor`), from the
// catalogue of the owner's scene; typed as text while that sheet is unknown. A value that is no
// name, nor none, is no clip, a row's field of the name a definition gives a clip say, and is drawn
// as the value it is.
export function ClipName(props: FieldProps<unknown>) {
  const { value, onChange, label } = props
  if (typeof value === 'boolean') return <Check label={label} value={value} onChange={onChange} />
  if (typeof value === 'number') return <NumberField label={label} value={value} onChange={onChange} />
  if (typeof value !== 'string' && value !== null) return <JsonField label={label} value={value} onChange={v => onChange(v, true)} />
  return <Clip {...(props as FieldProps<string | null>)} />
}
function Clip({ value, onChange, owner, label }: FieldProps<string | null>) {
  const ed = useEditor(['game', 'selection'])
  const s = ed.session
  const scene = owner.scene ?? ed.focus('loader')?.scene
  const shown = s ? sheetFor(s, scene, owner) : undefined
  const text = useText(shown?.path)
  const url = shown?.asset.url, nearest = shown?.asset.nearest, facing = JSON.stringify(shown?.asset.facing)
  const clips = useMemo(() => {
    if (url === undefined || text === undefined) return undefined
    try {
      return Object.keys(read(JSON.parse(text), url, { nearest, facing: facing === undefined ? undefined : JSON.parse(facing) }).clips)
    } catch {
      return undefined
    }
  }, [url, nearest, facing, text])
  if (!clips) return typeof value === 'string' ? <TextField label={label} value={value} onChange={onChange} /> : <JsonField label={label} value={value} onChange={v => onChange(v as string | null, true)} />
  const options = [
    ...(value === null ? [{ value: '', label: 'none' }] : []),
    ...(value !== null && !clips.includes(value) ? [{ value, label: `${value} (not in ${shown!.name})` }] : []),
    ...clips.map(c => ({ value: c })),
  ]
  return <Select<string> label={label} value={value ?? ''} options={options} onChange={(v, done) => onChange(v === '' ? null : v, done)} />
}
