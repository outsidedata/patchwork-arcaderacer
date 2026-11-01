// render2d's extension: how a row of every scene that names render2d is moved, and the 2D stage the
// game view draws on, for every client that has render2d.
//
// The placer (`Editor.placeBy`), whether the game view draws the scene or not: a row whose `pos` is
// [x, y] or [x, y, h] stands on [x, y, h], and moved to another point it is there, at the height it
// had.
//
// The stage (`Editor.stage`). A canvas point is drawn from a whole line of world points, one at each height,
// because a point [x, y, h] is drawn `h` steps of `world.render2d`'s `up` from the ground point under it:
//   ray      that line, [x, y, 0] on the ground plus [dx, dy, 1] for each step of height;
//   ground   its point at height 0, and `plane` its point at the height of a point [x, y, h];
//   pick     the row drawn topmost at the point, as the tags know it (`editor/drawn.ts`), in the
//            order the stage draws, with the ground point under it; `bounds` a row's box on the
//            canvas;
//   overlay  a PixiJS container over the world's layers, moved with the world's camera, which an
//            extension draws into in world pixels; nothing in it is picked. It is the stage's own: an
//            extension draws into the overlay of each new stage;
//   mark     a line through world points and a dot on each, drawn in the overlay where render2d
//            places each point, a point [x, y] on the ground; its width and its dots are screen
//            pixels whatever the camera's zoom, as they are redrawn every frame.
// A 2D stage has no orbit: its camera is the game's. A scene with no `world.render2d` has no world,
// and its world points are the canvas's pixels. A canvas point is in the canvas's own pixels, as the
// game view hands them: render2d draws at the screen's density, `devicePixelRatio` of them to each
// of its points, so the stage takes a canvas point to points before it asks PixiJS, and hands a box
// back in canvas pixels.
//
// The layers of a scene's `world.render2d`, by name, are `layersOf`, which an extension whose field
// names a layer offers.
import * as PIXI from 'pixi.js'
import type { Editor, Placer, Stage } from '#editor/editor.ts'
import { tagOf } from '#editor/drawn.ts'
import type { Plugins } from '#engine/browser.ts'

type V2 = [number, number]
const isPos = (v: unknown): v is number[] => Array.isArray(v) && (v.length === 2 || v.length === 3) && v.every(n => typeof n === 'number')

// The layers of `world.render2d` of `scene` of the open game, its own or else the game's, by name.
export function layersOf(ed: Editor, scene: string): string[] {
  const s = ed.session
  if (!s) return []
  const table = s.files.get(ed.worldFile(scene, 'render2d'))?.world?.render2d as { layers?: (string | { name: string })[] } | undefined
  return (table?.layers ?? []).map(l => (typeof l === 'string' ? l : l.name))
}

// A row whose `pos` is [x, y] or [x, y, h] stands on [x, y, h], at height 0 for one of two, and is
// stood on another at the height it has there: the placer of every scene render2d draws, drawn or not.
const placer: Placer = {
  at: d => (isPos(d.pos) ? [d.pos[0], d.pos[1], d.pos[2] ?? 0] : undefined),
  axes: ['x', 'y', 'h'],
  to: (d, p) => ({ pos: (d.pos as number[]).length === 2 ? [p[0], p[1]] : [p[0], p[1], p[2]] }),
}

export function render2d(ed: Editor) {
  ed.placeBy('render2d', placer)
  ed.stage(plugins => (plugins.render2d ? stage2d(plugins) : undefined))
}

