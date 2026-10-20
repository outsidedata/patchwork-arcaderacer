// The simulator's extension, on whatever game is open (`always`): the Runs panel (`simulator.components.tsx`), on the recordings in
// `addons/simulator/runs/`, each a run the simulator wrote as JSONL: one played here, one a browser's
// tap recorded, or one the command line was told to write there.
//   - the recording picked, the newest unless another is: its summary, a row a page (steps a frame
//     from its first packet, envelopes a frame, standoff jitter), a page picked by its row;
//   - a timeline of it in milliseconds: the server's steps, and each page's frames, the frames that
//     moved the step drawn by other than one after its first packet, the envelopes it took and its
//     presses, each a mark at its time; the playhead picks a time;
//   - each page's steps a frame and standoff over time, a chart each;
//   - the frame of the page picked at the time picked: its record, the envelopes it took, when each
//     was sent and arrived, and the rows it drew, its own marked;
//   - Run: a config, as the command line takes one, the open game's with two pages to start from,
//     played on node through the simulator's `run` route when Play is pressed, and kept as the
//     recording named: a plain request (`routeOf`), outside any change, since a recording is no
//     change of the game's, and no undo takes it back. A name or a config that is not one a run
//     takes (`CONFIG`, its `game` the manager scene file of the editor's game) leaves Play off,
//     saying why. Reload lists the recordings again, as a tap adds them.
//
// What the panel reads and plays is done by functions here, which it and the commands call alike:
// the recordings listed by `recordings`, a recording's timeline and charts made by `lanesOf` and
// `seriesOf`, the frame picked found by `frameAt`, and a config played by `play`, once `unplayable`
// has nothing to say of it.
//
// Its commands, for an LLM calling them (`editor/mcp.ts`):
//   sim.runs  the recordings' names, in order, as the panel lists them;
//   sim.read  a recording as the panel shows it: its summary, and for one page, the first unless one
//             is named, its lanes of the timeline, its charts, and its frame at a time, its first
//             frame unless a time is named;
//   sim.run   a config played and kept as a recording, as Play plays it, not undone. Answers the
//             report the command line printed and the recording's path.
import { z } from 'zod'
import { routeOf, type Editor } from '#editor/editor.ts'
import { NAME, parse, RUNS, standoff, summary, type FrameRecord, type PressRecord, type Record_, type Run, type StepRecord } from './simulator.addon.ts'
import { Runs } from './simulator.components.tsx'

// The recordings' names, in order, as the editor's files list them; none while the folder is not
// there.
export async function recordings(ed: Editor): Promise<string[]> {
  const all = await ed.files.list(RUNS).catch(() => [] as string[])
  return all.filter(f => f.endsWith('.jsonl') && !f.slice(RUNS.length + 1).includes('/')).map(f => f.slice(RUNS.length + 1, -'.jsonl'.length))
}

// What Run plays when nothing has been written into it yet: the open game, two pages under 100 ms
// each way, one on a 60 Hz display and one on a 120 Hz, for ten seconds.
export const starting = (game: string) => ({
  game, seed: 1, ms: 10000,
  pages: [
    { display: { hz: 60 }, up: { delay: 100, jitter: 10 }, down: { delay: 100, jitter: 10 } },
    { display: { hz: 120 }, up: { delay: 100, jitter: 10 }, down: { delay: 100, jitter: 10 } },
  ],
})

// A config as the command line plays one, each knob as `simulator.addon.ts` reads it: a fraction
// between 0 and 1, milliseconds from 0, a rate above 0.
const at0 = z.number().min(0)
const fraction = z.number().min(0).max(1)
const leg = z.strictObject({ delay: at0, jitter: at0.optional(), tail: z.boolean().optional(), loss: fraction.optional(), reorder: fraction.optional(), dup: fraction.optional(), burst: fraction.optional() })
const every = z.strictObject({ every: z.number().positive(), ms: at0 })
// A config's knobs as JSON carries them: a `Run`'s, with no function among them, and the manager
// scene file's path, `game`, for its file, its sim and its folder. `CONFIG` is held to it by a test
// of the two types (`simulator.extension.test.tsx`), so a knob the addon gains is a knob it reads.
type Fn = (...a: never[]) => unknown
type Plain<T> = T extends Fn ? never
  : T extends readonly unknown[] ? { [K in keyof T]: Plain<T[K]> }
  : T extends object ? { [K in keyof T as NonNullable<T[K]> extends Fn ? never : K]: Plain<T[K]> }
  : T
