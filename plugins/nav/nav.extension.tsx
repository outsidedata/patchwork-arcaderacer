// nav's extension: the way a mover walks, drawn over the game view, and the types of the fields that
// hold it. nav names no game and no kind: a game says which fields of its rows are a mover's way by
// binding them to nav's types (`Editor.bind`), and a row is a mover when a field at its top is bound
// to one of them:
//   nav.from   where the mover stands, a point: its numbers in a VecField;
//   nav.route  the points its route goes through, in the order it walks them: how many, how long
//              along them and where they end, which opens to the list of points; while the field is
//              hovered or has the focus the route is drawn on the stage, from where its mover stands
//              when it is a live row's;
//   nav.goal   where the mover heads, a point, or null for none: its numbers in a VecField with a
//              button that takes the goal away, or "none" with a button that sets one at the point
//              the mover stands on, its field bound to `nav.from` beside the goal.
//
// The Route section of the inspector (`nav.components.tsx`) is shown for a selected row that is a
// mover. It draws the row's way on the stage of the game view with `Stage.mark`, so the 2D stage and
// the 3D one draw it alike: from where it stands through each point of its route in the theme's
// accent colour, from the route's end, or from where it stands when it has no route, to its goal in
// the theme's warning colour, and each jump over the route in its danger colour. It is drawn only
// while the game view shows the row's scene, and says so when the view shows another. The marks are
// taken away and drawn again after every step, seek and edit the recorder makes, on every change the
// editor tells of the game, the stage, the theme, the bindings and the every-mover toggle, and on each
// new stage. Beside the drawing it reads out what tells why a mover walks
// wrong (`measure`): the points left, how far it stands from the first of them, the route's length
// along its points, its step, how far the route ends from the goal, and flags a mover that has a
// goal and no route (it stands), a route that ends further than a diagonal step from its goal, and
// every jump. Under them are the row's fields bound to nav's types, edited on the live row through
// the recorder. A toggle, kept in the page's localStorage under `nav.every`, draws every mover of the
// scene as well, each in a hue of its own taken from its id, one line from where it stands through
// its route to its goal, with the selected row's way drawn last, over them.
//
// A distance between two points is measured over the numbers both have, so a mover standing at
// [x, y, h] is measured against a route point [x, y] on the ground under it. A route's step is the
// shortest distance between two neighbouring points of it; a point further from the one before it
// than √2 steps, a diagonal step, is a jump.
//
// What the section's readouts, its fields and its drawing do is done by functions here, which they
// and the commands call alike: a mover's way read by `wayOf` and measured by `measure`, its fields
// set by `setWay`, where it stands for a goal set there found by `standsAt`, and what is drawn for
// a mover, with every other one or not, made by `drawn`. The every-mover toggle is one for the
// section and the commands (`Drawing`).
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here:
//   nav.measure  a scene's movers, each with what tells why it walks wrong; or one mover's way and
//                every readout the Route section shows of it;
//   nav.goal     a mover's goal set, taken away, or set where it stands, as the goal field's buttons
//                do, on the live row from this step on; over a goal it has, where it stands is cut
//                to that goal's length, so a mover on [x, y, h] heads for [x, y];
//   nav.way      where a mover stands and the points of its route set, as their fields set them, on
//                the live row from this step on;
//   nav.draw     a mover's way drawn over the game view as the Route section draws the selected
//                row's, with every other mover's when `every` says, which is the section's toggle
//                too; kept, following the rows step by step, until a call takes it away or the
//                extension turns off. It is a preview, so the game view must show the scene; a frame
//                is drawn first where none has mounted the view's client, whether or not the
//                editor's clock has drawn one.
// The readouts and the writes work whatever the game view shows, from the rows; each write is one
// undo, answering the mover as nav.measure does.
import { z } from 'zod'
import type { Path } from '#addons/recorder/recorder.addon.ts'
import type { Edits, Editor, Owner, Selection, Stage } from '#editor/editor.ts'
import type { Session } from '#editor/session.ts'
import { hexOf, themed } from '#editor/ui/theme.ts'
import type { Row } from '#engine/engine.ts'
import { Goal, Place, RouteField, RouteSection } from './nav.components.tsx'

