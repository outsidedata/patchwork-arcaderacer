// The actors extension: a scene's actors placed, moved and deleted in the game view, every game's
// alike, written into the scene's files. An actor is an `actors` entry of a scene file, or of the
// actors file it names: the row its scene boots with. Select's drag moves a running row from this step
// on (`placeRow`); these write the entry, so the scene boots with the change, and the step is rebuilt
// from the files.
//
// A kind is placeable in a scene when its sim hands it out, the scene has a prefab of it, and a
// placer stands that prefab on a point (`Editor.placerIn`): its kind's own, or the one of the
// renderer the scene names. Nothing here names a game, a kind or a field: where an actor stands is
// what its placer reads and writes.
//
//   Place (P)    a click on the game view writes an entry of the kind picked in the Actors panel, its
//                fields its placer's for the ground point clicked, at the end of the scene's actors
//                (its actors file's, when it names one). The point is snapped to the snap picked, on
//                the ground's axes but height.
//   Arrange (A)  a click selects the actor drawn under the pointer, or the scene; a drag moves it,
//                shown live, and writes where it is let go into its entry, its placer's fields over
//                the entry's. A row no entry made, a spawned one, is said to be so and not moved.
//   Delete       the actor selected taken out of its scene's actors (the key, or the panel's button).
// Each is one undo, and the game is rebuilt from the file.
//
// The Actors panel (`actors.components.tsx`): the kinds placeable in the scene the game view shows,
// each with its actors there; a click picks one and puts the view in Place; the snap; and the actor
// selected, with Delete.
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each one undo, whatever the view shows:
//   actors.kinds   the kinds placeable in a scene, with the axes each stands on and its count;
//   actors.place   an actor of a kind written standing on a point;
//   actors.move    an actor's entry made to stand on a point;
//   actors.remove  an actor's entry taken out;
//   actors.delete  the actor selected taken out (Delete).
import { z } from 'zod'
import { ROW, type Editor, type Edits, type Placer, type Pointer } from '#editor/editor.ts'
import type { Row } from '#engine/engine.ts'
import { ActorsPanel } from './actors.components.tsx'

// The snaps a placed point is snapped to, in world units; 0 for none.
export const SNAPS = [0, 1, 0.5, 0.25, 0.125]

export type Studio = {
  kind: string | undefined
  snap: number
  pick(kind: string): void
  setSnap(snap: number): void
}

// The kinds placeable in scene `scene`: handed out by its sim, given a prefab, and stood on a point by
// a placer.
export function placeable(ed: Editor, scene: string): string[] {
  const t = ed.sceneOf(scene)
  return Object.keys(t.sim).filter(k => {
    const prefab = t.scene.prefabs[k] as Row['data'] | undefined
    return prefab && ed.placerIn(scene, k)?.at(prefab)
  }).sort()
}

// The placer and the prefab of a kind placeable in scene `scene`; one that is not is refused, naming
// those that are.
function placing(ed: Editor, scene: string, kind: string): { placer: Placer; prefab: Row['data']; stands: number[] } {
  const kinds = placeable(ed, scene)
  if (!kinds.includes(kind)) throw new Error(`${scene} places no ${kind}: its kinds stood on a point are ${kinds.join(', ') || 'none'}`)
  const prefab = ed.sceneOf(scene).scene.prefabs[kind] as Row['data']
  const placer = ed.placerIn(scene, kind)!
  return { placer, prefab, stands: placer.at(prefab)! }
}

const fits = (scene: string, what: string, placer: Placer, stands: number[], point: number[]) => {
  if (point.length !== stands.length) throw new Error(`${what} of ${scene} stands on a point of ${stands.length} numbers, [${placer.axes.join(', ')}], and not ${point.length}`)
}

// The point `p` snapped to `snap` on each axis but height: `h`, and `y` where the axes have a `z`.
export function snapPoint(axes: string[], p: number[], snap: number): number[] {
  const height = axes.includes('z') ? 'y' : 'h'
  return p.map((v, i) => (snap && axes[i] !== height ? Math.round(v / snap) * snap : Math.round(v * 1000) / 1000))
}

