// scatter3d's extension: the Scatter panel.
//
// The panel (`scatter3d.components.tsx`) works on the scatter of the scene selected, else of the one
// the game view shows, else of the first scene with a `world.scatter3d`, one pack at a time. It writes
// each change into `world.scatter3d` in the scene file that gives it, a value at a time, as one undo, and refuses, writing
// nowhere, a change the server half's `check` throws at for a sentence the numbers did not throw
// before, saying it, and, while the game view shows the scene, one that has a model pack draw a row
// the model has no mesh for at one of its LODs, saying the sentence the browser half would throw
// (`unmeshed`), where the pack was not already so. A value it writes is of the shape the panel's
// field for it keeps (`PACK`), a model one of the scene's catalogue's, and a rule's `q` a key of the
// land record the ground under the view answers, or, while no ground of the scene is under it, one a
// rule of the scatter's file asks already. A pack is drawn from a model of the scene's catalogue or
// is a shape; turning a model pack into a shape gives it the shape
// { detail 1, lumpy [0.7, 0.3], squash 0.7 } in #808080, and turning it back takes the shape, its
// colour and its surface out, as one undo. Its rows carry a weight and, when solid, a radius; its
// rules are ramps over the keys of the ground's land record. Over the pack, a top-down preview of the
// pack's cells out to its reach around the camera's cell, each kept one a dot, placed by the server
// half's `place` on the game view's ground, a few rows at a time, the page let go for a turn between
// them (the editor's `turn`), again on each edit and whenever the camera crosses into another cell,
// which the panel looks at after each frame of the editor's clock, as it looks for the ground landing;
// a number being dragged, a rule's ends too, is shown in it before it is written, unless `check`
// throws at it.
//
// What the panel's fields and buttons and its preview do is done by functions here, which they and
// the commands call alike: a change refused as `refusal` says, then written as one by the editor's
// `written`; a model pack made a shape and back by `sourced`; and the preview's cells placed a row
// at a time by `placeRow` around the cell `cameraCell` says.
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), on the scatter of any scene that has one,
// whatever the game view shows but where said:
//   scatter.packs    a scene's scatter: the file that gives it, its own numbers, every pack with its
//                    numbers, the models a pack may be drawn from, and the keys a rule may ask, with
//                    where they come from;
//   scatter.pack     a pack set, added under a name it has not got, or taken out, each value that
//                    changes written by itself, one undo; refused as the panel refuses, the
//                    `unmeshed` sentence too while the game view shows the scene with a client, a
//                    frame drawn first where it has mounted none, whether or not the editor's clock
//                    has drawn one; a view held
//                    still, or one whose ground has not landed, writes from the files as the panel
//                    then does;
//   scatter.preview  what the preview shows: every kept cell of a pack out to its reach, or less,
//                    around the camera's cell, as a world point [x, z], a square of at most 255
//                    cells a side. It stands on the land of the game view's client that the scene's
//                    `world.scatter3d.mods.land` names, so the view must show the scene, and a scene
//                    that names none is refused; a frame is drawn first where none has mounted it,
//                    and more while its land has not landed.
// Each write is one undo, answering the pack it left.
import { z } from 'zod'
import { changedIssue, changes, edited, outlined, OUTLINE, turn, written, type Editor, type FileEdit } from '#editor/editor.ts'
import type { Plugins } from '#engine/browser.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { unmeshed } from './scatter3d.plugin.ts'
import { check, place, type Ground, type Pack, type Rule, type Scatter as Numbers } from './scatter3d.sim.ts'
import { Scatter } from './scatter3d.components.tsx'

export const KIND = 'scatter3d'
type Asset = { type: string; url: string }
export type Edit = FileEdit
// The ground a preview stands its cells on: the server half's, with the land record at a point.
export type Land = Ground & { at(x: number, z: number): Record<string, number> }
// What a pack turned into a shape starts as.
export const SHAPE = { detail: 1, lumpy: [0.7, 0.3], squash: 0.7 }
export const GREY = '#808080'
// What a pack added to a scene with none starts as.
export const FIRST: Pack = { shape: SHAPE as Pack['shape'], colour: GREY, rows: { a: { weight: 1 } }, cell: 10, reach: 200, seed: 1, lods: [60], shadow: 60, leaf: 0, density: 0.3, rules: [], clearing: 0, size: [1, 0.5], vary: 0.2 }
// How long a preview may place cells before it lets the page go.
export const BUDGET = 8
// How long `scatter.preview` waits for the ground under the view to land.
const LANDING = 20_000

