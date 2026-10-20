// The components of skydome3d's extension (skydome3d.extension.tsx): the Sky panel, and the fields
// of the sky's types. The panel's runtime half sets the live row through the recorder, a field at a
// time, as the sky's own acts would set it; its written half writes the scene file's
// `world.skydome3d` and the weathers file a value at a time.
import { useState } from 'react'
import { useEditor, useText } from '#editor/context.ts'
import { written, type Editor, type FieldProps, type FileEdit } from '#editor/editor.ts'
import { NumberField, Select, Slider, TextField } from '#editor/ui/fields.tsx'
import { PropertyGrid } from '#editor/ui/grid.tsx'
import { Badge, Button, Empty, LabelledRow, Note, PanelBody, Row, Section, Toolbar } from '#editor/ui/layout.tsx'
import { goingTo, KIND, lookEdits, SHARES, skyAct, tableOf, weatherEdits, type Act } from './skydome3d.extension.tsx'
import { fields, type Weather } from './skydome3d.sim.ts'

type Asset = { type: string; url: string }
// The `world.skydome3d` a scene booted with, or none.
const fixed = (ed: Editor, scene: string | undefined) =>
  (scene === undefined ? undefined : ed.session?.scenes().get(scene)?.world[KIND]) as Record<string, unknown> | undefined

// ---------------------------------------------------------------- the types

