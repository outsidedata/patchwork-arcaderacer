// The browser half of the cutscene: the camera during a shot, and the bars, the veil and the line,
// all drawn from the cutscene row and the cast rows as the frame's rows hold them. Its numbers are
// the scene's `world.cutscene` (`cutscene.sim.ts`), read off `plugins.wire.scene.world`, and the
// panels' sizes and styles are ui's prefab.
//
// The camera. While the scene runs a shot, it claims render3d's camera (`render3d.claim`) and
// places it in its `tick`: the pose `pose(row, rows, height)` with the shake `shaken(row, tremor)` added, its
// orientation set directly and its fov written with the projection made again. The pose is the
// row's shot at the row's `e` over the rows as they stand and the ground (`heightOf`), a follow or
// a look at a cast member read again every frame, so it is the same on every seat and every frame
// the same rows are drawn; nothing eases, and no clock of the page's is read. It takes the camera
// from nobody: while another driver holds the claim, the editor's orbit while a tool is active say,
// it places nothing, and it claims the camera again the first frame it is free. It places nothing
// on a frame whose rows lack a member the shot names. When the shot has ended with the scene, done
// or skipped, it releases the claim and gives the camera back the fov it had when it took it; a
// scene that ends while another driver holds the camera gives the fov back the first frame the
// camera is free.
//
// The order. It places the camera in its `tick`, and is listed after render3d, whose first tick
// makes the camera from its prefab and would put it back there over a shot placed before it; so a
// seat that arrives during a shot draws the shot from its first frame. It is listed before
// chasecamera3d, whose tick comes after it and places the camera on the frame this lets it go, so no
// frame is left drawn from the shot's last pose; and before `ui`, whose `afterTick` draws what this
// shows in its own. Listed otherwise, its tick throws, and it throws when it has a shot to place and
// the scene lists no render3d, or gives it no camera.
//
// The panels, drawn in its `afterTick` through `ui.show` while the scene runs and not before it
// starts or once it is done:
//   cutscene.top and cutscene.bottom   each a bar the panel's width across and `bars` of its height,
//                                      from the canvas's edge inward, in the style `cutscene.bars`;
//   cutscene.veil                      the panel filled in the style `cutscene.veil`, at the fade's
//                                      opacity;
//   cutscene.line                      `who: text` in the style `cutscene.line`, centred on the panel.
// Each is shown only while it has something to show, so a scene that shows none of them needs none of
// the panels, and no ui; one that shows them throws when the scene lists no ui.
//
// `heightOf(plugins)` is the ground's height the row's points stand on: that of the ground the scene's
// `land` mod hands it, `mod(world, 'cutscene', 'land')` (terrain3d's `terrain3d.cutscene.ts`), or
// undefined while that mod has no ground yet; with no `land` named, the ground is flat at 0
// (`cutscene.sim.ts`). It reads the ground in its `tick`, before any plugin's `afterTick` of the
// frame, so it finds the ground as the frame before left it wherever the mod's plugin is listed, and
// asks no order of it; a scene that names a `land` whose plugin it does not list throws (`provided`).
//
// Preparing. While the scene runs, the row's `prepare` (a `prepare` cue's ground point) is handed to
// the land the `land` mod gives, `prepare(x, z)`, once for each point, so the land is made ready where
// the next cut lands (terrain3d's Prepared places). When the scene stops running, done or skipped, the
// land's place is let go, `unprepare()`, if it is still the one this asked for. A land without
// `prepare` makes nothing ready, and the cue does nothing on the page.
//
// `eye()` is `{ pos, dir }`: where render3d's camera stands and its world −z. It throws before the
// first tick. `close` gives the claim back, as `done` would.
import type * as THREE from 'three'
import type * as PIXI from 'pixi.js'
import type { Plugins } from '#engine/browser.ts'
import { mod, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import { level, pose, shaken, type Height, type Numbers } from './cutscene.sim.ts'

// The `land` mod: the ground as this page has it, or undefined while there is none yet; with
// `prepare`, `prepared` and `unprepare` when the land can be made ready ahead of a cut (Preparing).
export type Land = (plugins: Plugins) => {
  height(x: number, z: number): number
  prepare?(x: number, z: number): void; prepared?(): number[] | undefined; unprepare?(): void
} | undefined

// The ground the scene's `land` mod gives this page, or undefined with none named or none yet.
function landOf(plugins: Plugins) {
  const land = mod<Land>(plugins.wire.scene.world!, 'cutscene', 'land')
  if (!land) return undefined
  provided(plugins.wire.scene, 'cutscene', 'land')
  return land(plugins)
}

export function heightOf(plugins: Plugins): Height | undefined {
  if (!mod<Land>(plugins.wire.scene.world!, 'cutscene', 'land')) return () => 0
  const ground = landOf(plugins)
  return ground && ((x, z) => ground.height(x, z))
}

const same = (a: number[] | undefined, b: number[] | undefined) => !!a && !!b && a[0] === b[0] && a[1] === b[1]

const BEFORE = ['render3d']
const AFTER = ['chasecamera3d', 'ui']

export function cutscene() {
  let render3d: Plugins['render3d'] | undefined
  let taken: number | undefined // the fov the camera had when this took it; undefined while it holds none
  let asked: number[] | undefined // the point the land was last asked to prepare (Preparing)

  // The row's `prepare` handed to the land once, and the land's place let go when the scene stops.
  const prepare = (plugins: Plugins, d: any) => {
    if (d?.running && d.prepare && !same(d.prepare, asked)) {
      const ground = landOf(plugins)
      if (!ground) return
      ground.prepare?.(d.prepare[0], d.prepare[1])
      asked = d.prepare
    } else if (!d?.running && asked) {
      const ground = landOf(plugins)
      if (same(ground?.prepared?.(), asked)) ground!.unprepare?.()
      asked = undefined
    }
  }

  const letGo = () => {
    if (taken === undefined) return
    const holder = render3d.claimed()
    if (holder !== undefined && holder !== me) return
    const camera = render3d.camera as THREE.PerspectiveCamera
    render3d.release(me)
    camera.fov = taken
    camera.updateProjectionMatrix()
    taken = undefined
  }

  // The size of a panel, which a bar or the veil fills.
  const box = (ui: Plugins['ui'], panel: string): PIXI.Rectangle => {
    const b = ui.panel(panel).boundsArea
    if (!b) throw new Error(`ui panel ${panel} has no size for the cutscene to fill`)
    return b
  }

  const me = {
    tick(plugins: Plugins) {
      const order = plugins.wire.scene.plugins!
      const at = order.indexOf('cutscene')
      for (const p of BEFORE) if (order.includes(p) && order.indexOf(p) > at) throw new Error(`the cutscene is listed before ${p}`)
      for (const p of AFTER) if (order.includes(p) && order.indexOf(p) < at) throw new Error(`the cutscene is listed after ${p}`)
      render3d = plugins.render3d
      const d = plugins.wire.rows.find(r => r.kind === 'cutscene')?.data
      prepare(plugins, d)
      if (!d?.running || !d.shot) return letGo()
      if (!render3d) throw new Error('the cutscene places render3d\'s camera, and the scene lists no render3d')
      const camera = render3d.camera as THREE.PerspectiveCamera | undefined
      if (!camera) throw new Error('the cutscene places render3d\'s camera, and the scene gives no render3d prefab to make one')
      if (!render3d.claim(me)) return
      taken ??= camera.fov
      const height = heightOf(plugins)
      const p = height && pose(d, plugins.wire.rows, height)
      if (!p) return
      const s = shaken(d, (plugins.wire.scene.world!.cutscene as Numbers).tremor)
      camera.position.set(p.pos[0] + s[0], p.pos[1] + s[1], p.pos[2] + s[2])
      camera.quaternion.set(p.quat[0], p.quat[1], p.quat[2], p.quat[3])
      camera.fov = p.fov
      camera.updateProjectionMatrix()
    },
    afterTick(plugins: Plugins) {
      const d = plugins.wire.rows.find(r => r.kind === 'cutscene')?.data
      if (!d?.running) return
      const bars = level(d.bars, d.e), fade = level(d.fade, d.e)
      if (!(bars > 0 || fade > 0 || d.line)) return
      const ui = plugins.ui
      if (!ui) throw new Error('the cutscene shows bars, a veil or a line on ui\'s panels, and the scene lists no ui')
      const { Graphics, Text } = ui.PIXI as typeof PIXI
      if (bars > 0) {
        for (const [panel, bottom] of [['cutscene.top', false], ['cutscene.bottom', true]] as const) {
          const { width, height } = box(ui, panel)
          const h = bars * height
          ui.show(panel, 'bar', () => new Graphics()).clear().rect(0, bottom ? height - h : 0, width, h).fill(ui.style('cutscene.bars'))
        }
      }
      if (fade > 0) {
        const { width, height } = box(ui, 'cutscene.veil')
        ui.show('cutscene.veil', 'veil', () => new Graphics().rect(0, 0, width, height).fill(ui.style('cutscene.veil'))).alpha = fade
      }
      if (d.line) {
        const { width, height } = box(ui, 'cutscene.line')
        const text = ui.show('cutscene.line', 'line', () => new Text({ text: '', style: ui.style('cutscene.line'), anchor: 0.5 }))
        text.position.set(width / 2, height / 2)
        text.text = `${d.line.who}: ${d.line.text}`
      }
    },
    eye(): { pos: number[]; dir: number[] } {
      const camera = render3d?.camera as THREE.PerspectiveCamera | undefined
      if (!camera) throw new Error('the cutscene has no camera to read: it has not ticked, or render3d made none')
      const { Vector3 } = render3d.THREE as typeof THREE
      return { pos: camera.getWorldPosition(new Vector3()).toArray(), dir: camera.getWorldDirection(new Vector3()).toArray() }
    },
    close() { letGo() },
  }
  return me
}