// The keys a land record answers: its own fields, and the values its class works out when read.
export function keysOf(record: object): string[] {
  const proto = Object.getPrototypeOf(record) as object
  const got = Object.entries(Object.getOwnPropertyDescriptors(proto)).filter(([k, d]) => k !== 'constructor' && d.get).map(([k]) => k)
  return [...new Set([...Object.keys(record), ...got])]
}

// The scene's scatter as its file holds it, that file, and the models of its catalogue.
export function scatterIn(ed: Editor, scene: string) {
  const { file, value } = ed.worldOf(scene, KIND)
  const assets = (ed.sceneOf(scene).world.loader?.assets ?? {}) as Record<string, Asset>
  return { file, numbers: value as unknown as Numbers, models: Object.entries(assets).filter(([, a]) => a.type === 'model').map(([n]) => n) }
}

// The land the plugins of a client stand the scatter on, the one its scene's
// `world.scatter3d.mods.land` names, once it has landed; none while the scene names none.
export const groundIn = (plugins: Plugins | undefined) =>
  plugins && mod<(plugins: Plugins) => Land | undefined>(plugins.wire.scene.world!, KIND, 'land')?.(plugins)

// The keys a rule of a pack may ask, as the panel's ramp offers them: those of the land record under
// the view's ground, else those the rules of the scatter's file ask already, every pack's, or
// `height` when none asks one.
export function ruleKeys(numbers: Numbers, ground: Land | undefined): string[] {
  if (ground) return keysOf(ground.at(0, 0))
  const had = [...new Set(Object.values(numbers.packs).flatMap(p => (p.rules ?? []).map(r => r.q)))]
  return had.length ? had : ['height']
}

