// skydome3d's extension: the Sky panel, and the types of the sky's fields.
//
// The panel (`skydome3d.components.tsx`) works on the sky of the scene `ed.focus` says: the one
// selected, else the one the game view shows, else the first scene with a skydome3d row. It has two
// halves:
//   - the sky as it runs: the hour, the clock's rate, the day of the year, the latitude, the moon's
//     phase and a button for each weather of the table with the fade it goes over. Each is the
//     sky's own act (`skydome3d.sim.ts`), run on a copy of the live row, and the fields it changed
//     are set on the row through the recorder, from the step shown on, as one undo, so every step
//     can be built again; a value being dragged shows on the row until it is let go;
//   - the sky as it is written: the look, precip and shadow of `world.skydome3d` in the file that
//     holds it (`focus`'s `worldFile`), and the weathers table in its data file, each change written
//     a value at a time as one undo, when it is let go. A weather is not taken out while the sky of
//     any scene whose `world.skydome3d` and catalogue name the table goes to it, in its prefab, on
//     its live row, or in a `to` the recording sets, since each would throw where it read the table:
//     its remove button is off then, saying who goes to it; and a weather is added with the numbers
//     the sky stands at.
//
// What the panel's controls do is done by functions here, which they and the commands call alike:
// an act run on the live row by `skyAct`, held to what each act takes (`ACTS`) and a weather to the
// table's; a weather set, added or taken out by `weatherEdits`, which `goingTo` guards; and a value
// of the look, precip or shadow written as the editor's `worldGridEdits` holds a grid's fields
// (`lookEdits`).
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here, on
// any scene with a sky, whatever the game view shows, since all of it is the rows and the files:
//   sky.act      one of the sky's acts run on its live row from this step on, as the Now section's
//                controls run them: `time`, `rate`, `place`, `moon` or `weather`;
//   sky.weather  a weather of the table set, added with the numbers the sky stands at and any the
//                call gives, or taken out, which is refused while a sky goes to it;
//   sky.look     values of the look, precip and shadow of `world.skydome3d` written, each a field
//                the grid shows, of the shape of the one there.
// Each write is one undo, answering the state it left.
//
// The types, wherever a skydome3d field is shown: `t` is an hour of the day on a slider, from 0 to 24,
// kept in seconds of the scene's `world.skydome3d.day`; `doy` a day of the year from 1 to 365; `lat` a latitude from −90
// to 90; `phase` the moon's phase from 0 to 1; `to` a weather of the table `world.skydome3d` names; `windDeg`
// a bearing; and the look's and precip's colours colours.
import { z } from 'zod'
import { reading, worldGridEdits, written, type Edits, type Editor, type FileEdit } from '#editor/editor.ts'
import type { Row, Truth } from '#engine/engine.ts'
import { DayOfYear, Hour, Latitude, Phase, Sky, WeatherName } from './skydome3d.components.tsx'
import { fields, skydome3d as kind, type Weather } from './skydome3d.sim.ts'

export const KIND = 'skydome3d'
const COLOURS = ['dayZenith', 'dayHorizon', 'nightZenith', 'nightHorizon', 'setZenith', 'setHorizon', 'sunHigh', 'sunLow', 'moon', 'ground']
type Asset = { type: string; url: string }

// What each act takes, as the Now section's controls hand it: `time` an hour of the day, `rate` the
// clock's rate, `place` a latitude and a day of the year, `moon` a phase, and `weather` a weather's
// name and the seconds it fades in over, the fade the row stands at when left out.
export const ACTS = {
  time: z.tuple([z.number().min(0).max(24)]),
  rate: z.tuple([z.number()]),
  place: z.tuple([z.number().min(-90).max(90), z.number().int().min(1).max(365)]),
  moon: z.tuple([z.number().min(0).max(1)]),
  weather: z.tuple([z.string(), z.number().min(0).optional()]),
}
export type Act = keyof typeof ACTS

// The weather numbers that are shares of the whole, from 0 to 1: sliders. The rest are numbers kept
// at 0 or above.
export const SHARES = new Set<string>(['cloud', 'cirrus', 'rain', 'snow', 'fog', 'gust', 'dust'])
const WEATHER = z.strictObject(Object.fromEntries(fields.map(f => [f, SHARES.has(f) ? z.number().min(0).max(1) : z.number().min(0)])))
const brief = (v: number) => +v.toFixed(3)

// The sky row of scene `scene`, with its truth; a scene with none is refused, naming those with one.
export function skyOf(ed: Editor, scene: string): { truth: Truth; row: Row } {
  const truth = ed.sceneOf(scene, KIND)
  return { truth, row: truth.rows.find(r => r.kind === KIND)! }
}

