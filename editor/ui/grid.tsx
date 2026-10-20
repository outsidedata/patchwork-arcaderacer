// A value's fields, one row each, every one drawn by the component for its type. The type of a
// field is the one a binding gives it (`Editor.bind`, and `Editor.bindFile` for a data file's), or
// else the one its value's shape says.
// An object or a list folds open into its own fields.
import type { ReactNode } from 'react'
import type { Path } from '#addons/recorder/recorder.addon.ts'
import { useEditor } from '../context.ts'
import { folds, isColor, isVec, type Owner } from '../editor.ts'
import { Check, ColorField, JsonField, NumberField, TextField, VecField } from './fields.tsx'
import { LabelledRow, Section } from './layout.tsx'

// One value, drawn by its type's component.
export function Field({ value, at, owner, onChange, label }: {
  value: unknown
  at: Path
  owner: Owner
  onChange(value: unknown, done: boolean): void
  label?: string
}) {
  const ed = useEditor(['extensions'])
  const type = ed.typeOf(owner.kind, at, owner.file)
  const Bound = type ? ed.fields.get(type)?.component : undefined
  if (Bound) return <Bound value={value} at={at} owner={owner} onChange={onChange} label={label} />
  if (typeof value === 'number') return <NumberField label={label} value={value} onChange={onChange} />
  if (typeof value === 'boolean') return <Check label={label} value={value} onChange={onChange} />
  if (isColor(value)) return <ColorField label={label} value={value as string} onChange={onChange} />
  if (typeof value === 'string') return <TextField label={label} value={value} onChange={onChange} />
  if (isVec(value)) return <VecField label={label} value={value as number[]} onChange={onChange} />
  return <JsonField label={label} value={value} onChange={onChange} />
}

export function PropertyGrid({ value, owner, onChange, at = [], extra, top = 0 }: {
  value: Record<string, unknown> | unknown[]
  owner: Owner
  onChange(at: Path, value: unknown, done: boolean): void
  // Where `value` is in what the owner's bindings are keyed from: a scene's `world` is at
  // `['world']` of its scene file.
  at?: Path
  // Drawn after each field's value, handed that field's path: an action on it.
  extra?(at: Path): ReactNode
  // How many keys of `at` lie above the grid's own top, as `['world']` does above a scene's world:
  // the objects and lists at its top start open, and each field is labelled by its path below it.
  top?: number
}) {
  const ed = useEditor(['extensions'])
  const keys: (string | number)[] = Array.isArray(value) ? value.map((_, i) => i) : Object.keys(value)
  return (
    <div className="ui-grid">
      {keys.map(k => {
        const v = (value as Record<string | number, unknown>)[k]
        const path = [...at, k]
        const bound = ed.typeOf(owner.kind, path, owner.file)
        if (folds(v) && !bound)
          return (
            <Section key={k} title={<span className="ui-key">{k}</span>} open={at.length === top}>
              <PropertyGrid value={v} owner={owner} onChange={onChange} at={path} extra={extra} top={top} />
            </Section>
          )
        return (
          <LabelledRow key={k} label={k} title={path.join('.')} extra={extra?.(path)}>
            <Field label={path.slice(top).join('.')} value={v} at={path} owner={owner} onChange={(nv, done) => onChange(path, nv, done)} />
          </LabelledRow>
        )
      })}
    </div>
  )
}