const colour = z.string().regex(/^#[0-9a-f]{6}$/i, 'a colour, #rrggbb')
const pair = z.tuple([z.number(), z.number()])
const unit = z.number().min(0).max(1)
// A pack's fields, each of the shape the panel's field for it keeps: a slider's range, a number
// clamped at 0, a whole number, a colour.
const PACK_FIELDS = {
  asset: z.string(),
  shape: z.strictObject({ detail: z.number().int().min(0).max(4), lumpy: pair, squash: z.number().min(0.1).max(2) }),
  colour,
  surface: z.strictObject({
    broad: z.number(), fine: z.number(), lift: z.number(), range: z.number(), mix: pair,
    moss: z.strictObject({ from: z.number(), to: z.number(), amount: z.number(), up: pair, colour }), bump: z.number(), rough: z.number(),
  }),
  rows: z.record(z.string().min(1), z.strictObject({ weight: z.number().min(0), solid: z.number().min(0).optional(), tall: z.number().optional() })),
  cell: z.number(), reach: z.number(), seed: z.number().int(), lods: z.array(z.number()), shadow: z.number(), leaf: unit, density: unit,
  rules: z.array(z.strictObject({ q: z.string(), lo: z.number(), hi: z.number() })), clearing: z.number().min(0), size: pair, vary: unit,
}
const NEEDED = ['rows', 'cell', 'reach', 'seed', 'lods', 'shadow', 'leaf', 'density', 'rules', 'clearing', 'size', 'vary']
const PACK = z.strictObject(
  Object.fromEntries(Object.entries(PACK_FIELDS).map(([k, s]) => [k, NEEDED.includes(k) ? s : s.optional()])),
  { error: i => (i.code === 'unrecognized_keys' ? `has no ${i.keys.join(', ')}, which scatter3d does not read: a pack's fields are ${Object.keys(PACK_FIELDS).join(', ')}` : undefined) },
)

// What of pack `name` as `after` has it is not of `PACK`'s shape, where it differs from `before`.
function misshapen(name: string, before: Pack | undefined, after: Pack): string | undefined {
  const i = changedIssue(PACK, before, after)
  return i && `scatter3d pack ${name}${i.at ? ` ${i.at}` : ''} ${i.message}`
}

// The sentence `check` throws at `numbers` over `ground`, or undefined; with no ground a rule's key
// is not asked of one.
export function checked(numbers: Numbers, ground: Ground | undefined): string | undefined {
  try {
    check(numbers, ground ?? ({ rules: (list: Rule[]) => list } as unknown as Ground))
  } catch (e) {
    return (e as Error).message
  }
  return undefined
}

// Why edits to scene `scene`'s scatter are refused, or undefined, as the panel and `scatter.pack`
// refuse them alike. Each pack they touch is held to `PACK` where it changes, a model to one of the
// catalogue's and a rule's `q` to the keys `ruleKeys` offers; the numbers after them are refused a
// sentence `check` throws that it did not throw before; and, where `plugins` is the client the view
// shows the scene with, a model pack drawing a row its model has no mesh for at one of its LODs,
// once the model has landed, where it did not before.
export async function refusal(ed: Editor, scene: string, edits: Edit[], plugins: Plugins | undefined): Promise<string | undefined> {
  const { numbers, models } = scatterIn(ed, scene)
  const after = edited(numbers, edits)
  const ground = groundIn(plugins)
  const names = [...new Set(edits.map(e => String(e.at[1])))]
  for (const name of names) {
    const was = numbers.packs[name], now = after.packs[name]
    if (!now) continue
    const shaped = misshapen(name, was, now)
    if (shaped) return shaped
    if (now.asset !== undefined && now.asset !== was?.asset && !models.includes(now.asset))
      return `scatter3d pack ${name} is drawn from ${now.asset}, which is no model of ${scene}'s catalogue: its models are ${models.join(', ') || 'none'}`
    const keys = ruleKeys(numbers, ground)
    const asked = new Set((was?.rules ?? []).map(r => r.q))
    const odd = (now.rules ?? []).find(r => !asked.has(r.q) && !keys.includes(r.q))
    if (odd) return `scatter3d pack ${name} has a rule on ${odd.q}, which ${ground ? 'the land record has not got' : `no rule of the scatter asks, and no ground of ${scene} is under the game view to ask`}: a rule asks ${keys.join(', ')}`
  }
  const why = checked(after, ground)
  if (why && why !== checked(numbers, ground)) return why
  const loader = plugins?.loader
  if (!loader) return undefined
  for (const name of names) {
    const p = after.packs[name]
    if (p?.asset === undefined) continue
    // A model that cannot be loaded is never drawn, and the browser half throws at nothing.
    await loader.load(p.asset).catch(() => {})
    if (!loader.ready(p.asset)) continue
    const root = loader.model(p.asset).scene
    const meshless = unmeshed(name, p, root)
    const was = numbers.packs[name]
    if (meshless && !(was?.asset === p.asset && unmeshed(name, was, root) === meshless)) return meshless
  }
  return undefined
}

// Edits of the scatter as the file edits `written` writes: each at its place under `world.scatter3d`.
export const fileEdits = (file: string, edits: Edit[]): (FileEdit & { file: string })[] =>
  edits.map(e => ({ ...e, file, at: ['world', KIND, ...e.at] }))

// The edits that make pack `name` drawn from model `asset`, or a shape when it is '': a shape is
// given `SHAPE`, and `GREY` when it has no colour, and loses its asset; a model loses the shape, its
// colour and its surface.
export function sourced(name: string, pack: Pack, asset: string): Edit[] {
  const at = (k: string) => ['packs', name, k]
  const present = (k: keyof Pack) => (pack[k] !== undefined ? [{ at: at(k), value: undefined }] : [])
  if (asset === '') return [{ at: at('shape'), value: SHAPE }, ...(pack.colour === undefined ? [{ at: at('colour'), value: GREY }] : []), ...present('asset')]
  return [{ at: at('asset'), value: asset }, ...present('shape'), ...present('colour'), ...present('surface')]
}

// The cell the camera of a client stands in, of a pack's grid.
export const cameraCell = (plugins: Plugins | undefined, pack: Pack): [number, number] => {
  const camera = plugins?.render3d?.camera as { position: { x: number; z: number } } | undefined
  return [Math.floor((camera?.position.x ?? 0) / pack.cell), Math.floor((camera?.position.z ?? 0) / pack.cell)]
}

// Row `row` of the preview's square of cells, `2R + 1` a side about cell [ci, cj], placed by the
// server half's `place` on `ground`: each kept one marked in `kept` and handed to `each`.
export function placeRow(pack: Pack, [ci, cj]: [number, number], R: number, row: number, ground: Ground, kept: Uint8Array, each?: (x: number, z: number) => void): number {
  const side = 2 * R + 1
  let count = 0
  for (let c = 0; c < side; c++) {
    const cell = place(pack, ci - R + c, cj - R + row, ground)
    if (!cell) continue
    kept[row * side + c] = 1
    count++
    each?.(cell.x, cell.z)
  }
  return count
}

// How many cells `scatter.preview` answers at most, a square of them, and so how many cells from
// the camera's it reaches: 127, a square 255 cells a side.
export const PREVIEW = 65536
export const MOST = Math.floor((Math.sqrt(PREVIEW) - 1) / 2)
// The largest `within` of a pack's cell that reaches no further than `MOST` cells, said in four
// significant digits, as it is read back: the value named is one the call answers, however small
// the cell. None when no positive value of four digits is, as for a cell too small to write down.
export function furthest(cell: number): number | undefined {
  const most = MOST * cell
  if (!(most > 0) || !Number.isFinite(most)) return undefined
  const step = 10 ** (Math.floor(Math.log10(most)) - 3)
  const top = Math.floor(most / step)
  if (!(step > 0) || !Number.isFinite(top)) return undefined
  // Rounding to four digits is off by a step at most, and a few steps down is always under.
  for (let k = top; k > 0 && k > top - 10; k--) {
    const w = Number((k * step).toPrecision(4))
    if (w > 0 && Math.ceil(w / cell) <= MOST) return w
  }
  return undefined
}

export function scatter3d(ed: Editor) {
  ed.panel({ id: 'scatter3d', title: 'Scatter', area: 'right', component: Scatter })
  ed.bind('scatter3d', { 'packs.*.colour': 'color', 'packs.*.surface.moss.colour': 'color' })

  // ---------------------------------------------------------------- the commands

  // The client the game view shows the scene with, once the land it stands the scatter on has
  // landed, which is a few frames after the client mounts, once the land's file is read: a frame is
  // drawn for it first (`clientOn`), whether or not the editor's clock has drawn one, and one more
  // each turn until it lands. A scene whose
  // scatter names no land has none to wait for, and is refused at once.
  const landed = async (scene: string, numbers: Numbers): Promise<Plugins> => {
    const land = numbers.mods?.land
    if (land === undefined) throw new Error(`${scene}'s scatter stands on no land: its world.scatter3d.mods names no land`)
    const s = ed.need(), until = performance.now() + LANDING
    let plugins = (await s.clientOn(scene)).plugins
    while (!groundIn(plugins)) {
      if (performance.now() > until) throw new Error(`${land}'s land in the game view has not landed in ${LANDING / 1000} s`)
      await turn()
      plugins = (await s.clientOn(scene)).plugins
    }
    return plugins
  }
  // The client the view shows the scene with, as the panel has it, for the checks the panel makes
  // with it; none while the view shows another scene or is not open. A view just made again, as an
  // edit of a scene file makes it, or not drawn yet by the editor's clock, names its scene once a
  // frame has mounted its client, which `mounted` draws. A view whose frame cannot be drawn, held still say, has the client it has
  // or none, as the panel then has, and the file is written all the same, from the files: its ground,
  // landed or not, is only asked for the keys of the land record.
  const clientFor = async (scene: string) => {
    const s = ed.need()
    if (!s.attached) return undefined
    if (!s.client) await s.mounted().catch(() => undefined)
    return s.viewing === scene ? s.client?.plugins : undefined
  }
  const scene = z.string().describe('a scene with a world.scatter3d')
  const round = (v: number) => Math.round(v * 100) / 100

  ed.command({
    id: 'scatter.packs',
    title: 'Scatter: packs',
    input: z.object({ scene }).describe(`A scene's scatter as the Scatter panel shows it: the file that gives it, its own numbers, every pack's numbers, the models a pack may be drawn from, and the keys a rule may ask. ${OUTLINE}`),
    run: async ({ scene }) => {
      const { file, numbers, models } = scatterIn(ed, scene)
      const ground = groundIn(await clientFor(scene))
      const { packs, ...own } = numbers
      return {
        scene, file, numbers: own, packs: outlined(packs), models,
        keys: ruleKeys(numbers, ground),
        keysFrom: ground ? 'the land record under the game view' : `the rules of the scatter, while no ground of ${scene} is under the game view`,
      }
    },
  })
  ed.command({
    id: 'scatter.pack',
    title: 'Scatter: pack',
    input: z.object({
      scene,
      name: z.string().describe('the pack; one the scatter has not got is added'),
      pack: z.record(z.string(), z.unknown()).nullable().describe('every field: asset or shape {detail, lumpy, squash} with colour and surface?, rows {name: {weight, solid?, tall?}}, cell, reach, seed, lods, shadow, leaf, density, rules [{q, lo, hi}], clearing, size [base, spread], vary; null takes it out'),
    }).describe('Sets, adds or takes out a pack of a scene\'s scatter, as the Scatter panel does: each value that changes written by itself, one undo; refused as the panel refuses. Answers the pack.'),
    run: async ({ scene, name, pack }, e) => {
      const { file, numbers } = scatterIn(ed, scene)
      const was = numbers.packs[name]
      if (!name.trim()) throw new Error('a pack needs a name')
      if (pack === null && !was) throw new Error(`${scene}'s scatter has no pack ${name}: its packs are ${Object.keys(numbers.packs).join(', ') || 'none'}`)
      const edits: Edit[] = pack === null ? [{ at: ['packs', name], value: undefined }]
        : was ? changes(was, pack, ['packs', name]) : [{ at: ['packs', name], value: pack }]
      const why = await refusal(ed, scene, edits, await clientFor(scene))
      if (why) throw new Error(why)
      await written(e, fileEdits(file, edits))
      return { scene, file, name, pack: scatterIn(ed, scene).numbers.packs[name] ?? null }
    },
  })
  ed.command({
    id: 'scatter.preview',
    title: 'Scatter: preview',
    input: z.object({
      scene,
      pack: z.string().describe('the pack'),
      within: z.number().positive().optional().describe(`metres about the camera's cell answered; the pack's reach when left out; at most ${PREVIEW} cells`),
    }).describe('The Scatter panel\'s preview of a pack: every kept cell out to its reach around the camera\'s cell, placed on the ground of the game view, which must show the scene. Answers each as a world point [x, z].'),
    run: async ({ scene, pack: name, within }) => {
      const { numbers } = scatterIn(ed, scene)
      const pack = numbers.packs[name]
      if (!pack) throw new Error(`${scene}'s scatter has no pack ${name}: its packs are ${Object.keys(numbers.packs).join(', ') || 'none'}`)
      const reach = within ?? pack.reach
      const R = Math.ceil(reach / pack.cell), side = 2 * R + 1
      if (R > MOST) {
        const w = furthest(pack.cell)
        const cells = Number.isFinite(side * side) ? `${side * side} cells` : 'more cells than can be counted'
        throw new Error(`${name} out to ${reach} m is ${cells}, more than the ${PREVIEW} answered at once: ${w === undefined ? `its cell, ${pack.cell} m, is too small for any within to answer fewer` : `name a within of ${w} m or less`}`)
      }
      const plugins = await landed(scene, numbers)
      const ground = groundIn(plugins)!
      const at = cameraCell(plugins, pack)
      const kept = new Uint8Array(side * side), points: [number, number][] = []
      let start = performance.now()
      for (let row = 0; row < side; row++) {
        try {
          placeRow(pack, at, R, row, ground, kept, (x, z) => points.push([round(x), round(z)]))
        } catch (e) {
          throw new Error(`no preview: ${(e as Error).message}`)
        }
        if (performance.now() - start < BUDGET) continue
        await turn()
        start = performance.now()
      }
      return { scene, pack: name, cameraCell: at, cell: pack.cell, reach, cells: side * side, kept: points.length, points }
    },
  })
}