function stage2d(plugins: Plugins): Stage {
  const r = plugins.render2d
  const overlay = new PIXI.Container()
  let closed = false
  const table = () => plugins.wire.scene.world?.render2d as { ground: [V2, V2]; up?: V2 } | undefined

  // Canvas pixels to each of render2d's points: the canvas's width over its width on the page, which
  // render2d sets to its points.
  const dense = () => {
    const c: HTMLCanvasElement | undefined = r.canvas
    const css = c ? parseFloat(c.style.width) : NaN
    return c && css > 0 ? c.width / css : 1
  }
  // The ground point under a canvas point and the way a step of height goes from it: render2d's
  // `unproject` at heights 0 and 1.
  const ray = (cx: number, cy: number): { origin: number[]; dir: number[] } => {
    const x = cx / dense(), y = cy / dense()
    if (!table() || !r.world) return { origin: [x, y, 0], dir: [0, 0, 1] }
    const origin = r.unproject(x, y, 0), top = r.unproject(x, y, 1)
    return { origin, dir: [top[0] - origin[0], top[1] - origin[1], 1] }
  }
  const at = (x: number, y: number, h: number) => {
    const { origin, dir } = ray(x, y)
    return origin.map((v, i) => v + dir[i] * h)
  }

  // Every thing on the stage that is drawn, in the order it is drawn, with the row it is for; the
  // overlay is nobody's.
  const drawn = (): { thing: PIXI.Container; id: number }[] => {
    const out: { thing: PIXI.Container; id: number }[] = []
    const walk = (c: PIXI.Container, above: number | undefined) => {
      if (c === overlay || !c.visible || c.alpha <= 0) return
      const id = tagOf(c) ?? above
      if (id !== undefined && c.children.length === 0) out.push({ thing: c, id })
      // A container that sorts its children draws them by zIndex, the first of equals first.
      const kids = c.sortableChildren ? [...c.children].sort((a, b) => a.zIndex - b.zIndex) : c.children
      for (const k of kids) walk(k, id)
    }
    walk(r.stage, undefined)
    return out
  }

  // Where a world point is drawn in the overlay: where render2d places it, or at its own pixels in a
  // scene with no world.
  const placed = (p: number[]): [number, number] => (table() ? r.place(p) : [p[0], p[1]])
  const marks = new Set<{ g: PIXI.Graphics; points: number[][]; color: number }>()
  const redraw = () => {
    const k = table() ? 1 / r.camera().zoom : 1
    for (const m of marks) {
      m.g.clear()
      const at = m.points.map(placed)
      if (at.length > 1) {
        m.g.moveTo(...at[0])
        for (const p of at.slice(1)) m.g.lineTo(...p)
        m.g.stroke({ color: m.color, width: 1.5 * k })
      }
      for (const p of at) m.g.circle(p[0], p[1], 2.5 * k).fill({ color: m.color })
    }
  }

  // The overlay goes over the world's layers once the world is made, at render2d's first tick, and
  // stays the last thing drawn in it; the marks in it are drawn for the camera about to draw.
  const was = r.afterTick
  const mine = function (this: unknown, ...args: unknown[]) {
    if (!closed) {
      const on: PIXI.Container = r.world ?? r.stage
      if (overlay.parent !== on || on.children[on.children.length - 1] !== overlay) on.addChild(overlay)
      if (marks.size) redraw()
    }
    return was.apply(this, args)
  }
  r.afterTick = mine

  return {
    ray,
    ground: (x, y) => at(x, y, 0),
    plane: (x, y, through) => at(x, y, through[2] ?? 0),
    pick(x, y) {
      const all = drawn()
      const k = dense()
      for (let i = all.length - 1; i >= 0; i--) if (all[i].thing.getBounds().rectangle.contains(x / k, y / k)) return { id: all[i].id, point: at(x, y, 0) }
      return undefined
    },
    bounds(id) {
      const mine = drawn().filter(d => d.id === id)
      if (!mine.length) return undefined
      const b = new PIXI.Bounds()
      for (const d of mine) b.addBounds(d.thing.getBounds())
      const k = dense()
      return [b.minX * k, b.minY * k, b.width * k, b.height * k]
    },
    overlay,
    mark(points, color) {
      const m = { g: new PIXI.Graphics(), points: points.map(p => [...p]), color }
      overlay.addChild(m.g)
      marks.add(m)
      return () => {
        if (!marks.delete(m)) return
        m.g.removeFromParent()
        m.g.destroy()
      }
    },
    close() {
      closed = true
      if (r.afterTick === mine) r.afterTick = was
      marks.clear()
      overlay.parent?.removeChild(overlay)
      overlay.destroy({ children: true })
    },
  }
}