type Knobs = Plain<Pick<Run, 'seed' | 'ms' | 'pages' | 'server' | 'watch' | 'cost'>> & { game: string }
export type Config = { [K in keyof Knobs]: Knobs[K] }
export const CONFIG = z.strictObject({
  game: z.string(),
  seed: z.number().int(),
  ms: z.number().positive(),
  pages: z.array(z.strictObject({
    join: at0.optional(), open: at0.optional(),
    display: z.strictObject({ hz: z.number().positive(), at: z.array(at0).optional(), phase: z.number().optional(), wobble: at0.optional(), drop: fraction.optional(), long: every.optional(), hidden: z.array(z.tuple([at0, at0])).optional(), stall: at0.optional() }),
    clock: z.strictObject({ offset: z.number().optional(), ppm: z.number().optional() }).optional(),
    up: leg, down: leg,
    predict: z.boolean().optional(),
    presses: z.array(z.strictObject({ at: at0, act: z.tuple([z.string()]).rest(z.union([z.number(), z.string(), z.boolean(), z.null()])).optional(), key: z.string().optional(), up: z.boolean().optional() })).optional(),
  })).min(1),
  server: z.strictObject({ steps: z.array(at0).optional(), loop: z.enum(['owed', 'interval']).optional(), grain: at0.optional(), late: at0.optional(), pause: every.optional(), ppm: z.number().optional() }).optional(),
  watch: z.strictObject({ kinds: z.array(z.string()).optional(), fields: z.array(z.string()).optional(), own: z.union([z.string(), z.array(z.string())]).optional(), drawn: z.boolean().optional() }).optional(),
  cost: z.boolean().optional(),
})

// Why a run named `name` of `config` would not be played, or undefined: a name a recording cannot
// have, a config that is not one the command line reads, or a game that is not the editor's.
export function unplayable(ed: Editor, name: string, config: unknown): string | undefined {
  if (!NAME.test(name)) return `a recording is named with letters, digits, _, . and - only, not ${JSON.stringify(name)}`
  const got = CONFIG.safeParse(config)
  if (!got.success) return `the config is not one a run plays: ${z.prettifyError(got.error)}`
  const mine = ed.game?.path
  if (got.data.game !== mine) return `the config's game is ${got.data.game}, ${mine ? `not the editor's game's manager scene file, ${mine}` : 'and the editor has no game'}`
  return undefined
}

// How many runs each editor has played (`play`), which the Runs panel lists the recordings again by.
const played = new WeakMap<Editor, number>()
export const playedOn = (ed: Editor) => played.get(ed) ?? 0

// Plays `config` on node through the simulator's `run` route and keeps it as the recording `name`:
// a plain request, outside any change, which no undo takes back; refused as `unplayable` says, and
// as the route refuses. The recording it wrote is a change on the disk no change made, which the
// server tells every page of, this one too, which takes it in where it holds the recording's text
// (`Editor.disk`). It counts the run (`playedOn`) and tells `x.simulator`, so the Runs panel lists
// the recording whoever played it, the panel or sim.run. Answers the report the command line printed and the recording's
// path.
export async function play(ed: Editor, name: string, config: unknown): Promise<{ name: string; report: string; files: string[] }> {
  const why = unplayable(ed, name, config)
  if (why) throw new Error(why)
  const got = await routeOf<{ name: string; report: string; files: string[] }>('simulator', 'run', { name, config })
  played.set(ed, playedOn(ed) + 1)
  ed.changed('x.simulator')
  return { name: got.name, report: got.report, files: got.files }
}

// A recording's frames, and each frame of a page after its first packet's with how many steps it
// moved the step drawn.
const framesIn = (records: Record_[]) => records.filter((r): r is FrameRecord => r.type === 'frame')
const moved = (fs: FrameRecord[]) => fs.filter(f => f.n !== null).map((f, i, a) => ({ t: f.t, m: i ? f.n! - a[i - 1].n! : 0 })).slice(1)