// An actor of `kind` written into scene `scene` standing on `point`, as an edit of `e`: at the end of
// its actors file's list when it names one, else of its file's `actors`. Answers the entry, the file
// and where in it.
export async function placeActor(ed: Editor, e: Edits, scene: string, kind: string, point: number[]) {
  const { placer, prefab, stands } = placing(ed, scene, kind)
  fits(scene, `a ${kind}`, placer, stands, point)
  const s = ed.need()
  const entry = { is: kind, ...placer.to(prefab, point) }
  const list = s.actorsPath(scene)
  const file = list ?? s.path(scene)
  await e.editFile(file, list ? [-1] : ['actors', -1], entry, true)
  const written = JSON.parse(await ed.text(file))
  const at = list ? [written.length - 1] : ['actors', written.actors.length - 1]
  return { entry, file, at }
}

// The entry that made row `id` of scene `scene`, with its prefab; a row no entry made is refused.
function entryOf(ed: Editor, scene: string, id: number) {
  const row = ed.rowOf(scene, id)
  const actor = ed.need().actor(scene, id)
  if (!actor) throw new Error(`row ${id} of ${scene}, a ${row.kind}, was spawned: no actors entry made it (inspect.saveAsActor saves it as one)`)
  return { row, ...actor, prefab: (ed.sceneOf(scene).scene.prefabs[row.kind] ?? {}) as Row['data'] }
}

// The entry of row `id` of scene `scene` made to stand on `point`, as an edit of `e`: each field its
// placer sets, written into the entry. Answers the fields.
export async function moveActor(ed: Editor, e: Edits, scene: string, id: number, point: number[]) {
  const { row, file, at, entry, prefab } = entryOf(ed, scene, id)
  const placer = ed.placerIn(scene, row.kind)
  const merged = { ...prefab, ...entry }
  const stands = placer?.at(merged)
  if (!placer || !stands) throw new Error(`row ${id} of ${scene}, a ${row.kind}, stands on no point a placer reads`)
  fits(scene, `row ${id}`, placer, stands, point)
  const patch = placer.to(merged, point)
  for (const [k, v] of Object.entries(patch)) await e.editFile(file, [...at, k], v)
  return patch
}

// The entry of row `id` of scene `scene` taken out of its actors, as an edit of `e`. Answers it.
export async function removeActor(ed: Editor, e: Edits, scene: string, id: number) {
  const { file, at, entry } = entryOf(ed, scene, id)
  await e.editFile(file, at, undefined)
  if (ed.selection && 'id' in ed.selection && ed.selection.scene === scene) ed.select({ scene })
  return { removed: entry, file, at }
}

