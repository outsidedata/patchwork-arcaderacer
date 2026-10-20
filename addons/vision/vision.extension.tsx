// Team vision's extension: what each team sees this step and what each seat is sent of it, over the
// game view and in the Vision panel, and the scene's `world.vision` edited as values of its file.
//
// It works on the scene the game view shows when its `world` has `vision`, else the one
// `focus('vision')` says. What it shows is worked out from the scene's truth as the addon works it
// out for a packet (`sight`, `visible`): the cells each team's seers see, and, for each slot, which
// rows with a place are sent to it and which are not. A slot is one a `player` row sits in
// (`addons/player`) or one a row of the scene belongs to, so the team of a side no seat plays shows
// too. A row with no place, or of an `always` kind, is sent to every seat and is only counted.
//
// The Vision panel (`vision.components.tsx`):
//   the map     the scene's cells, each seen by the picked slot's team clear and every other dark,
//               with every row with a place on it: the team's own and those it is sent in the accent
//               and warning colours, those it is not sent in the danger colour, ringed;
//   the seats   each slot, its team, how many cells its team sees, and how many rows it is sent and
//               is not; a click picks it; the rows the picked slot is not sent, each selecting its row;
//   the block   `world.vision` of the file the scene takes it from (`Editor.worldFile`), a value at a
//               time through the editor's files: `sight` per kind, the `always` kinds, `teams`, and
//               every other number the block holds, the fog's own drawn by the types the vision
//               plugin's extension gives them. A kind is added to `sight` or `always`, and taken out,
//               by the buttons beside them; `teams` is given, a team of its own for each slot, or
//               taken away.
// "Over the game view" draws, while the view shows the scene, the edge of what the picked slot's
// team sees and a ring round every row it is not sent, with `Stage.mark`, so any renderer's stage
// draws it; after every step, seek and edit, new stage and theme it is drawn again. Which slot is picked, and whether it
// is drawn, are this viewer's own, kept in the browser under `vision.shown`.
//
// The type `vision.kind` is a kind the owner's scene has a prefab for, as `world.vision` names its
// kinds; it is bound to `always` of every scene file's `world.vision`.
//
// Commands, each a tool of the editor's MCP server:
//   vision.report  the scene's vision this step: each team's cells seen, and each slot's rows sent and
//                  not sent, by id;
//   vision.show    picks the slot drawn over the game view, or none;
//   vision.sight   sets how many cells a kind sees, or takes the kind out of `sight`;
//   vision.always  puts a kind into `always`, or takes it out;
//   vision.teams   sets `teams`, a team for each slot, or takes it away.
// Each edit is one undo.
import { z } from 'zod'
import type { Editor, Stage } from '#editor/editor.ts'
import type { Row, Truth } from '#engine/engine.ts'
import { themed } from '#editor/ui/theme.ts'
import { block, cellOf, sight, teamOf, visible, type Block } from './vision.addon.ts'
import { KindName, VisionPanel } from './vision.components.tsx'

export const SHOWN = 'vision.shown'
const isScene = (path: string) => path.endsWith('.scene.json')

// The scene the extension is on: the one the view shows when its world has vision, else the one
// `focus('vision')` says.
export function visionScene(ed: Editor): string | undefined {
  const s = ed.session
  if (!s) return undefined
  if (s.viewing && s.scenes().get(s.viewing)?.world.vision !== undefined) return s.viewing
  return ed.focus('vision')?.scene
}

// ---------------------------------------------------------------- what a scene's vision comes to

export type Slot = number | string
// One slot: its team, the id of the player row sitting in it, and the rows with a place it is sent and
// is not, by id.
export type Seat = { slot: Slot; team: unknown; player?: number; sent: number[]; hidden: number[] }
export type Report = {
  scene: string
  size: [number, number]
  // Each team with a seer, and the cells it sees, c = y × across + x.
  teams: { team: unknown; cells: number[] }[]
  seats: Seat[]
  // The rows sent to every seat: with no place, or of an `always` kind.
  everyone: number
}

// The slots of a scene: each a `player` row sits in, and each a row belongs to, in order.
export function slotsOf(b: Block, rows: Row[]): Slot[] {
  const out = new Set<Slot>()
  for (const r of rows) {
    const v = r.kind === 'player' ? r.data.seat : r.data[b.slot]
    if (typeof v === 'number' || typeof v === 'string') out.add(v)
  }
  return [...out].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))))
}

export function report(truth: Truth, scene: string): Report {
  const b = block(truth), always = new Set(b.always), grids = sight(b, truth.rows)
  const placed = truth.rows.filter(r => b.at in r.data && !always.has(r.kind))
  const seats = slotsOf(b, truth.rows).map(slot => {
    const team = teamOf(b, slot)
    const seat: Seat = { slot, team, sent: [], hidden: [] }
    const player = truth.rows.find(r => r.kind === 'player' && r.data.seat === slot)
    if (player) seat.player = player.id
    for (const r of placed) (visible(b, always, grids, team, r) ? seat.sent : seat.hidden).push(r.id)
    return seat
  })
  const teams = [...grids].map(([team, g]) => ({ team, cells: g.reduce<number[]>((out, v, c) => (v ? (out.push(c), out) : out), []) }))
  return { scene, size: b.size, teams, seats, everyone: truth.rows.length - placed.length }
}

