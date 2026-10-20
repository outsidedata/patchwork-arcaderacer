import { useSyncExternalStore } from 'react'
import { useEditor } from '#editor/context.ts'
import { NumberField, Select } from '#editor/ui/fields.tsx'
import { Button, Empty, LabelledRow, Note, PanelBody, Row, Section } from '#editor/ui/layout.tsx'
import { Table, type Column } from '#editor/ui/table.tsx'
import { gridScene, most, type Painter } from './grid.extension.tsx'
import { spec } from './grid.sim.ts'

type Layer = { name: string; bits: number; scale: number; value?: number }

export function CellsPanel({ painter }: { painter: Painter }) {
  const ed = useEditor(['game', 'selection', 'tools'])
  useSyncExternalStore(painter.subscribe, painter.version)
  const scene = gridScene(ed)
  const world = scene ? ed.session!.scene(scene).world : undefined
  if (!scene || !world?.grid) return <PanelBody><Empty>No scene has a grid.</Empty></PanelBody>
  const g = spec(world)
  const names = Object.keys(g.layers)
  const { brush, over } = painter
  const layer = brush.layer !== undefined && brush.layer in g.layers ? brush.layer : undefined
  const top = layer === undefined ? 0 : most(g, layer)
  const painting = ed.tooling === 'grid.paint'
  const here = over?.scene === scene ? over : undefined
  const rows: Layer[] = names.map(name => ({ name, bits: g.layers[name].bits, scale: g.layers[name].scale, value: here?.values[name] }))
  const columns: Column<Layer>[] = [
    { key: 'layer', title: 'layer', cell: l => l.name },
    { key: 'bits', title: 'bits', cell: l => String(l.bits), numeric: true },
    { key: 'scale', title: 'scale', cell: l => String(l.scale), numeric: true },
    { key: 'value', title: here ? `[${here.x}, ${here.y}]` : 'value', cell: l => (l.value === undefined ? '' : String(l.value)), numeric: true },
  ]
  return (
    <PanelBody>
      <Section title={`${scene}: ${g.size[0]} × ${g.size[1]} cells in chunks of ${g.chunk}`}>
        <Table<Layer> label="layers" rows={rows} columns={columns} keyOf={l => l.name} selected={layer} onSelect={name => painter.set({ layer: name, value: Math.min(brush.value, most(g, name)) })} />
      </Section>
      <Section title="Brush">
        <LabelledRow label="layer">
          <Select<string> label="layer to paint" value={layer ?? ''} options={[{ value: '', label: 'none' }, ...names.map(n => ({ value: n }))]} onChange={v => painter.set({ layer: v || undefined, value: v ? Math.min(brush.value, most(g, v)) : brush.value })} />
        </LabelledRow>
        <LabelledRow label="value" title={layer === undefined ? 'pick a layer' : `a whole number from 0 to ${top}`}>
          <NumberField label="value to paint" integer value={brush.value} onChange={v => painter.set({ value: Math.max(0, Math.min(top, Math.round(v))) })} />
        </LabelledRow>
        <LabelledRow label="size" title="the brush's width in cells">
          <NumberField label="brush size" integer value={brush.size} onChange={v => painter.set({ size: Math.max(1, Math.round(v)) })} />
        </LabelledRow>
        <Row>
          <Button primary pressed={painting} title="Paint Cells" disabled={layer === undefined} onClick={() => ed.activate(painting ? undefined : 'grid.paint')}>Paint</Button>
        </Row>
        {layer === undefined && <Note>Pick a layer to paint.</Note>}
        <Note>A stroke is one change the editor can undo, made through the recorder: each chunk it touched gets its layer's string anew.</Note>
      </Section>
    </PanelBody>
  )
}