// Where the every-mover toggle is kept.
export const EVERY = 'nav.every'

export type Role = 'from' | 'route' | 'goal'
// A mover's way: where it stands, the points of its route and where it heads, each when the row has
// a field bound to it.
export type Way = { from?: number[]; route: number[][]; goal?: number[] }
export type Measure = {
  // The route's points.
  left: number
  // From where it stands to the route's first point, with a route and a place to stand.
  first?: number
  // Along the route's points, from the first to the last.
  length: number
  // The shortest distance between two neighbouring points of the route, with two points or more.
  step?: number
  // Each point further from the one before it than a diagonal step, by its index in the route.
  jumps: { at: number; gap: number }[]
  // From the route's end, or from where it stands with no route, to its goal.
  toGoal?: number
  // It has a goal and no route.
  stands: boolean
  // The route ends further than a diagonal step from its goal.
  short: boolean
}
// One line to mark on the stage.
export type Line = { points: number[][]; color: number }

// Whether every mover's way is drawn beside the one asked for: the Route section's toggle, which the
// commands turn too. It is kept in the page's localStorage under `nav.every`; a page with no storage
// keeps it until it goes.
export type Drawing = { every: boolean; setEvery(on: boolean): void }

function stored(): boolean {
  try {
    return localStorage.getItem(EVERY) === 'on'
  } catch {
    return false
  }
}

