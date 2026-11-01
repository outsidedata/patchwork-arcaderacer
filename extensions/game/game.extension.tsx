// The game view: the open game drawn as its own page draws it, fitted to the panel. In Play (Escape)
// the game has the pointer and the keys: clicking the view gives it the focus, and while it has the
// focus the keys and the mouse are the game's; anywhere else in the editor they are the editor's. In
// a tool the view hands the pointer to the tool (`Editor.tool`), and a right drag, a middle drag and
// the wheel to the stage's orbit. A pointer the browser cancels ends a press as a release where the
// pointer last moved to does, and a tool left mid-press is handed its `up` where the pointer last was
// (`Editor.ends`); a drag of the orbit ends with it.
//
// Select (V) is this extension's tool: a click selects the row drawn under the pointer, or the scene
// when there is none, and dragging a row moves it across the level of the point it was grabbed at,
// so that point stays under the pointer. The row is moved by the placer of its scene
// (`Editor.placerIn`): its kind's, or else the one of the renderer that draws the scene, which is the
// stage's; the drag is shown live and kept, when it is let go, as one edit from this step on
// (`placeRow`).
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here:
//   game.open   opens a game, as the Open Game list does: the editor's own here (`Editor.open`),
//               answering its scenes, and another by going to its page (`Editor.openGame`);
//   game.shot   a PNG of the game view as it is now (`Session.shot`);
//   view.pose   reads the orbit's pose, or puts it, so the view is drawn from where a call says;
//   view.frame  turns the orbit to look at everything a row draws, as F does the selection;
//   view.mark   draws a line through world points over the view, kept until a call clears it;
//   rows.place  stands a row on a world point, as Select's drag does, one edit from this step on,
//               whatever the view shows and whether it draws at all.
// Those that need the view show the Game panel first, as a person opens it, and wait for it to draw
// the game (`viewed`); those that need the stage the view draws on mount the view's client first
// where the clock has drawn no frame yet (`staged`, `Session.mounted`). The orbit holds the camera
// only while the view is in a tool, so `view.pose` and `view.frame` put a view in Play in Select,
// and refuse while an extension holds the orbit off. A mark is drawn on every stage the view makes of
// the scene it was marked on, while that game is open and the extension on: turned off, it takes
// every mark away.
import { z } from 'zod'
import { ROW, type Edits, type Editor, type Placer, type Pointer, type Stage } from '#editor/editor.ts'
import type { Session } from '#editor/session.ts'
import type { Row } from '#engine/engine.ts'
import { GameView } from './game.components.tsx'

// A row being dragged: where it stood when grabbed and the level it is dragged across, with the
// canvas point it was grabbed at, so it moves as far as the point under the pointer moves.
type Drag = {
  scene: string
  id: number
  placer: Placer
  start: Record<string, unknown>
  stands: number[]
  through: number[]
  from: [number, number]
  point?: number[]
}

// How long a command waits for the Game panel, once shown, to draw the game, in milliseconds.
const ATTACH = 5000

// Row `id` of `scene`, whose data was `from`, stood on world point `point` by `placer`, from this
// step on: each field the placer sets is an edit of `e`, so one undo takes the move back. Answers
// the fields.
export function placeRow(e: Edits, placer: Placer, scene: string, id: number, from: Row['data'], point: number[]) {
  const patch = placer.to(from, point)
  for (const [k, v] of Object.entries(patch)) e.editRow(scene, id, [k], v)
  return patch
}