export function actors(ed: Editor) {
  const studio: Studio = {
    kind: undefined,
    snap: 0,
    pick(kind) {
      studio.kind = kind
      ed.activate('actors.place')
      ed.changed('x.actors')
    },
    setSnap(snap) {
      studio.snap = snap
      ed.changed('x.actors')
    },
  }
  const fail = (err: unknown) => ed.error((err as Error).message, (err as Error).stack)

  ed.tool({
    id: 'actors.place',
    title: 'Place',
    key: 'P',
    cursor: 'copy',
    down(p: Pointer) {
      if (!studio.kind) return ed.info('Place: pick a kind in the Actors panel')
      const ground = p.stage.ground(p.x, p.y)
      if (!ground) return
      const kind = studio.kind
      try {
        const { placer } = placing(ed, p.scene, kind)
        ed.together(e => placeActor(ed, e, p.scene, kind, snapPoint(placer.axes, ground, studio.snap))).catch(fail)
      } catch (err) {
        fail(err)
      }
    },
  })

  // An actor being dragged: its placer, where it stood when grabbed and the level it is dragged across,
  // with the canvas point it was grabbed at, so it moves as far as the point under the pointer moves.
  let drag: { scene: string; id: number; placer: Placer; start: Row['data']; stands: number[]; through: number[]; from: [number, number]; point?: number[] } | undefined
  ed.tool({
    id: 'actors.arrange',
    title: 'Arrange',
    key: 'A',
    cursor: 'move',
    down(p: Pointer) {
      drag = undefined
      const hit = p.stage.pick(p.x, p.y)
      if (!hit) return ed.select({ scene: p.scene })
      ed.select({ scene: p.scene, id: hit.id })
      const row = ed.session?.row(p.scene, hit.id)
      if (!row) return
      if (!ed.need().actor(p.scene, hit.id)) return ed.info(`Arrange: row ${hit.id} of ${p.scene}, a ${row.kind}, was spawned, and no actors entry made it`)
      const placer = ed.placerIn(p.scene, row.kind)
      const stands = placer?.at(row.data)
      if (!placer || !stands) return
      drag = { scene: p.scene, id: hit.id, placer, start: structuredClone(row.data), stands, through: hit.point, from: [p.x, p.y] }
    },
    move(p: Pointer) {
      const d = drag
      const now = d && p.stage.plane(p.x, p.y, d.through)
      const was = d && p.stage.plane(d.from[0], d.from[1], d.through)
      if (!d || !now || !was) return
      d.point = snapPoint(d.placer.axes, d.stands.map((v, i) => v + (now[i] ?? 0) - (was[i] ?? 0)), studio.snap)
      for (const [k, v] of Object.entries(d.placer.to(d.start, d.point))) ed.session?.preview(d.scene, d.id, [k], v)
    },
    off() { drag = undefined },
    up() {
      const d = drag
      drag = undefined
      if (d?.point) ed.together(e => moveActor(ed, e, d.scene, d.id, d.point!)).catch(fail)
    },
  })

  function Actors() {
    return <ActorsPanel studio={studio} />
  }
  ed.panel({ id: 'actors', title: 'Actors', area: 'right', component: Actors })

  // ---------------------------------------------------------------- the commands

  const scene = z.string().describe('a scene of the open game')
  const point = z.array(z.number()).min(1).describe('the point to stand on, in the axes actors.kinds names: [x, y, h] under render2d, [x, y, z] under render3d')
  const selected = () => {
    const sel = ed.selection
    return sel && 'id' in sel && ed.session?.actor(sel.scene, sel.id) ? sel : undefined
  }
  ed.command({
    id: 'actors.kinds',
    title: 'Actors: kinds',
    input: z.object({ scene }).describe('The kinds placeable in a scene, those its sim hands out with a prefab a placer stands on a point: each with the axes of that point, the point its prefab stands on, and how many actors of it the scene has.'),
    run: ({ scene }) => {
      const t = ed.sceneOf(scene)
      return {
        scene,
        kinds: placeable(ed, scene).map(k => {
          const { placer, stands } = placing(ed, scene, k)
          return { kind: k, axes: placer.axes, prefab: stands, actors: t.rows.filter(r => r.kind === k && ed.need().actor(scene, r.id)).length }
        }),
      }
    },
  })
  ed.command({
    id: 'actors.place',
    title: 'Actors: place',
    input: z.object({ scene, kind: z.string().describe('a kind actors.kinds names'), point }).describe('Writes an actor of a kind into a scene\'s actors, standing on a point, as Place does: its placer\'s fields over nothing, at the end of the actors. One undo. Answers the entry, its file and where in it.'),
    run: ({ scene, kind, point }, e) => placeActor(ed, e, scene, kind, point),
  })
  ed.command({
    id: 'actors.move',
    title: 'Actors: move',
    input: z.object({ ...ROW, point }).describe('Makes the actors entry that made a row stand on a point, as Arrange\'s drag does: the fields its placer sets, written into the entry. One undo. Answers the fields.'),
    run: ({ scene, id, point }, e) => moveActor(ed, e, scene, id, point),
  })
  ed.command({
    id: 'actors.remove',
    title: 'Actors: remove',
    input: z.object({ ...ROW }).describe('Takes the actors entry that made a row out of its scene\'s actors. One undo. Answers the entry taken out, its file and where it was.'),
    run: ({ scene, id }, e) => removeActor(ed, e, scene, id),
  })
  ed.command({
    id: 'actors.delete',
    title: 'Delete Actor',
    menu: 'Edit',
    key: 'Delete',
    enabled: () => !!selected(),
    run: () => {
      const sel = selected()!
      return ed.together(e => removeActor(ed, e, sel.scene, sel.id))
    },
  })
}