// Act `act` of the sky of `scene` run on a copy of its live row, and each field it changed set on
// the row from this step on, an edit of `e`, with the fields `shown` set whatever they were, since a
// drag has shown its value on the row already. `names` are the weathers of the table, which a
// weather act is held to. What the act does not take, or throws at, is refused and set nowhere.
// Answers the fields set.
export function skyAct(e: Pick<Edits, 'editRow'>, ed: Editor, scene: string, act: Act, args: unknown[], names: string[], shown: string[] = []): string[] {
  const { truth, row } = skyOf(ed, scene)
  const got = ACTS[act].safeParse(args)
  if (!got.success) throw new Error(`skydome3d ${act} takes ${JSON.stringify(args)} as no act does: ${z.prettifyError(got.error)}`)
  const a: unknown[] = [...got.data]
  if (act === 'weather') {
    if (!names.includes(a[0] as string)) throw new Error(`skydome3d has no weather ${a[0]}: its weathers are ${names.join(', ')}`)
    a[1] ??= row.data.fade
  }
  const copy = { ...row, data: structuredClone(row.data) }
  kind.acts![act](copy, reading(truth, 'the sky panel'), -1, ...a)
  const set = Object.keys(copy.data).filter(k => shown.includes(k) || JSON.stringify(copy.data[k]) !== JSON.stringify(row.data[k]))
  for (const k of set) e.editRow(scene, row.id, [k], copy.data[k])
  return set
}