export function game(ed: Editor) {
  ed.panel({ id: 'game', title: 'Game', area: 'center', lead: true, component: GameView })
  ed.command({ id: 'tool.play', title: 'Play', menu: 'Tools', key: 'Escape', run: () => ed.activate(undefined) })

  let drag: Drag | undefined
  ed.tool({
    id: 'select',
    title: 'Select',
    key: 'V',
    cursor: 'crosshair',
    down(p: Pointer) {
      drag = undefined
      const hit = p.stage.pick(p.x, p.y)
      if (!hit) return ed.select({ scene: p.scene })
      ed.select({ scene: p.scene, id: hit.id })
      const row = ed.session?.row(p.scene, hit.id)
      if (!row) return
      const placer = ed.placerIn(p.scene, row.kind)
      const stands = placer?.at(row.data)
      if (!placer || !stands) return
      drag = { scene: p.scene, id: hit.id, placer, start: structuredClone(row.data), stands, through: hit.point, from: [p.x, p.y] }
    },
    // The world points under the grab and under the pointer are both asked of the camera as it is
    // now, so a camera that follows the row as it moves does not move it further.
    move(p: Pointer) {
      const d = drag
      const now = d && p.stage.plane(p.x, p.y, d.through)
      const was = d && p.stage.plane(d.from[0], d.from[1], d.through)
      if (!d || !now || !was) return
      // A thousandth is as fine as a hand places anything.
      d.point = d.stands.map((v, i) => Math.round((v + (now[i] ?? 0) - (was[i] ?? 0)) * 1000) / 1000)
      for (const [k, v] of Object.entries(d.placer.to(d.start, d.point))) ed.session?.preview(d.scene, d.id, [k], v)
    },
    off() { drag = undefined },
    // Letting go keeps where it was dropped, as one edit from this step on.
    up() {
      const d = drag
      drag = undefined
      if (!d?.point) return
      try {
        ed.together(e => placeRow(e, d.placer, d.scene, d.id, d.start, d.point!))
      } catch (err) {
        ed.error((err as Error).message, (err as Error).stack)
      }
    },
  })

  ed.command({
    id: 'game.open',
    title: 'Open a game',
    input: z.object({ name: z.string().describe('a game of games/, by its folder\'s name') }).describe('Opens a game, as File › Open Game does. The editor is on one game: its own is opened here when it is not open already, and answers its scenes, each with its file, the scene the game view shows, and the step. Another game is opened by the page going to it once this call has its answer, its own session and history kept for when it comes back: answers { opening }, and the tools are then that game\'s.'),
    run: async ({ name }) => {
      if ((await ed.openGame(name)) === 'going') return { opening: name }
      const s = ed.session!
      return { game: name, scenes: ed.scenesWith().map(scene => ({ scene, file: s.path(scene) })), viewing: s.viewing ?? null, step: s.n }
    },
  })
  ed.command({
    id: 'game.shot',
    title: 'Picture of the game view',
    input: z.object({
      width: z.number().int().min(1).default(800).describe('the most pixels across; the picture keeps the view\'s shape, and is never wider than the view draws'),
    }).describe('A PNG of the game view as it is now: the game, and its UI over it, from the camera the view draws from (the orbit\'s, set by view.pose, while the view is in a tool). Shows the Game panel first. Nothing is drawn at step 0: run a step first.'),
    run: async ({ width }) => (await viewed(ed)).shot({ width }),
  })

  const pose = z.object({
    pivot: z.array(z.number()).length(3).describe('the world point [x, y, z] it looks at and turns about'),
    yaw: z.number().describe('radians about +y: 0 looks along +z'),
    pitch: z.number().gt(-Math.PI / 2).lt(Math.PI / 2).describe('radians the eye is above the pivot, below it when negative'),
    dist: z.number().positive().describe('world units from the eye to the pivot'),
  })
  ed.command({
    id: 'view.pose',
    title: 'Orbit pose',
    input: z.object({
      pose: pose.optional().describe('the pose to put; the one it has is answered when left out'),
    }).describe('Reads or puts where the orbit, the editor\'s camera of a 3D game view, looks from: the eye at pivot + dist·(−sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch), looking at pivot. The orbit draws the view only in a tool, so a view in Play is put in Select. Answers the pose.'),
    run: async ({ pose }) => {
      const { orbit } = await orbiting(ed)
      if (pose) orbit.put(pose)
      return { pose: orbit.pose() }
    },
  })
  ed.command({
    id: 'view.frame',
    title: 'Frame a row',
    input: z.object({
      scene: z.string().describe('the scene the game view shows'),
      id: ROW.id,
    }).describe('Turns the orbit of a 3D game view to look at everything a row draws, as F does the selection. The orbit draws the view only in a tool, so a view in Play is put in Select. Answers the pose.'),
    run: async ({ scene, id }) => {
      ed.rowOf(scene, id)
      const { stage, orbit } = await orbiting(ed, scene)
      if (!stage.bounds(id)) throw new Error(`row ${id} of ${scene} draws nothing in the game view to look at`)
      orbit.frame(id)
      return { pose: orbit.pose() }
    },
  })

  // The marks kept, by id: each drawn on the stage the view draws its scene on, while the game it was
  // marked in is open.
  const marks = new Map<number, { session: Session; scene: string; points: number[][]; color: number; on?: Stage; off?: () => void }>()
  let marked = 0
  const redraw = () => {
    const stage = ed.staged, scene = ed.session?.viewing
    for (const [id, m] of marks) {
      if (m.session !== ed.session) {
        m.off?.()
        marks.delete(id)
        continue
      }
      const want = m.scene === scene ? stage : undefined
      if (m.on === want) continue
      m.off?.()
      m.on = m.off = undefined
      if (want) {
        m.off = want.mark(m.points, m.color)
        m.on = want
      }
    }
  }
  // The stage is the tools' and the scene the view shows the game's.
  const off = ed.subscribe(redraw, ['game', 'tools'])
  // Turned off, the view stops listening and every mark is taken off the stage.
  ed.onDrop(() => {
    off()
    for (const m of marks.values()) m.off?.()
    marks.clear()
  })
  ed.command({
    id: 'view.mark',
    title: 'Mark the game view',
    input: z.object({
      points: z.array(z.array(z.number()).min(2).max(3).describe('a world point of three numbers, or two for one on the ground: [x, z] in a 3D scene, [x, y] in a 2D one')).min(1).optional().describe('the points to draw a line through, a dot on each'),
      color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#4c8dff').describe('the line\'s colour, #rrggbb'),
      clear: z.union([z.number().int(), z.literal('all')]).optional().describe('a mark to take away first, by its id, or all'),
    }).describe('Draws a line through world points over the game view, a dot on each, so the person in the editor sees the place or the way you mean; it stays on the scene the view shows until clear takes it away. Answers its id and every mark kept.'),
    run: async ({ points, color, clear }) => {
      if (points === undefined && clear === undefined) throw new Error('hand points to mark, or clear to take a mark away')
      if (clear !== undefined && clear !== 'all' && !marks.has(clear)) throw new Error(`no mark ${clear}: the marks are ${[...marks.keys()].join(', ') || 'none'}`)
      // The stage is found before anything is cleared, so a call that cannot mark changes nothing.
      const on = points && await staged(ed)
      for (const [id, m] of marks) if (clear === 'all' || clear === id) {
        m.off?.()
        marks.delete(id)
      }
      let id: number | undefined
      if (points && on) {
        id = ++marked
        marks.set(id, { session: on.s, scene: on.scene, points, color: parseInt(color.slice(1), 16) })
        redraw()
      }
      return { ...(id !== undefined && { mark: id }), marks: [...marks].map(([id, m]) => ({ id, scene: m.scene })) }
    },
  })

  ed.command({
    id: 'rows.place',
    title: 'Place a row',
    input: z.object({
      ...ROW,
      point: z.array(z.number()).min(1).describe('the point it is to stand on, in the axes of the point it stands on and as many numbers: [x, y, z] in a 3D scene, [x, y, h] in a 2D one (h its height), or its kind\'s own; another length is refused, naming the axes'),
    }).describe('Stands a row on a point, as dragging it with Select does: its kind\'s placer, or else the one of the renderer that draws its scene, sets its fields, one edit from this step on, whatever the game view shows. Answers the row\'s data.'),
    run: ({ scene, id, point }, e) => {
      const row = ed.rowOf(scene, id)
      const placer = ed.placerIn(scene, row.kind)
      if (!placer) throw new Error(`no placer moves row ${id} of ${scene}, a ${row.kind}: its kind has none, and no renderer the scene names has one`)
      const stands = placer.at(row.data)
      if (!stands) throw new Error(`row ${id} of ${scene}, a ${row.kind}, stands on no point its placer reads`)
      if (point.length !== stands.length) throw new Error(`row ${id} of ${scene} stands on a point of ${stands.length} numbers, [${placer.axes.join(', ')}]: now [${stands.join(', ')}]`)
      placeRow(e, placer, scene, id, row.data, point)
      return ed.rowOf(scene, id).data
    },
  })
}

