// render3d's extension: how a row of every scene that names render3d is moved, the 3D stage the game
// view draws on, and the types of render3d's prefab.
//
// The placer (`Editor.placeBy`), whether the game view draws the scene or not: a row whose `pos` is a
// world point [x, y, z] stands on it, and moved to another it is there.
//
// The stage, for every client that has render3d (`Editor.stage`):
//   ray      the line from the game's camera through a canvas point;
//   ground   where that line meets y = 0, and `plane` where it meets the level y of a point;
//   pick     the nearest visible drawing the line hits whose row the tags know (`editor/drawn.ts`),
//            with the world point it hit; `bounds` a row's box on the canvas;
//   overlay  a three.js scene an extension draws over the game in: drawn after render3d draws, with
//            the renderer's clear off, its depth cleared and no tone mapping, so it is always on top
//            in its own colours; it is not render3d's scene, so nothing in it is picked. It is the
//            stage's own: an extension draws into the overlay of each new stage;
//   mark     a line through world points and a dot on each in the overlay, the dots a few screen
//            pixels across however far off, a point [x, z] on the ground at y = 0;
//   orbit    a camera the editor drives while a tool is active: a right drag turns it, a middle drag
//            (or Shift and a right drag) pans it, the wheel zooms it and F frames the selection.
//
// The orbit follows the camera law: the camera sits rigidly at the pose, `pivot + dist·(−sin yaw·cos
// pitch, sin pitch, −cos yaw·cos pitch)`, its up +y, looking at the pivot, with nothing eased. While
// the editor drives it, it claims render3d's camera (`claim`), so the game's own cameras stand
// aside: it takes the camera from whoever holds it, the cutscene during a shot included, the moment
// it is driven, and an owner it took it from claims it again once it gives it back. It takes the camera no earlier than render3d's first tick, which makes it; with no pose of its own
// yet it starts from the view the camera had, turning about the first surface drawn in the middle
// of that view (the ground below, the wall ahead), or a point `LOOK` ahead when the view meets none.
// A surface is a visible drawing that writes depth, within the camera's `far`: a sky dome, which
// writes none so everything is drawn over it, a wash of particles or rain, and anything past `far`
// are not places to turn about. It places the camera after the plugins' ticks and the actors', at
// the start of the first `afterTick` of the scene's plugins, and again right before render3d draws:
// a game whose actor sets the camera in its own tick is drawn from the orbit too, and a plugin that
// turns things to the camera in its `afterTick` turns them to the orbit's. Let go, it gives the
// camera back where it took it and releases its claim; the game places it again from its next frame.
import * as THREE from 'three'
import type { Editor, Orbit, Placer, Pose, Stage } from '#editor/editor.ts'
import { owner, tagOf } from '#editor/drawn.ts'
import type { Plugins } from '#engine/browser.ts'
import { Fov, Shadows, Tone } from './render3d.components.tsx'

// How far one canvas pixel of a right drag turns the orbit, and one unit of the wheel zooms it.
const TURN = 0.005
const ZOOM = 0.0015
// The pitch it turns to at most, just short of straight up or down, where up and the view meet.
const PITCH = 1.55
// The distance a pose starts at when the middle of the camera's view meets nothing drawn, in world
// units; never nearer than four times the camera's `near`.
const LOOK = 10

type V3 = [number, number, number]
const isPoint = (v: unknown): v is V3 => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number')

// A row whose `pos` is a world point [x, y, z] stands on it, and is stood on another: the placer of
// every scene render3d draws, drawn or not.
const placer: Placer = {
  at: d => (isPoint(d.pos) ? [...d.pos] : undefined),
  axes: ['x', 'y', 'z'],
  to: (_d, p) => ({ pos: [p[0], p[1], p[2]] }),
}

export function render3d(ed: Editor) {
  ed.placeBy('render3d', placer)
  ed.field('render3d.fov', Fov)
  ed.field('render3d.tone', Tone)
  ed.field('render3d.shadows', Shadows)
  ed.bind('render3d', { 'camera.fov': 'render3d.fov', background: 'color', tone: 'render3d.tone', shadows: 'render3d.shadows' })
  ed.stage(plugins => (plugins.render3d ? stage3d(plugins) : undefined))
  const framed = () => {
    const sel = ed.selection
    return sel && 'id' in sel && sel.scene === ed.session?.viewing ? sel.id : undefined
  }
  ed.command({
    id: 'stage.frame',
    title: 'Frame Selection',
    menu: 'View',
    key: 'F',
    enabled: () => !!ed.staged?.orbit && ed.orbiting && framed() !== undefined,
    run: () => ed.staged?.orbit?.frame(framed()!),
  })
}