// The weathers file the sky of `scene` reads, by its path from the repo: the json entry of its
// catalogue its `world.skydome3d.weathers` names, else undefined.
export function tableOf(truth: Truth): string | undefined {
  const asset = (truth.world.loader?.assets as Record<string, Asset> | undefined)?.[String((truth.world[KIND] as { weathers?: unknown } | undefined)?.weathers)]
  return asset?.type === 'json' ? asset.url.replace(/^\//, '') : undefined
}

// Who goes to the weather `name` of the table at `table`, which would throw where it reads a table
// without it: the sky's prefab of any scene whose `world.skydome3d` and catalogue name this table, the
// live sky of that scene, or a `to` the recording sets on it at a step. Undefined when nobody does.
export function goingTo(ed: Editor, table: string, name: string): string | undefined {
  const s = ed.need()
  for (const other of ed.scenesWith()) {
    const truth = ed.sceneOf(other)
    const its = truth.scene.prefabs[KIND] as { to: string } | undefined
    if (!its || tableOf(truth) !== table) continue
    if (its.to === name) return `the sky of ${other} goes to ${name}`
    if (truth.rows.some(r => r.kind === KIND && r.data.to === name)) return `the sky of ${other} goes to ${name} at the step shown`
    const set = s.rec.journal.find(e => 'set' in e && e.set.scene === other && e.set.path.join('.') === 'to' && e.set.value === name && s.row(other, e.set.id)?.kind === KIND)
    if (set) return `the recording sets the sky of ${other} to ${name} at step ${set.at}`
  }
  return undefined
}

// The edits of the weathers file at `table`, whose weathers are `weathers`, that set the numbers
// `weather` gives of the weather `name`; that add it, with the numbers the sky stands at (`standing`)
// under any it gives, when the table has none of that name; or, for null, take it out, which is
// refused while a sky goes to it (`goingTo`). A share is from 0 to 1 and every other number 0 or
// above; a weather has the thirteen numbers and no other.
export function weatherEdits(ed: Editor, table: string, weathers: Record<string, Weather>, name: string, weather: Partial<Record<string, number>> | null, standing: Weather): (FileEdit & { file: string })[] {
  const has = Object.hasOwn(weathers, name)
  if (weather === null) {
    if (!has) throw new Error(`${table} has no weather ${name}: its weathers are ${Object.keys(weathers).join(', ')}`)
    const who = goingTo(ed, table, name)
    if (who) throw new Error(`${who}, so it stays`)
    return [{ file: table, at: [name], value: undefined }]
  }
  const got = WEATHER.partial().safeParse(weather)
  if (!got.success) throw new Error(`weather ${name}: ${z.prettifyError(got.error)}`)
  const given = got.data as Partial<Weather>
  if (has) return Object.entries(given).filter(([f, v]) => v !== weathers[name][f as keyof Weather]).map(([f, v]) => ({ file: table, at: [name, f], value: v }))
  if (!name) throw new Error('a weather needs a name')
  return [{ file: table, at: [name], value: { ...Object.fromEntries(fields.map(f => [f, brief(standing[f])])), ...given } }]
}

// The edits of the file at `file`, whose `world.skydome3d` is `world`, that write `values` of its look,
// precip and shadow, each a field the grid shows.
export function lookEdits(ed: Editor, file: string, world: Record<string, unknown>, values: Record<string, unknown>) {
  return worldGridEdits(ed, KIND, file, Object.fromEntries(['look', 'precip', 'shadow'].filter(k => k in world).map(k => [k, world[k]])), values)
}

export function skydome3d(ed: Editor) {
  ed.panel({ id: 'skydome3d', title: 'Sky', area: 'right', component: Sky })
  ed.field('skydome3d.hour', Hour)
  ed.field('skydome3d.doy', DayOfYear)
  ed.field('skydome3d.lat', Latitude)
  ed.field('skydome3d.phase', Phase)
  ed.field('skydome3d.weather', WeatherName)
  ed.bind('skydome3d', {
    t: 'skydome3d.hour', doy: 'skydome3d.doy', lat: 'skydome3d.lat', phase: 'skydome3d.phase', to: 'skydome3d.weather', windDeg: 'bearing',
    ...Object.fromEntries(COLOURS.map(c => [`look.${c}`, 'color'])), 'precip.dustColour': 'color',
  })

  const scene = z.string().describe('a scene with a sky')
  // The weathers file of `scene`'s sky, read and parsed; one its world names that is no json entry
  // of its catalogue is refused.
  const weathersOf = async (scene: string) => {
    const { truth } = skyOf(ed, scene)
    const table = tableOf(truth)
    if (!table) throw new Error(`skydome3d of ${scene} names ${String((truth.world[KIND] as { weathers?: unknown }).weathers)}, which is no json entry of the loader`)
    return { table, weathers: JSON.parse(await ed.text(table)) as Record<string, Weather> }
  }
  // The sky of `scene` as sky.act answers it.
  const now = (scene: string) => {
    const { truth, row } = skyOf(ed, scene)
    const d = row.data, day = (truth.world[KIND] as { day: number }).day
    return { scene, id: row.id, hour: (d.t / day) * 24, t: d.t, rate: d.rate, doy: d.doy, lat: d.lat, phase: d.phase, to: d.to, blend: d.blend, fade: d.fade, mix: d.mix }
  }

  ed.command({
    id: 'sky.act',
    title: 'Sky: act',
    input: z.object({
      scene,
      act: z.enum(Object.keys(ACTS) as [Act, ...Act[]]).describe('the act'),
      args: z.array(z.union([z.number(), z.string()])).describe('time: [hour 0–24]; rate: [times real time]; place: [latitude −90–90, day of year 1–365]; moon: [phase 0–1]; weather: [name, fade seconds, the row\'s when left out]'),
    }).describe('Runs one of the sky\'s acts on its live row from this step on, as the Sky panel\'s Now section does: the fields it changes set through the recorder, one undo. Answers the sky as it stands.'),
    run: async ({ scene, act, args }, e) => {
      const names = act === 'weather' ? Object.keys((await weathersOf(scene)).weathers) : []
      const set = skyAct(e, ed, scene, act, args, names)
      return { ...now(scene), set }
    },
  })
  ed.command({
    id: 'sky.weather',
    title: 'Sky: weather',
    input: z.object({
      scene,
      name: z.string().describe('the weather; one the table has not got is added'),
      weather: z.partialRecord(z.enum(fields), z.number()).nullable().describe(`its numbers to set, of ${fields.join(', ')}: the shares ${[...SHARES].join(', ')} from 0 to 1, the rest 0 or above; a weather added takes the rest from the sky as it stands; null takes it out`),
    }).describe('Sets numbers of a weather of the sky\'s weathers table, adds one, or takes one out, as the Sky panel\'s Weathers section does: one undo, a weather a sky goes to never taken out. Answers the weather and the table\'s weathers.'),
    run: async ({ scene, name, weather }, e) => {
      const { table, weathers } = await weathersOf(scene)
      await written(e, weatherEdits(ed, table, weathers, name, weather, skyOf(ed, scene).row.data.mix as Weather))
      const after = JSON.parse(await ed.text(table)) as Record<string, Weather>
      return { file: table, ...(weather === null ? { removed: name } : { name, weather: after[name] }), weathers: Object.keys(after) }
    },
  })
  ed.command({
    id: 'sky.look',
    title: 'Sky: look',
    input: z.object({
      scene,
      values: z.record(z.string(), z.union([z.number(), z.boolean(), z.string(), z.array(z.number())])).describe('values by their paths in world.skydome3d joined by dots, under look, precip or shadow, as "look.exposure" or "precip.dustColour": numbers, booleans, strings, colours #rrggbb, or lists of as many numbers'),
    }).describe('Writes values of the look, precip and shadow of a scene\'s world.skydome3d, as the Sky panel\'s grids do: one undo, each refused unless it is a field the grid shows and of the shape of the one there. Answers the three.'),
    run: async ({ scene, values }, e) => {
      skyOf(ed, scene)
      const { file, value } = ed.worldOf(scene, KIND)
      await written(e, lookEdits(ed, file, value, values))
      const w = ed.worldOf(scene, KIND).value
      return { scene, file, look: w.look, precip: w.precip, shadow: w.shadow }
    },
  })
}