// The cells the team of `slot` sees among a scene's rows, one byte a cell, or none when it has no seer.
export function seenBy(truth: Truth, slot: Slot): Uint8Array | undefined {
  const b = block(truth)
  return sight(b, truth.rows).get(teamOf(b, slot))
}

// The edge of what a grid of cells seen holds, as lines of world points on the ground: each run of
// cell edges with a seen cell on one side and an unseen one, or the map's edge, on the other.
export function edges(b: Block, seen: Uint8Array): number[][][] {
  const [w, h] = b.size, k = b.cell
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && seen[y * w + x] === 1
  const out: number[][][] = []
  for (let y = 0; y <= h; y++) {
    let from = -1
    for (let x = 0; x <= w; x++) {
      const edge = x < w && at(x, y - 1) !== at(x, y)
      if (edge && from < 0) from = x
      if (!edge && from >= 0) { out.push([[from * k, y * k], [x * k, y * k]]); from = -1 }
    }
  }
  for (let x = 0; x <= w; x++) {
    let from = -1
    for (let y = 0; y <= h; y++) {
      const edge = y < h && at(x - 1, y) !== at(x, y)
      if (edge && from < 0) from = y
      if (!edge && from >= 0) { out.push([[x * k, from * k], [x * k, y * k]]); from = -1 }
    }
  }
  return out
}

// A ring round a row's place, a quarter of a cell out from it, as a line of world points on the ground.
export function ring(b: Block, row: Row): number[][] {
  const [x, y] = row.data[b.at] as number[], r = b.cell / 4
  return [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r], [x - r, y - r]]
}

// ---------------------------------------------------------------- the viewer's pick

export type Shown = { slot?: Slot; over: boolean }
// What the panel and the drawing over the game view share: the slot picked and whether it is drawn.
export type Picker = {
  subscribe(f: () => void): () => void
  version(): number
  shown: Shown
  set(patch: Partial<Shown>): void
}

function kept(): Shown {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SHOWN) ?? 'null')
    if (v && typeof v === 'object') return { over: false, ...(v as Partial<Shown>) }
  } catch {
    // Nothing kept, or nothing this page may read.
  }
  return { over: false }
}

function picker(): Picker {
  let version = 0
  const listeners = new Set<() => void>()
  const me: Picker = {
    subscribe(f) {
      listeners.add(f)
      return () => { listeners.delete(f) }
    },
    version: () => version,
    shown: kept(),
    set(patch) {
      me.shown = { ...me.shown, ...patch }
      try {
        localStorage.setItem(SHOWN, JSON.stringify(me.shown))
      } catch {
        // Kept for this page only.
      }
      version++
      for (const f of listeners) f()
    },
  }
  return me
}

// ---------------------------------------------------------------- the edits

const at = (...keys: (string | number)[]) => ['world', 'vision', ...keys]

// The scene an edit is of: the one named, which must have vision, else the one the extension is on.
function sceneFor(ed: Editor, scene: string | undefined): { scene: string; truth: Truth; file: string } {
  const s = ed.need()
  const name = scene ?? visionScene(ed)
  if (name === undefined) throw new Error(`no scene of ${s.game.name} has world.vision`)
  const truth = ed.sceneOf(name)
  if (truth.world.vision === undefined) throw new Error(`${name} has no world.vision`)
  return { scene: name, truth, file: ed.worldFile(name, 'vision') }
}

// The block as the scene's file holds it, which is what an edit changes.
export const filed = (ed: Editor, scene: string): Record<string, unknown> | undefined =>
  ed.session?.files.get(ed.worldFile(scene, 'vision'))?.world?.vision as Record<string, unknown> | undefined

