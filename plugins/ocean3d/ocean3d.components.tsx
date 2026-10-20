// The components of ocean3d's extension (ocean3d.extension.tsx): the Sea panel and the fields of the
// sea's types.
import { useEffect, useMemo, useState } from 'react'
import { useEditor } from '#editor/context.ts'
import { turn, written, type FieldProps, type Focus } from '#editor/editor.ts'
import { Chart } from '#editor/ui/chart.tsx'
import { NumberField, Slider, TextField } from '#editor/ui/fields.tsx'
import { Field } from '#editor/ui/grid.tsx'
import { Badge, Empty, LabelledRow, Note, PanelBody, Section, Toolbar } from '#editor/ui/layout.tsx'
import { energy, KIND, patchesRefusal, profile, RANGES, seaEdits, seaRefusal, SHOWN } from './ocean3d.extension.tsx'
import { inputs, keyed, type Sea as SeaRow } from './ocean3d.sim.ts'

// How often the height chart is drawn, in milliseconds.
const EVERY = 250

// ---------------------------------------------------------------- the types

// A bounded number of the sea, by its key: a slider over its range.
export function Ranged({ value, onChange, at, label }: FieldProps<number>) {
  const [min, max, step] = RANGES[String(at[at.length - 1])] ?? [0, 1, 0.01]
  return <Slider label={label} min={min} max={max} step={step} value={value} onChange={onChange} />
}
export function Seed({ value, onChange, label }: FieldProps<number>) {
  return <NumberField label={label} integer value={value} onChange={(v, done) => onChange(Math.min(99999, Math.max(0, v)), done)} />
}
// Each cascade's tile in metres, largest first, typed as a list. A list the cascades cannot be made
// from is refused, said here and in the console, and handed on nowhere.
export function Patches({ value, onChange, label }: FieldProps<number[]>) {
  const ed = useEditor([])
  const [refused, setRefused] = useState<string | undefined>(undefined)
  const take = (text: string) => {
    const patches = text.split(/[\s,]+/).filter(Boolean).map(Number)
    const why = patchesRefusal(patches, text)
    setRefused(why)
    if (why) return ed.error(`refused: ${why}`)
    onChange(patches, true)
  }
  return (
    <div>
      <TextField label={label} value={value.join(', ')} onChange={(t, done) => done && take(t)} />
      {refused && <Note>Refused: {refused}</Note>}
    </div>
  )
}

// ---------------------------------------------------------------- the panel

export function Sea() {
  const ed = useEditor(['game', 'selection'])
  const sea = ed.focus(KIND)
  const [refused, setRefused] = useState<string | undefined>(undefined)
  if (!ed.session) return <Empty>Open a game, and the sea of the scene selected is set here.</Empty>
  if (!sea?.row) return <Empty>No scene of {ed.session.game.name} has an ocean3d row.</Empty>
  const { scene, worldFile: path } = sea
  const numbers = sea.world as SeaRow
  const remakes = new Set<string>(keyed)
  return (
    <PanelBody bar={<Toolbar label="sea"><Badge tone="dim">{scene}</Badge></Toolbar>}>
      {refused && <Note>Refused: {refused}</Note>}
      <Section title="Numbers">
        {SHOWN.map(k => (
          <LabelledRow key={k} label={k} title={`${k} ${remakes.has(k) ? 'makes the spectrum again' : 'is read as it stands'}`} extra={<Badge tone={remakes.has(k) ? 'accent' : 'dim'}>{remakes.has(k) ? 'remakes' : 'live'}</Badge>}>
            <Field
              label={`sea ${k}`}
              value={(numbers as Record<string, unknown>)[k]}
              at={[k]}
              owner={{ kind: KIND, scene, data: numbers as Record<string, unknown> }}
              onChange={(v, done) => {
                if (!done) {
                  if (seaRefusal(k, v) === undefined) ed.session!.previewWorld(scene, [KIND, k], v)
                  return
                }
                try {
                  const edits = seaEdits(path, k, v)
                  setRefused(undefined)
                  void written(ed, edits).catch(() => {})
                } catch (e) {
                  const why = (e as Error).message
                  setRefused(why)
                  ed.error(`refused: ${why}`)
                  // What the drag showed goes, and the scene's `world` is its file's again.
                  ed.session!.previewWorld(scene, [KIND, k], (numbers as Record<string, unknown>)[k])
                }
              }}
            />
          </LabelledRow>
        ))}
        <Note>
          A change of {keyed.join(', ')} makes the sea's spectrum again: a moment's work, on the server and in every
          page. The rest, {SHOWN.filter(k => !remakes.has(k)).join(', ')}, are read as they stand, and the sea
          follows them at once.
        </Note>
      </Section>
      <Section title="Height"><Height sea={sea} /></Section>
      <Section title="Energy"><Energy sea={numbers} /></Section>
    </PanelBody>
  )
}

// The drawn surface's height along 200 m through the camera, the way it looks, a few times a second.
function Height({ sea }: { sea: Focus }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setTick(k => k + 1), EVERY)
    return () => clearInterval(i)
  }, [])
  const { truth, plugins: client } = sea
  const t = sea.row!.data.t as number
  const points = useMemo(() => {
    try {
      return profile(truth, client).points
    } catch (e) {
      return (e as Error).message
    }
    // `tick` and `t` redraw it as the sea and the camera move.
  }, [truth, client, t, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  if (typeof points === 'string') return <Note>No heights: {points}</Note>
  return <Chart label="wave height through the camera" series={[{ label: 'height', points }]} x={{ label: 'metres along the view' }} y={{ label: 'height (m)' }} />
}

// The energy of the spectrum's cells against their wavelength, worked out a cascade at a time, the
// page let go for a turn before each (the editor's `turn`), each cascade's band shaded.
function Energy({ sea }: { sea: SeaRow }) {
  const key = inputs(sea).join(',')
  const [out, setOut] = useState<{ key: string; points: [number, number][]; bands: { from: number; to: number; label: string }[] } | { error: string } | undefined>(undefined)
  useEffect(() => {
    let live = true
    const pause = async () => {
      await turn()
      return live
    }
    energy(sea, pause).then(got => { if (got && live) setOut({ key, ...got }) }, (e: Error) => { if (live) setOut({ error: e.message }) })
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!out) return <Note>Working out the spectrum…</Note>
  if ('error' in out) return <Note>No spectrum: {out.error}</Note>
  return (
    <>
      <Chart label="energy against wavelength" area series={[{ label: 'energy', points: out.points }]} bands={out.bands} x={{ label: 'wavelength (m)', log: true }} y={{ label: 'energy (m²)' }} />
      {out.key !== key && <Note>Working out the new spectrum…</Note>}
    </>
  )
}