// `t`, seconds into the `day` of its scene's `world.skydome3d`, as an hour of the day.
export function Hour({ value, onChange, owner, label }: FieldProps<number>) {
  const ed = useEditor(['game'])
  const day = fixed(ed, owner.scene)!.day as number
  return <Slider label={label} min={0} max={24} step={0.01} value={+((value / day) * 24).toFixed(4)} onChange={(h, done) => onChange((h / 24) * day, done)} />
}
export function DayOfYear({ value, onChange, label }: FieldProps<number>) {
  return <Slider label={label} min={1} max={365} integer value={value} onChange={onChange} />
}
export function Latitude({ value, onChange, label }: FieldProps<number>) {
  return <Slider label={label} min={-90} max={90} step={0.1} value={value} onChange={onChange} />
}
export function Phase({ value, onChange, label }: FieldProps<number>) {
  return <Slider label={label} min={0} max={1} step={0.001} value={value} onChange={onChange} />
}
// A weather of the table its scene's `world.skydome3d.weathers` names, off the scene's catalogue.
export function WeatherName({ value, onChange, owner, label }: FieldProps<string>) {
  const ed = useEditor(['game'])
  const assets = owner.scene ? ed.session?.scenes().get(owner.scene)?.world.loader?.assets : undefined
  const asset = (assets as Record<string, Asset> | undefined)?.[String(fixed(ed, owner.scene)?.weathers)]
  const text = useText(asset?.type === 'json' ? asset.url.replace(/^\//, '') : undefined)
  const names = text === undefined ? undefined : Object.keys(JSON.parse(text) as object)
  if (!names) return <TextField label={label} value={value} onChange={(v, done) => done && onChange(v, true)} />
  return <Select<string> label={label} value={value} options={[...new Set([value, ...names])].map(n => ({ value: n }))} onChange={onChange} />
}

// ---------------------------------------------------------------- the panel

export function Sky() {
  const ed = useEditor(['game', 'selection'])
  const sky = ed.focus(KIND)
  const [fade, setFade] = useState<number | undefined>(undefined)
  const [refused, setRefused] = useState<string | undefined>(undefined)
  const table = sky && tableOf(sky.truth)
  const text = useText(table)
  if (!ed.session) return <Empty>Open a game, and the sky of the scene selected is set here.</Empty>
  if (!sky?.row) return <Empty>No scene of {ed.session.game.name} has a skydome3d row.</Empty>
  const { scene, worldFile: path, world } = sky
  const row = sky.row
  const d = row.data
  const owner = { kind: KIND, scene, row: row.id, data: d }
  const weathers = text === undefined ? {} : (JSON.parse(text) as Record<string, Weather>)

  // The sky's act run on a copy of its row, and each field it changed set on the live row, with the
  // fields `shown` set whatever they were, since a drag has shown its value on the row already.
  // All of it is one undo.
  const act = (name: Act, args: unknown[], shown: string[] = []) => {
    try {
      ed.together(one => skyAct(one, ed, scene, name, args, Object.keys(weathers), shown))
    } catch (e) {
      refuse((e as Error).message)
    }
  }
  // A live value shown on the row while it is dragged, and the act run when it is let go or typed.
  const live = (field: string, done: (v: number) => void) => (v: number, end: boolean) => (end ? done(v) : ed.session!.preview(scene, row.id, [field], v))
  const refuse = (why: string) => {
    setRefused(why)
    ed.error(`skydome3d: refused: ${why}`)
  }
  // The edits `make` answers written as one undo, or, where it refuses, its refusal said, nothing
  // written, and `back` run.
  const write = (make: () => (FileEdit & { file: string })[], back?: () => void) => {
    let edits
    try {
      edits = make()
    } catch (e) {
      back?.()
      return refuse((e as Error).message)
    }
    setRefused(undefined)
    void written(ed, edits).catch(() => {})
  }
  // A value of the look, precip or shadow is shown on the scene's `world` while it is dragged, and
  // written when it is let go; one refused goes from the scene's `world`, which is its file's again.
  const grid = (key: string) => (
    <PropertyGrid
      value={world[key] as Record<string, unknown>}
      at={[key]}
      owner={{ kind: KIND, scene, data: world }}
      onChange={(at, v, done) => (done
        ? write(() => lookEdits(ed, path, world, { [at.join('.')]: v }), () => ed.session!.previewWorld(scene, [KIND, ...at], at.reduce<unknown>((o, k) => (o as Record<string | number, unknown>)[k], world)))
        : ed.session!.previewWorld(scene, [KIND, ...at], v))}
    />
  )

  return (
    <PanelBody bar={<Toolbar label="sky"><Badge tone="dim">{scene}</Badge><span className="ui-spacer" /><Badge>{d.to}{d.blend < 1 ? ` ${Math.round(d.blend * 100)}%` : ''}</Badge></Toolbar>}>
      {refused && <Note>Refused: {refused}</Note>}
      <Section title="Now">
        <LabelledRow label="hour"><Hour label="sky hour" value={d.t} at={['t']} owner={owner} onChange={live('t', t => act('time', [(t / Number(world.day)) * 24], ['t']))} /></LabelledRow>
        <LabelledRow label="rate"><NumberField label="sky rate" value={d.rate} onChange={live('rate', v => act('rate', [v], ['rate']))} /></LabelledRow>
        <LabelledRow label="day"><DayOfYear label="sky day of year" value={d.doy} at={['doy']} owner={owner} onChange={live('doy', v => act('place', [d.lat, v], ['doy']))} /></LabelledRow>
        <LabelledRow label="latitude"><Latitude label="sky latitude" value={d.lat} at={['lat']} owner={owner} onChange={live('lat', v => act('place', [v, d.doy], ['lat']))} /></LabelledRow>
        <LabelledRow label="moon"><Phase label="sky moon phase" value={d.phase} at={['phase']} owner={owner} onChange={live('phase', v => act('moon', [v], ['phase']))} /></LabelledRow>
        <LabelledRow label="fade"><NumberField label="weather fade" value={fade ?? d.fade} onChange={(v, done) => done && setFade(Math.max(0, v))} /></LabelledRow>
        <Toolbar label="weathers">
          {Object.keys(weathers).map(n => <Button key={n} title={`weather ${n}`} pressed={d.to === n} onClick={() => act('weather', [n, fade ?? d.fade])}>{n}</Button>)}
        </Toolbar>
        <Note>These set the sky as it runs, from the step shown on; the scene file keeps its own.</Note>
      </Section>
      <Section title="Look" open={false}>{grid('look')}</Section>
      <Section title="Precip" open={false}>{grid('precip')}</Section>
      <Section title="Shadow" open={false}>{grid('shadow')}</Section>
      <Section title="Weathers" extra={<Badge>{Object.keys(weathers).length}</Badge>} open={false}>
        {table === undefined
          ? <Note>skydome3d names {String(world.weathers)}, which is no json entry of the loader.</Note>
          : <WeatherTable weathers={weathers} going={n => goingTo(ed, table, n)} set={(n, w) => write(() => weatherEdits(ed, table, weathers, n, w, d.mix as Weather))} />}
      </Section>
    </PanelBody>
  )
}

function WeatherTable({ weathers, going, set }: {
  weathers: Record<string, Weather>
  going(name: string): string | undefined
  // A weather's numbers set, or it added, or, for null, taken out.
  set(name: string, weather: Partial<Weather> | null): void
}) {
  const [name, setName] = useState('')
  return (
    <>
      {Object.entries(weathers).map(([n, w]) => {
        const who = going(n)
        return (
          <Section key={n} title={n} open={false} extra={
            <Button title={who ? `remove weather ${n}: ${who}, so it stays` : `remove weather ${n}`} disabled={!!who} onClick={() => set(n, null)}>✕</Button>
          }>
            {fields.map(f => (
              <LabelledRow key={f} label={f}>
                {SHARES.has(f)
                  ? <Slider label={`${n} ${f}`} min={0} max={1} step={0.01} value={w[f]} onChange={(v, done) => done && set(n, { [f]: v })} />
                  : <NumberField label={`${n} ${f}`} value={w[f]} onChange={(v, done) => done && set(n, { [f]: Math.max(0, v) })} />}
              </LabelledRow>
            ))}
          </Section>
        )
      })}
      <LabelledRow label="new" extra={
        <Button
          title="add a weather as the sky stands"
          disabled={!name || name in weathers}
          onClick={() => {
            set(name, {})
            setName('')
          }}
        >Add</Button>
      }>
        <TextField label="new weather name" value={name} onChange={setName} />
      </LabelledRow>
      <Row><Note>A weather added holds the numbers the sky stands at now.</Note></Row>
    </>
  )
}
