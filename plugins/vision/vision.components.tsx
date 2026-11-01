// The components of the fog's extension (vision.extension.tsx): the fields of its opacities and its
// layer.
import { useEditor } from '#editor/context.ts'
import type { FieldProps } from '#editor/editor.ts'
import { NumberField, Select, Slider } from '#editor/ui/fields.tsx'

// An opacity from 0 to 1; a value that is no number is drawn as the number field draws it.
export function Opacity({ value, onChange, label }: FieldProps<number>) {
  if (typeof value !== 'number') return <NumberField label={label} value={Number(value)} onChange={onChange} />
  return <Slider label={label} value={value} min={0} max={1} step={0.05} onChange={onChange} />
}

// A layer of `world.render2d` of the owner's scene, from its file or else the game's; one it does
// not name is kept, and said to be missing.
export function FogLayer({ value, onChange, owner, label }: FieldProps<string>) {
  const ed = useEditor(['game', 'selection'])
  const s = ed.session
  const scene = owner.scene ?? ed.focus('render2d')?.scene
  const table = s && scene !== undefined ? s.files.get(ed.worldFile(scene, 'render2d'))?.world?.render2d : undefined
  const layers = ((table?.layers ?? []) as (string | { name: string })[]).map(l => (typeof l === 'string' ? l : l.name))
  const options = [...(layers.includes(value) ? [] : [{ value, label: `${value} (not a render2d layer)` }]), ...layers.map(l => ({ value: l }))]
  return <Select<string> label={label} value={value} options={options} onChange={onChange} />
}
