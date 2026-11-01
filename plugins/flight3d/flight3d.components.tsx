// The components of flight3d's extension (flight3d.extension.tsx): the Flight panel. Its runtime half
// sets a plane's stick on the live row through the recorder and shows what the plane is doing as its
// row says; its written half writes the scene file's `world.flight3d` a value at a time, with what each
// plane's sheet makes of its airframe beside it.
import { useState } from 'react'
import { useEditor } from '#editor/context.ts'
import { worldGridEdits, written } from '#editor/editor.ts'
import { Select, Slider } from '#editor/ui/fields.tsx'
import { PropertyGrid } from '#editor/ui/grid.tsx'
import { Badge, Empty, LabelledRow, Meter, Note, PanelBody, Section, Toolbar } from '#editor/ui/layout.tsx'
import { fly, flying, INPUTS, KIND, planesOf, priced, pricedText, type Input } from './flight3d.extension.tsx'
import type { Flight as Design } from './flight3d.sim.ts'

export function Flight() {
  const ed = useEditor(['game', 'selection'])
  const focus = ed.focus(KIND)
  const [picked, setPicked] = useState<number | undefined>(undefined)
  if (!ed.session) return <Empty>Open a game, and the planes of the scene selected are set here.</Empty>
  if (!focus) return <Empty>No scene of {ed.session.game.name} has a plane.</Empty>
  const { scene, truth, worldFile, world } = focus
  const design = truth.world[KIND] as Design | undefined
  const planes = planesOf(truth)
  const plane = planes.find(r => r.id === picked) ?? planes[0]
  const set = (field: Input) => (v: number, done: boolean) =>
    done ? fly(ed, scene, plane!.id, { [field]: v }) : ed.session!.preview(scene, plane!.id, [field], v)
  const airframes = design && priced(design)
  const now = plane && design && flying(design, plane)
  return (
    <PanelBody bar={<Toolbar label="flight"><Badge tone="dim">{scene}</Badge><span className="ui-spacer" /><Badge>{planes.length} planes</Badge></Toolbar>}>
      <Section title="Flying">
        {plane ? (
          <>
            <LabelledRow label="plane">
              <Select<number> label="plane" value={plane.id} options={planes.map(r => ({ value: r.id, label: `plane ${r.id} · ${r.data.type}` }))} onChange={v => setPicked(v)} />
            </LabelledRow>
            {(Object.entries(INPUTS) as [Input, number][]).map(([field, min]) => (
              <LabelledRow key={field} label={field}>
                <Slider label={`plane ${field}`} min={min} max={1} step={0.01} value={plane.data[field] ?? 0} onChange={set(field)} />
              </LabelledRow>
            ))}
            <Note>These set the plane as it flies, from the step shown on; the scene file keeps its own.</Note>
          </>
        ) : <Note>No plane has been made in {scene} yet.</Note>}
      </Section>
      {plane && now && design && (
        <Section title="Now">
          <LabelledRow label="state" extra={<Badge tone={now.crashed ? 'accent' : 'dim'}>{now.crashed ? 'crashed' : 'flying'}</Badge>}>
            <span aria-label="plane state">{`${now.speed.toFixed(1)} m/s · ${now.height.toFixed(0)} m · α ${now.aoa.toFixed(1)}° · β ${now.slip.toFixed(1)}°`}</span>
          </LabelledRow>
          <LabelledRow label="stall">
            <Meter label="plane stall" value={now.stall} min={0} max={1} text={`${Math.round(now.stall * 100)}%`} />
          </LabelledRow>
          <Note>How much of the wing's flow has let go: 0 attached, 100% a flat plate.</Note>
        </Section>
      )}
      {airframes && (
        <Section title="Airframes">
          {Object.entries(airframes).map(([type, a]) => (
            <LabelledRow key={type} label={type}>
              <span aria-label={`airframe ${type}`}>{pricedText(a)}</span>
            </LabelledRow>
          ))}
          <Note>The mass is the sum of the parts each sheet buys; the top speed is where full thrust meets drag at y = 0, the stall speed where the wing's most lift holds the weight.</Note>
        </Section>
      )}
      <Section title="Flight">
        <PropertyGrid
          value={world}
          owner={{ kind: KIND, scene, data: world }}
          onChange={(at, v, done) => {
            if (!done) return ed.session!.previewWorld(scene, [KIND, ...at], v)
            try {
              void written(ed, worldGridEdits(ed, KIND, worldFile, world, { [at.join('.')]: v })).catch(() => {})
            } catch (e) {
              ed.error(`flight3d: refused: ${(e as Error).message}`)
              // What the drag showed goes, and the scene's `world` is its file's again.
              ed.session!.previewWorld(scene, [KIND, ...at], at.reduce<unknown>((o, k) => (o as Record<string | number, unknown>)[k], world))
            }
          }}
        />
      </Section>
    </PanelBody>
  )
}