export function vision(ed: Editor) {
  const p = picker()

  ed.field('vision.kind', KindName)
  ed.bindFile(isScene, { 'world.vision.always.*': 'vision.kind' })

  function Panel() {
    return <VisionPanel picker={p} />
  }
  ed.panel({ id: 'vision', title: 'Vision', area: 'right', component: Panel })

  // What is drawn over the game view: the edge of what the picked slot's team sees in the accent
  // colour, and a ring round each row it is not sent in the danger colour, while the view shows a
  // scene with vision. Drawn again only when it changes, and anew on each new stage.
  let stage: Stage | undefined
  let drawn: (() => void)[] = []
  let was = ''
  const paint = () => {
    const st = ed.staged
    if (st !== stage) {
      drawn = []
      was = ''
      stage = st
    }
    const s = ed.session
    const scene = s?.viewing
    const truth = scene === undefined ? undefined : s!.scenes().get(scene)
    const { slot, over } = p.shown
    let lines: { points: number[][]; color: number }[] = []
    if (st && truth && truth.world.vision !== undefined && over && slot !== undefined) {
      try {
        const b = block(truth), seen = seenBy(truth, slot)
        const seat = report(truth, scene!).seats.find(x => x.slot === slot)
        const edge = themed('--accent', 0xffffff), danger = themed('--danger', 0xffffff)
        lines = [
          ...(seen ? edges(b, seen) : []).map(points => ({ points, color: edge })),
          ...(seat?.hidden ?? []).flatMap(id => {
            const r = truth.rows.find(x => x.id === id)
            return r && cellOf(b, r) >= 0 ? [{ points: ring(b, r), color: danger }] : []
          }),
        ]
      } catch {
        // A block of the wrong shape draws nothing; the panel says why.
      }
    }
    const key = JSON.stringify(lines)
    if (key === was) return
    was = key
    for (const f of drawn.splice(0)) f()
    if (st) for (const l of lines) drawn.push(st.mark(l.points, l.color))
  }
  // It reads the game, the stage (`tools`) and the theme's colours.
  const off = [ed.subscribe(paint, ['game', 'tools', 'theme']), p.subscribe(paint)]
  // Turned off, the drawing stops listening and what it drew is taken off the stage.
  ed.onDrop(() => {
    for (const f of off) f()
    for (const f of drawn.splice(0)) f()
  })

  const where = { scene: z.string().optional().describe('a scene of the open game with world.vision; the one the Vision panel is on when left out') }
  const slot = z.union([z.number(), z.string()])
  ed.command({
    id: 'vision.report',
    title: 'Vision: report',
    input: z.object(where).describe('What the scene\'s vision is this step: the map\'s size in cells, each team with a seer and the cells it sees (c = y × across + x), each slot\'s team, player row, and the ids of the rows with a place it is sent and is not, and how many rows every seat is sent (no place, or an always kind).'),
    run: ({ scene }) => {
      const got = sceneFor(ed, scene)
      return report(got.truth, got.scene)
    },
  })
  ed.command({
    id: 'vision.show',
    title: 'Vision: show',
    input: z.object({ slot: slot.nullable().describe('the slot whose team\'s vision is drawn over the game view, or null to draw none') })
      .describe('Draws over the game view the edge of what a slot\'s team sees and a ring round each row it is not sent, as the Vision panel\'s "over the game view" does.'),
    run: ({ slot }) => p.set(slot === null ? { over: false } : { slot, over: true }),
  })
  ed.command({
    id: 'vision.sight',
    title: 'Vision: sight',
    input: z.object({
      ...where,
      kind: z.string().describe('a kind the scene has a prefab for'),
      cells: z.number().min(0).nullable().describe('how many cells round its own cell a row of the kind sees, or null to take the kind out of sight'),
    }).describe('Sets how far a kind sees in the scene file\'s world.vision.sight, one value: one undo.'),
    run: async ({ scene, kind, cells }, edits) => {
      const got = sceneFor(ed, scene)
      if (!(kind in got.truth.scene.prefabs)) throw new Error(`${got.scene} has no prefab ${kind}`)
      const had = kind in ((filed(ed, got.scene)?.sight ?? {}) as Record<string, unknown>)
      if (cells !== null || had) await edits.editFile(got.file, at('sight', kind), cells ?? undefined)
    },
  })
  ed.command({
    id: 'vision.always',
    title: 'Vision: always',
    input: z.object({
      ...where,
      kind: z.string().describe('a kind the scene has a prefab for'),
      on: z.boolean().describe('true puts the kind into world.vision.always, sent to every seat wherever its rows stand; false takes it out'),
    }).describe('Puts a kind into the scene file\'s world.vision.always or takes it out, one value: one undo.'),
    run: async ({ scene, kind, on }, edits) => {
      const got = sceneFor(ed, scene)
      if (!(kind in got.truth.scene.prefabs)) throw new Error(`${got.scene} has no prefab ${kind}`)
      const list = (filed(ed, got.scene)?.always ?? []) as string[]
      const i = list.indexOf(kind)
      if (on && i < 0) await edits.editFile(got.file, at('always', -1), kind, true)
      if (!on && i >= 0) await edits.editFile(got.file, at('always', i), undefined)
    },
  })
  ed.command({
    id: 'vision.teams',
    title: 'Vision: teams',
    input: z.object({
      ...where,
      teams: z.array(z.union([z.number(), z.string(), z.null()])).nullable().describe('each slot\'s team, a list by slot; null takes teams away, so each slot is a team of its own'),
    }).describe('Sets the scene file\'s world.vision.teams, one value: one undo.'),
    run: async ({ scene, teams }, edits) => {
      const got = sceneFor(ed, scene)
      await edits.editFile(got.file, at('teams'), teams ?? undefined)
    },
  })
}