// The open game, with the game view drawing it: the Game panel is shown when the view is not open,
// as a person opens it, and waited for until it draws the game, which the session tells as it
// attaches.
async function viewed(ed: Editor): Promise<Session> {
  const s = ed.need()
  if (s.attached) return s
  if (!ed.revealer) throw new Error('the game view is not open, and the editor\'s page has no dock to show the Game panel in')
  await new Promise<void>((ok, no) => {
    const done = (f: () => void) => {
      clearTimeout(late)
      off()
      f()
    }
    const off = ed.subscribe(() => {
      if (ed.session !== s) done(() => no(new Error(`${s.game.name} was closed`)))
      else if (s.attached) done(ok)
    }, ['game'])
    const late = setTimeout(() => done(() => no(new Error(`the game view is not open: the Game panel did not draw the game within ${ATTACH / 1000} s of being shown`))), ATTACH)
    ed.reveal('game')
  })
  return s
}

// The stage the game view draws on, and the scene it shows, `scene` when one is asked for: where the
// view has mounted no client yet, a frame is drawn, which mounts it and makes its stage.
async function staged(ed: Editor, scene?: string): Promise<{ s: Session; stage: Stage; scene: string }> {
  const s = await viewed(ed)
  await s.mounted()
  const stage = ed.staged, viewing = s.viewing!
  if (!stage) throw new Error(`the game view has no stage: no extension makes one for the client of ${viewing}`)
  if (scene !== undefined && scene !== viewing) throw new Error(`the game view shows ${viewing}, not ${scene}`)
  return { s, stage, scene: viewing }
}

// The orbit of the stage the game view draws on, holding the camera: a view in Play is put in Select,
// since the orbit holds it only in a tool, and a view whose orbit an extension holds off is refused.
// Where it has not taken the camera yet, a frame is drawn, in which it does.
async function orbiting(ed: Editor, scene?: string) {
  const { s, stage } = await staged(ed, scene)
  const orbit = stage.orbit
  if (!orbit) throw new Error(`the stage of ${s.viewing} has no orbit: its camera is the game's`)
  if (ed.holds.length) throw new Error(`the orbit is held off, so the game places the camera, by ${ed.holds.map(h => h.who).join(', ')}`)
  if (ed.tooling === undefined) ed.activate('select')
  if (!orbit.pose()) await s.frame()
  if (!orbit.pose()) throw new Error('the orbit has not taken the camera: the game has none yet')
  return { stage, orbit }
}