// The 3D stage of one client.
function stage3d(plugins: Plugins): Stage {
  const r = plugins.render3d
  const overlay = new THREE.Scene()
  // The orbit's claim on the camera is in this name.
  const who = { editor: 'orbit' }
  let want = false
  let holding = false
  let closed = false
  let pose: Pose | undefined
  let taken: { position: THREE.Vector3; quaternion: THREE.Quaternion; up: THREE.Vector3 } | undefined

  const cam = (): THREE.PerspectiveCamera | undefined => r.camera
  const caster = (x: number, y: number) => {
    const c = cam(), cv: HTMLCanvasElement | undefined = r.canvas
    if (!c || !cv) return undefined
    c.updateMatrixWorld()
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2((x / cv.width) * 2 - 1, 1 - (y / cv.height) * 2), c)
    return ray
  }
  // The canvas point in the middle of the view.
  const middle = (): [number, number] => {
    const cv: HTMLCanvasElement | undefined = r.canvas
    return cv ? [cv.width / 2, cv.height / 2] : [0, 0]
  }
  const level = (x: number, y: number, h: number) => {
    const hit = caster(x, y)?.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), new THREE.Vector3())
    return hit ? hit.toArray() : undefined
  }
  const visible = (o: THREE.Object3D) => {
    for (let at: THREE.Object3D | null = o; at; at = at.parent) if (!at.visible) return false
    return true
  }
  // Whether a hit is on something that writes depth, as a floor, a wall or a body does.
  const surface = (h: THREE.Intersection) => {
    const m = (h.object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    const at = Array.isArray(m) ? m[h.face?.materialIndex ?? 0] : m
    return !!at && at.depthWrite
  }
  // The world box of everything drawn for a row.
  const boxOf = (id: number) => {
    const box = new THREE.Box3()
    ;(r.scene as THREE.Scene).traverseVisible(o => {
      if (tagOf(o) === id && owner(o.parent) !== id) box.expandByObject(o)
    })
    return box
  }

  // ---------------------------------------------------------------- the orbit

  const place = () => {
    const c = cam()
    if (!holding || !pose || !c) return
    const { pivot, yaw, pitch, dist } = pose
    c.position.set(pivot[0] - dist * Math.sin(yaw) * Math.cos(pitch), pivot[1] + dist * Math.sin(pitch), pivot[2] - dist * Math.cos(yaw) * Math.cos(pitch))
    c.up.set(0, 1, 0)
    c.lookAt(pivot[0], pivot[1], pivot[2])
    c.updateMatrixWorld()
  }
  // The pose a camera has: turning about the first visible thing drawn in the middle of its view,
  // or about a point `LOOK` ahead when it meets nothing.
  const poseOf = (c: THREE.PerspectiveCamera): Pose => {
    const dir = c.getWorldDirection(new THREE.Vector3())
    const ray = caster(...middle())
    ;(r.scene as THREE.Scene).updateMatrixWorld()
    const hit = ray?.intersectObject(r.scene as THREE.Scene, true).find(h => h.distance > c.near && h.distance < c.far && visible(h.object) && surface(h))
    const dist = hit ? hit.distance : Math.max(LOOK, c.near * 4)
    return { pivot: c.position.clone().addScaledVector(dir, dist).toArray(), yaw: Math.atan2(dir.x, dir.z), pitch: Math.asin(Math.max(-1, Math.min(1, -dir.y))), dist }
  }
  const take = () => {
    const c = cam()
    if (!want || holding || closed || !c) return
    const held = r.claimed()
    if (held !== undefined && held !== who) r.release(held)
    if (!r.claim(who)) return
    holding = true
    taken = { position: c.position.clone(), quaternion: c.quaternion.clone(), up: c.up.clone() }
    pose ??= poseOf(c)
    place()
  }
  const give = () => {
    if (!holding) return
    const c = cam()
    if (c && taken) {
      c.position.copy(taken.position)
      c.quaternion.copy(taken.quaternion)
      c.up.copy(taken.up)
      c.updateMatrixWorld()
    }
    holding = false
    taken = undefined
    r.release(who)
  }
  // Each frame, before anything is drawn from the camera: taken when it can be, and placed.
  const ready = () => {
    if (closed) return
    take()
    place()
  }
  const drawOverlay = () => {
    const renderer: THREE.WebGLRenderer | undefined = r.renderer
    const c = cam()
    if (closed || !renderer || !c || !overlay.children.length) return
    const clears = renderer.autoClear, tone = renderer.toneMapping
    renderer.setRenderTarget(null)
    renderer.autoClear = false
    renderer.toneMapping = THREE.NoToneMapping
    renderer.clearDepth()
    renderer.render(overlay, c)
    renderer.autoClear = clears
    renderer.toneMapping = tone
  }

  // The hooks it runs in: the first `afterTick` of the scene's plugins places the camera first, and
  // render3d's places it right before drawing and draws the overlay after.
  const names: string[] = plugins.wire.scene.plugins ?? []
  const first = names.map(n => plugins[n]).find(p => p && typeof p.afterTick === 'function')
  const undo: (() => void)[] = []
  const wrap = (p: Record<string, unknown>, f: (was: (...a: unknown[]) => unknown, args: unknown[]) => unknown) => {
    const was = p.afterTick as (...a: unknown[]) => unknown
    const mine = function (this: unknown, ...args: unknown[]) { return f(was.bind(this), args) }
    p.afterTick = mine
    undo.push(() => { if (p.afterTick === mine) p.afterTick = was })
  }
  if (first && first !== r) wrap(first, (was, args) => { ready(); return was(...args) })
  wrap(r, (was, args) => {
    ready()
    const out = was(...args)
    drawOverlay()
    return out
  })

  const orbit: Orbit = {
    pose: () => (pose ? structuredClone(pose) : undefined),
    put(p) {
      pose = structuredClone(p)
      place()
    },
    turn(dx, dy) {
      if (!pose) return
      pose.yaw -= dx * TURN
      pose.pitch = Math.max(-PITCH, Math.min(PITCH, pose.pitch + dy * TURN))
      place()
    },
    // The pivot moves across the view so the point under the pointer at the pivot's distance stays
    // under it.
    pan(dx, dy) {
      const c = cam(), cv: HTMLCanvasElement | undefined = r.canvas
      if (!pose || !c || !cv) return
      const per = (2 * pose.dist * Math.tan((c.fov * Math.PI) / 360)) / cv.height
      const right = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 0)
      const up = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 1)
      const p = new THREE.Vector3().fromArray(pose.pivot).addScaledVector(right, -dx * per).addScaledVector(up, dy * per)
      pose.pivot = p.toArray()
      place()
    },
    zoom(dy) {
      const c = cam()
      if (!pose || !c) return
      pose.dist = Math.max(c.near * 2, Math.min(c.far / 2, pose.dist * Math.exp(dy * ZOOM)))
      place()
    },
    frame(id) {
      const c = cam()
      const box = boxOf(id)
      if (!pose || !c || box.isEmpty()) return
      const s = box.getBoundingSphere(new THREE.Sphere())
      pose.pivot = s.center.toArray()
      pose.dist = Math.max(c.near * 4, (Math.max(s.radius, c.near) / Math.sin((c.fov * Math.PI) / 360)) * 1.6)
      place()
    },
    drive(on) {
      want = on
      if (on) take()
      else give()
    },
  }

  return {
    ray(x, y) {
      const ray = caster(x, y)?.ray
      return ray && { origin: ray.origin.toArray(), dir: ray.direction.toArray() }
    },
    ground: (x, y) => level(x, y, 0),
    plane: (x, y, through) => level(x, y, through[1]),
    pick(x, y) {
      const ray = caster(x, y)
      if (!ray) return undefined
      for (const h of ray.intersectObject(r.scene as THREE.Scene, true)) {
        if (!visible(h.object)) continue
        const id = owner(h.object)
        if (id !== undefined) return { id, point: h.point.toArray() }
      }
      return undefined
    },
    bounds(id) {
      const c = cam(), cv: HTMLCanvasElement | undefined = r.canvas
      if (!c || !cv) return undefined
      const box = boxOf(id)
      if (box.isEmpty()) return undefined
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (let i = 0; i < 8; i++) {
        const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(c)
        const px = ((p.x + 1) / 2) * cv.width, py = ((1 - p.y) / 2) * cv.height
        x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py)
      }
      return [x0, y0, x1 - x0, y1 - y0]
    },
    overlay,
    orbit,
    mark(points, color) {
      const at = points.flatMap(p => (p.length === 2 ? [p[0], 0, p[1]] : [p[0], p[1], p[2]]))
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(at, 3))
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, depthTest: false }))
      const dots = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 5, sizeAttenuation: false, depthTest: false }))
      overlay.add(line, dots)
      let gone = false
      return () => {
        if (gone) return
        gone = true
        overlay.remove(line, dots)
        geometry.dispose()
        ;(line.material as THREE.Material).dispose()
        ;(dots.material as THREE.Material).dispose()
      }
    },
    close() {
      give()
      closed = true
      for (const f of undo.splice(0)) f()
      overlay.clear()
    },
  }
}