export function nav(ed: Editor) {
  ed.field('nav.from', Place)
  ed.field('nav.route', RouteField)
  ed.field('nav.goal', Goal)

  const drawing: Drawing = {
    every: stored(),
    setEvery(on) {
      drawing.every = on
      try {
        localStorage.setItem(EVERY, on ? 'on' : 'off')
      } catch { /* a page with no storage keeps the toggle until it goes */ }
      ed.changed('x.nav')
    },
  }
  function Route({ selection }: { selection: Selection }) {
    return <RouteSection selection={selection} drawing={drawing} />
  }
  ed.inspector({
    id: 'nav',
    title: 'Route',
    when: sel => {
      if (!sel || !('id' in sel)) return false
      const row = ed.session?.row(sel.scene, sel.id)
      return !!row && mover(ed, row)
    },
    component: Route,
  })

  // What nav.draw keeps drawn: a scene's mover, or every one, on the stage the game view draws that
  // scene on, while the game it was asked in is open; drawn again whenever the editor tells a change
  // of what it is drawn from: of the game (a step, a seek, an edit, the scene the view shows), of the
  // stage, of the theme, whose colours it is drawn in, of the bindings that make a row a mover, and of
  // the every-mover toggle.
  const asked: { on?: { session: Session; scene: string; id?: number }; stage?: Stage; key: string; off: (() => void)[] } = { key: '', off: [] }
  const repaint = () => {
    if (asked.on && asked.on.session !== ed.session) asked.on = undefined
    const a = asked.on, stage = ed.staged
    const want = a && stage && ed.session?.viewing === a.scene ? drawn(ed, a.scene, a.id, drawing.every) : []
    const key = JSON.stringify(want)
    if (stage === asked.stage && key === asked.key) return
    for (const f of asked.off.splice(0)) f()
    asked.stage = stage
    asked.key = key
    if (stage) for (const l of want) asked.off.push(stage.mark(l.points, l.color))
  }
  const off = ed.subscribe(repaint, ['game', 'tools', 'theme', 'extensions', 'x.nav'])
  // Turned off, nav stops listening and takes what nav.draw drew away.
  ed.onDrop(() => {
    off()
    for (const f of asked.off.splice(0)) f()
  })

  const scene = z.string().describe('a scene of the open game')
  const id = z.number().int().describe('a mover of it, by its row id')
  const point = z.array(z.number()).min(2).max(3).describe('a world point, [x, y] or [x, y, h]')
  // A mover as nav.measure answers it.
  const measured = (name: string, row: Row) => {
    const way = wayOf(ed, row)
    return {
      scene: name, id: row.id, kind: row.kind, fields: fieldsOf(ed, row, row.data), way, ...measure(way),
      ...(way.from && way.goal && { standsFromGoal: gap(way.from, way.goal) }),
    }
  }

  ed.command({
    id: 'nav.measure',
    title: 'Nav: measure',
    input: z.object({
      scene,
      id: id.optional().describe('one mover, by its row id; every mover of the scene when left out'),
    }).describe('The Route section\'s readouts, from the rows: a mover\'s way (where it stands, its route, its goal, by the fields bound to nav\'s types), the points left, from where it stands to the first, the route\'s length, its step, from its end to the goal, each jump, whether it stands (a goal and no route) and whether the route ends short of the goal. Every mover of the scene, measured, when no id is given.'),
    run: ({ scene, id }) => {
      if (id !== undefined) return measured(scene, moverOf(ed, scene, id))
      return { scene, movers: ed.sceneOf(scene).rows.filter(r => mover(ed, r)).map(r => measured(scene, r)) }
    },
  })
  ed.command({
    id: 'nav.goal',
    title: 'Nav: goal',
    input: z.object({
      scene,
      id,
      goal: z.union([point, z.null(), z.literal('here')]).describe('the point it heads for; null takes its goal away; "here" sets it where the mover stands, cut to the length of the goal it has'),
    }).describe('Sets a mover\'s goal on its live row from this step on, as the goal field and its buttons do: an edit the recording keeps, one undo. Answers the mover as nav.measure does.'),
    run: ({ scene, id, goal }, e) => {
      const row = moverOf(ed, scene, id)
      const at = fieldsOf(ed, row, row.data).goal
      let to = goal === 'here' ? null : goal
      if (goal === 'here' && at !== undefined) {
        const stands = standsAt(ed, row, [at])
        if (!stands) throw new Error(nowhere(at))
        to = stands
      }
      setWay(e, ed, scene, row, { goal: to })
      return measured(scene, ed.rowOf(scene, id))
    },
  })
  ed.command({
    id: 'nav.way',
    title: 'Nav: way',
    input: z.object({
      scene,
      id,
      from: z.array(z.number()).optional().describe('where it stands, as many numbers as it has'),
      route: z.array(point).optional().describe('the points its route goes through, in the order it walks them'),
    }).describe('Sets where a mover stands and the points of its route on its live row from this step on, as their fields in the Route section do: edits the recording keeps, one undo. Answers the mover as nav.measure does.'),
    run: ({ scene, id, from, route }, e) => {
      const row = moverOf(ed, scene, id)
      if (from === undefined && route === undefined) throw new Error('hand from or route to set')
      setWay(e, ed, scene, row, { from, route })
      return measured(scene, ed.rowOf(scene, id))
    },
  })
  ed.command({
    id: 'nav.draw',
    title: 'Nav: draw',
    input: z.object({
      scene,
      id: id.optional().describe('the mover whose way is drawn as the Route section draws the selected row\'s'),
      every: z.boolean().optional().describe('draw every other mover\'s way too, each in a hue of its own, as the section\'s toggle, which this turns; as the toggle stands when left out'),
    }).describe('Draws movers\' ways over the game view, which must show the scene, as the Route section draws them, and keeps them drawn as the rows move, until a call draws others; with no id and every false, takes them away. Answers each line drawn, its points and its colour.'),
    run: async ({ scene, id, every }) => {
      if (id !== undefined) moverOf(ed, scene, id)
      else ed.sceneOf(scene)
      const on = id !== undefined || (every ?? drawing.every)
      if (on) {
        await ed.need().clientOn(scene)
        if (!ed.staged) throw new Error(`the game view has no stage to draw on: no extension makes one for the client of ${scene}`)
      }
      if (every !== undefined && every !== drawing.every) drawing.setEvery(every)
      asked.on = on ? { session: ed.need(), scene, id } : undefined
      repaint()
      return { scene, ...(id !== undefined && { id }), every: drawing.every, lines: on ? drawn(ed, scene, id, drawing.every).map(l => ({ points: l.points, color: hexOf(l.color) })) : [] }
    },
  })
}

