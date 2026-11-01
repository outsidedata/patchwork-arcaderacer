// The components of box3dvehicle's extension (box3dvehicle.extension.tsx): the Vehicle panel. Its
// runtime half sets a car's inputs on the live row through the recorder and shows its suspension as
// the row reports it; its written half writes the scene file's `world.box3dvehicle` a value at a
// time, with what each axle's numbers make of the car, in the scene's gravity, beside them; and the
// field a vehicle's `look.model.asset` is drawn as, a choice of the catalogue's models.
import { useState } from 'react'
import { useEditor } from '#editor/context.ts'
import { Select, Slider } from '#editor/ui/fields.tsx'
import { PropertyGrid } from '#editor/ui/grid.tsx'
import { Badge, Empty, LabelledRow, Meter, Note, PanelBody, Section, Toolbar } from '#editor/ui/layout.tsx'
import { worldGridEdits, written, type FieldProps } from '#editor/editor.ts'
import { entriesOf } from '#plugins/loader/loader.extension.tsx'
import { carsOf, drive, gravityOf, INPUTS, KIND, modelChoices, suspension, unmodelled, WEIGHTLESS, type Input } from './box3dvehicle.extension.tsx'
import { ride, type Fleet } from './box3dvehicle.sim.ts'

// A vehicle's `look.model.asset`: a `model` entry of the owner's scene's catalogue, else of the scene
// the panel works on.
export function ModelName({ value, onChange, owner, label }: FieldProps<string>) {
  const ed = useEditor(['game', 'selection'])
  const models = entriesOf(ed, owner.scene ?? ed.focus(KIND)?.scene, 'model')
  return <Select<string> label={label} value={value} options={modelChoices(value, models)} onChange={onChange} />
}

export function Vehicle() {
  const ed = useEditor(['game', 'selection'])
  const focus = ed.focus(KIND)
  const [picked, setPicked] = useState<number | undefined>(undefined)
  if (!ed.session) return <Empty>Open a game, and the cars of the scene selected are set here.</Empty>
  if (!focus) return <Empty>No scene of {ed.session.game.name} has a car.</Empty>
  const { scene, truth, worldFile, world } = focus
  const cars = carsOf(truth)
  const car = cars.find(r => r.id === picked) ?? cars[0]
  const fleet = truth.world[KIND] as Fleet | undefined
  const name: string | undefined = car?.data.vehicle ?? (fleet && Object.keys(fleet.vehicles)[0])
  const design = fleet && name !== undefined ? fleet.vehicles[name] : undefined
  const set = (field: Input) => (v: number, done: boolean) =>
    done ? drive(ed, scene, car!.id, { [field]: v }) : ed.session!.preview(scene, car!.id, [field], v)
  const wheels = design && car && suspension(design, car)
  const g = gravityOf(truth)
  return (
    <PanelBody bar={<Toolbar label="vehicle"><Badge tone="dim">{scene}</Badge><span className="ui-spacer" /><Badge>{cars.length} cars</Badge></Toolbar>}>
      <Section title="Driving">
        {car ? (
          <>
            <LabelledRow label="car">
              <Select<number> label="car" value={car.id} options={cars.map(r => ({ value: r.id, label: `car ${r.id} · ${r.data.vehicle}` }))} onChange={v => setPicked(v)} />
            </LabelledRow>
            {(Object.entries(INPUTS) as [Input, number][]).map(([field, min]) => (
              <LabelledRow key={field} label={field}>
                <Slider label={`car ${field}`} min={min} max={1} step={0.01} value={car.data[field] ?? 0} onChange={set(field)} />
              </LabelledRow>
            ))}
            <Note>These set the car as it runs, from the step shown on; the scene file keeps its own.</Note>
          </>
        ) : <Note>No car has been made in {scene} yet.</Note>}
      </Section>
      {design && (
        <Section title="Suspension">
          {wheels ? wheels.map(w => (
            <LabelledRow key={w.wheel} label={w.wheel} extra={<Badge tone={w.grounded ? 'accent' : 'dim'}>{w.grounded ? 'ground' : 'air'}</Badge>}>
              <Meter
                label={`${w.wheel} compression`}
                value={w.compression} min={0} max={w.travel} mark={w.sag}
                text={`${w.compression.toFixed(3)} m · ${Math.round(w.load)} N`}
              />
            </LabelledRow>
          )) : <Note>The car reports its suspension once it has stepped.</Note>}
          <Note>Each bar is how far the spring is pushed in, from full droop to the end of its travel; the tick is where it rests.</Note>
        </Section>
      )}
      {design && (
        <Section title={`Ride · ${name}`}>
          {g === undefined ? <Note>{WEIGHTLESS}.</Note> : ride(design, g).map((r, i) => (
            <LabelledRow key={i} label={`axle ${i}`}>
              <span aria-label={`axle ${i} ride`}>
                {`${r.hz.toFixed(2)} Hz · bump ${r.bump.toFixed(2)} · rebound ${r.rebound.toFixed(2)} · ${Math.round(r.load)} N a wheel · ${r.clearance.toFixed(2)} m under`}
              </span>
            </LabelledRow>
          ))}
          <Note>What each axle's numbers make of the picked car's vehicle standing still: how often it bounces there, how near each damper comes to stopping the bounce at once (1), each wheel's share of the weight, and the gap under the body.</Note>
        </Section>
      )}
      <Section title="Vehicle">
        <PropertyGrid
          value={world}
          owner={{ kind: KIND, scene, data: world }}
          onChange={(at, v, done) => {
            if (!done) return ed.session!.previewWorld(scene, [KIND, ...at], v)
            try {
              const values = { [at.join('.')]: v }, edits = worldGridEdits(ed, KIND, worldFile, world, values)
              const refused = unmodelled(values, entriesOf(ed, scene, 'model'))
              if (refused) throw new Error(refused)
              void written(ed, edits).catch(() => {})
            } catch (e) {
              ed.error(`box3dvehicle: refused: ${(e as Error).message}`)
              // What the drag showed goes, and the scene's `world` is its file's again.
              ed.session!.previewWorld(scene, [KIND, ...at], at.reduce<unknown>((o, k) => (o as Record<string | number, unknown>)[k], world))
            }
          }}
        />
      </Section>
    </PanelBody>
  )
}