// The timeline's lanes: the server's steps, and each page's frames, frames off a step after its
// first packet, envelopes and presses, each a list of times.
export function lanesOf(records: Record_[], pages: number[]): { id: string; label: string; marks: { at: number }[] }[] {
  const frames = framesIn(records)
  return [
    { id: 'server', label: 'server steps', marks: records.filter((r): r is StepRecord => r.type === 'step').map(r => ({ at: r.t })) },
    ...pages.flatMap(p => {
      const fs = frames.filter(f => f.page === p)
      return [
        { id: `frames-${p}`, label: `page ${p} frames`, marks: fs.map(f => ({ at: f.t })) },
        { id: `off-${p}`, label: `page ${p} off a step`, marks: moved(fs).filter(x => x.m !== 1).map(x => ({ at: x.t })) },
        { id: `took-${p}`, label: `page ${p} envelopes`, marks: fs.flatMap(f => f.took.map(k => ({ at: k.at }))).sort((a, b) => a.at - b.at) },
        { id: `press-${p}`, label: `page ${p} presses`, marks: records.filter((r): r is PressRecord => r.type === 'press' && r.page === p).map(r => ({ at: r.t })) },
      ]
    }),
  ]
}

// The charts: each page's steps a frame and standoff over time, as [ms, value] points.
export function seriesOf(records: Record_[], pages: number[]): Record<'steps' | 'standoff', { label: string; points: [number, number][] }[]> {
  const frames = framesIn(records)
  const per = (f: (p: number) => [number, number][]) => pages.map(p => ({ label: `page ${p}`, points: f(p) }))
  return {
    steps: per(p => moved(frames.filter(f => f.page === p)).map(x => [x.t, x.m])),
    standoff: per(p => standoff(records, p).frames.map(x => [x.t, x.d])),
  }
}

// The frame of page `page` at `at` ms: the last it drew at or before then, else its first.
export function frameAt(records: Record_[], page: number, at: number): FrameRecord | undefined {
  const mine = framesIn(records).filter(f => f.page === page)
  return [...mine].reverse().find(f => f.t <= at) ?? mine[0]
}

// On whatever game is open, and with none: the simulator plays any game over the transports every game
// travels on, and its recordings are every game's, so no scene names it.
export const always = true

export function simulator(ed: Editor) {
  ed.panel({ id: 'simulator', title: 'Runs', area: 'bottom', component: Runs })

  // A recording of the folder, refused naming them.
  const named = async (name: string) => {
    const all = await recordings(ed)
    if (!all.includes(name)) throw new Error(`no recording ${name}: the recordings are ${all.join(', ') || 'none'}`)
    return `${RUNS}/${name}.jsonl`
  }
  ed.command({
    id: 'sim.runs',
    title: 'Runs: recordings',
    input: z.object({}).describe('The recordings the Runs panel lists, in order: each a run played here, a browser\'s tap, or one the command line wrote.'),
    run: async () => ({ recordings: await recordings(ed) }),
  })
  ed.command({
    id: 'sim.read',
    title: 'Runs: read',
    input: z.object({
      name: z.string().describe('the recording'),
      page: z.number().int().min(0).optional().describe('the page whose lanes, charts and frame are read; the first when left out'),
      at: z.number().optional().describe('ms of the timeline: the frame the page drew last by then; its first when left out'),
    }).describe('A recording as the Runs panel shows it: its summary, and for one page its lanes of the timeline, its charts over time, and its frame at a time: its record, the envelopes it took and the rows it drew.'),
    run: async ({ name, page, at }) => {
      const text = await ed.text(await named(name))
      let records, s
      try {
        records = parse(text)
        s = summary(records)
      } catch (e) {
        throw new Error(`${name}: ${(e as Error).message}`)
      }
      const pages = s.pages.map(p => p.page)
      const p = page ?? pages[0]
      if (p === undefined) return { name, summary: s }
      if (!pages.includes(p)) throw new Error(`${name} has no page ${p}: its pages are ${pages.join(', ')}`)
      const lanes = lanesOf(records, [p]).map(l => ({ lane: l.label, at: l.marks.map(m => m.at) }))
      const series = Object.fromEntries(Object.entries(seriesOf(records, [p])).map(([k, v]) => [k, v[0].points]))
      return { name, summary: s, page: p, lanes, series, frame: frameAt(records, p, at ?? -Infinity) ?? null }
    },
  })
  ed.command({
    id: 'sim.run',
    title: 'Runs: run',
    input: z.object({
      name: z.string().describe('the recording it is kept as: letters, digits, _, . and -'),
      config: z.record(z.string(), z.unknown()).describe('as the command line takes one: { game (a manager scene file), seed, ms, pages [{ display {hz}, up {delay}, down {delay}, join?, presses? }], server?, watch? }'),
    }).describe('Plays a config on node, as the Runs panel\'s Play does, and keeps it as a recording, which is no change of the game\'s and is not undone. Answers the report the command line printed and the recording\'s path.'),
    run: ({ name, config }) => play(ed, name, config),
  })
}