// Row `id` of `scene` when it is a mover, refused naming the scene's movers.
function moverOf(ed: Editor, scene: string, id: number): Row {
  const t = ed.sceneOf(scene)
  const row = t.rows.find(r => r.id === id)
  if (row && mover(ed, row)) return row
  const movers = t.rows.filter(r => mover(ed, r)).map(r => r.id)
  throw new Error(`row ${id} of ${scene} is ${row ? `a ${row.kind}, no mover: no field of it is bound to nav's types` : 'not there'}: its movers are ${movers.join(', ') || 'none'}`)
}

// Where the mover stands whose goal is the field at `at` of the owner's data, as a goal there: the
// field bound to `nav.from` beside the goal, a copy of it, cut to the goal's own length where it has
// a goal, since a mover standing on [x, y, h] may head for [x, y]; undefined when no field says where
// it stands. What the goal field's "set here" sets, and `nav.goal`'s "here".
export function standsAt(ed: Editor, owner: Pick<Owner, 'kind' | 'file' | 'data'>, at: Path): number[] | undefined {
  const up = at.slice(0, -1)
  const beside = up.reduce<unknown>((o, k) => (o as Record<string | number, unknown> | undefined)?.[k], owner.data) as Record<string, unknown> | undefined
  const key = beside ? fieldsOf(ed, owner, beside, up).from : undefined
  if (key === undefined) return undefined
  const goal = beside![at[at.length - 1]] as number[] | null
  return (beside![key] as number[]).slice(0, goal ? goal.length : undefined)
}
// What is said of the goal field `name` when nothing beside it says where its mover stands.
export const nowhere = (name: string) => `${name}: nothing beside it says where it stands`

// A mover's way set on its live row from this step on, each role handed written into the field bound
// to it, an edit of `e`. Each point is as long as the mover's own of its kind, as their fields keep
// them: where it stands as long as it is; a point of the route as long as the route's, or with none
// as its goal or where it stands, and all of them one length; a goal as long as the one it has, or
// with none as where it stands or its route's points. A role the mover has no field for is refused,
// naming those it has.
export function setWay(e: Pick<Edits, 'editRow'>, ed: Editor, scene: string, row: Row, way: { from?: number[]; route?: number[][]; goal?: number[] | null }) {
  const f = fieldsOf(ed, row, row.data)
  const now = wayOf(ed, row)
  const lengths: Record<Role, (number | undefined)[]> = {
    from: [now.from?.length],
    route: now.route.length ? [now.route[0].length] : [now.goal?.length, now.from?.length],
    goal: now.goal ? [now.goal.length] : [now.from?.length, now.route[0]?.length],
  }
  for (const [role, v] of Object.entries(way) as [Role, unknown][]) {
    if (v === undefined) continue
    const k = f[role]
    if (k === undefined) throw new Error(`row ${row.id} of ${scene}, a ${row.kind}, has no field bound to nav.${role}: it has ${Object.entries(f).map(([r, k]) => `${k} (nav.${r})`).join(', ')}`)
    const points = role === 'route' ? (v as number[][]) : v === null ? [] : [v as number[]]
    const lens = [...new Set(lengths[role].filter(n => n !== undefined))]
    const bad = points.find(p => lens.length > 0 && !lens.includes(p.length))
    if (bad) throw new Error(`row ${row.id} of ${scene}: its ${k} takes points of ${lens.join(' or ')} numbers, as the mover's own are, and [${bad.join(', ')}] has ${bad.length}`)
    if (points.some(p => p.length !== points[0].length)) throw new Error(`row ${row.id} of ${scene}: the points of its ${k} are all one length, and [${points.map(p => p.length).join(', ')}] are not`)
    e.editRow(scene, row.id, [k], v)
  }
}

// What is drawn for mover `id` of `scene`, as the Route section draws the selected row: its lines
// (`lines`), last, over every other mover's, each one line in its hue (`whole`), when `every`; with
// no `id`, every mover's alone.
export function drawn(ed: Editor, scene: string, id: number | undefined, every: boolean): Line[] {
  const s = ed.need()
  const others = every ? s.scene(scene).rows.filter(r => r.id !== id && mover(ed, r)).flatMap(r => whole(wayOf(ed, r), hue(r.id))) : []
  const live = id === undefined ? undefined : s.row(scene, id)
  return [...others, ...(live ? lines(wayOf(ed, live), colours()) : [])]
}

// The fields of `value`, the thing at `at` in something of the owner's, that are bound to nav's
// types, by the role each plays; the first field of each type.
export function fieldsOf(ed: Editor, owner: Pick<Owner, 'kind' | 'file'>, value: Record<string, unknown>, at: Path = []): Partial<Record<Role, string>> {
  const out: Partial<Record<Role, string>> = {}
  for (const k of Object.keys(value)) {
    const type = ed.typeOf(owner.kind, [...at, k], owner.file)
    const role = type?.startsWith('nav.') ? (type.slice(4) as Role) : undefined
    if ((role === 'from' || role === 'route' || role === 'goal') && !(role in out)) out[role] = k
  }
  return out
}

// Whether a row is a mover: a field at its top is bound to one of nav's types.
export const mover = (ed: Editor, row: Row) => Object.keys(fieldsOf(ed, row, row.data)).length > 0

// A row's way, read off its fields bound to nav's types.
export function wayOf(ed: Editor, row: Row): Way {
  const f = fieldsOf(ed, row, row.data)
  const goal = f.goal === undefined ? undefined : (row.data[f.goal] as number[] | null)
  return {
    from: f.from === undefined ? undefined : (row.data[f.from] as number[]),
    route: f.route === undefined ? [] : (row.data[f.route] as number[][]),
    goal: goal ?? undefined,
  }
}

// The distance between two points, over the numbers both have.
export const gap = (a: number[], b: number[]) => Math.hypot(...a.slice(0, Math.min(a.length, b.length)).map((v, i) => v - b[i]))

export function measure(w: Way): Measure {
  const gaps = w.route.slice(1).map((p, i) => gap(w.route[i], p))
  const apart = gaps.filter(g => g > 0)
  const step = apart.length ? Math.min(...apart) : undefined
  const diagonal = step === undefined ? Infinity : step * Math.SQRT2 * (1 + 1e-9)
  const end = w.route.at(-1) ?? w.from
  const toGoal = w.goal && end ? gap(end, w.goal) : undefined
  return {
    left: w.route.length,
    first: w.from && w.route.length ? gap(w.from, w.route[0]) : undefined,
    length: gaps.reduce((a, b) => a + b, 0),
    step,
    jumps: gaps.flatMap((g, i) => (g > diagonal ? [{ at: i + 1, gap: g }] : [])),
    toGoal,
    stands: !!w.goal && !w.route.length,
    short: toGoal !== undefined && toGoal > diagonal,
  }
}

// The selected mover's lines: its route from where it stands, the leg from the route's end to its
// goal, and each jump, in that order, so each is drawn over the one before.
export function lines(w: Way, c: { route: number; goal: number; jump: number }): Line[] {
  const route = [...(w.from ? [w.from] : []), ...w.route]
  const end = route.at(-1)
  const out: Line[] = []
  if (route.length > 1) out.push({ points: route, color: c.route })
  if (w.goal && end) out.push({ points: [end, w.goal], color: c.goal })
  else if (route.length === 1 && !w.goal) out.push({ points: route, color: c.route })
  for (const j of measure(w).jumps) out.push({ points: [w.route[j.at - 1], w.route[j.at]], color: c.jump })
  return out
}

// Another mover's way as one line, from where it stands through its route to its goal; none when it
// is a single point.
export function whole(w: Way, color: number): Line[] {
  const points = [...(w.from ? [w.from] : []), ...w.route, ...(w.goal ? [w.goal] : [])]
  return points.length > 1 ? [{ points, color }] : []
}

// A hue of a mover's own, from its id: each id turns the hue on by the golden angle, so ids near one
// another are far apart round the wheel. Saturation 0.7 and lightness 0.6 read on a light ground and
// a dark one.
export function hue(id: number): number {
  const h = (id * 137.50776) % 360, s = 0.7, l = 0.6
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
  }
  return (f(0) << 16) | (f(8) << 8) | f(4)
}

// The theme's colours for the selected mover's lines.
export const colours = () => ({ route: themed('--accent', 0xffffff), goal: themed('--warn', 0xffffff), jump: themed('--danger', 0xffffff) })
