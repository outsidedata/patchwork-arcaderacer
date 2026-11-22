// The interface's words for ui3d: how the title's things come in and move, delivered to ui3d
// (`plugins/ui3d`, Words) when a scene names `interface` in `world.ui3d.mods.behaviors`.
//   reveal  { after, seconds, from, turn }   hidden until `after` seconds after the thing is first
//           shown, then over `seconds` it comes in from `from` (metres right, up and ahead of where it
//           stands, in the camera's frame) to where it stands, easing out as a cubic, turned `turn`
//           radians about its upright that unwind as it comes.
//   sway    { yaw, pitch, roll, phase, after }   it turns about its own middle, each of `yaw`, `pitch`
//           and `roll` `[radians, radians a second]` of a sine, `phase` radians along it, from `after`
//           seconds after it is first shown.
//   spin    { rate }   the thing itself turns on its upright `rate` radians a second from when it is
//           first shown; its hit box does not.
//   word    { node, face, side, env }   the thing, a copy of the title's model (a look's `model`), shown as
//           the word of its node `node` alone, the other nodes hidden, its faces and sides each a material
//           of its own set to the finishes `face` and `side` (the interface's `word`, `made` below),
//           reflecting the environment `env` (the interface's `environment`), from the first frame it is
//           shown; all of it let go when ui3d takes the thing out.
//   fade    { after, seconds }   every material of the thing is drawn at its own opacity times how far along
//           it is: nothing until `after` seconds after the thing is first shown, then over `seconds` up to
//           all of it, easing out as a cubic. ui3d puts each material's opacity back at the start of the
//           next frame, so the fade is this frame's alone.
// Each moves the thing's holder, which carries its hit box, but `spin`, which turns the object alone, `word`,
// which touches its materials, and `fade`, which touches their opacity.
// It is loaded on the server too, as every mod a scene names is, so it imports types alone.
import type * as THREE from 'three'
import type { Behaviors, Placed } from '#plugins/ui3d/ui3d.plugin.ts'
import type { Env, Finish, Word } from './interface.plugin.ts'

// The node `node` of the title's model `root` made a word of its own (the interface's `word`, which says
// how), with THREE `T`.
export function made(T: typeof THREE, root: THREE.Object3D, node: string, faceFinish: Finish, sideFinish: Finish, env?: THREE.Texture): Word {
  const it = root.getObjectByName(node)
  if (!it) throw new Error(`the title's model has no node ${node}`)
  const face = new T.MeshPhysicalMaterial({ name: 'face', vertexColors: Array.isArray(faceFinish.colour) })
  const side = new T.MeshPhysicalMaterial({ name: 'side' })
  const geometries: THREE.BufferGeometry[] = []
  it.traverse(o => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry = mesh.geometry.clone()
    geometries.push(mesh.geometry)
    if (Array.isArray(faceFinish.colour)) {
      const [lo, hi] = faceFinish.colour.map(c => new T.Color(c))
      const p = mesh.geometry.attributes.position
      mesh.geometry.computeBoundingBox()
      const { min, max } = mesh.geometry.boundingBox!
      const colours: number[] = []
      const at = new T.Color()
      for (let i = 0; i < p.count; i++) {
        at.copy(lo).lerp(hi, clamp01((p.getY(i) - min.y) / Math.max(1e-6, max.y - min.y)))
        colours.push(at.r, at.g, at.b)
      }
      mesh.geometry.setAttribute('color', new T.Float32BufferAttribute(colours, 3))
    }
    const own = (m: THREE.Material) => (m.name === 'face' ? face : side)
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material)
    mesh.frustumCulled = false
  })
  for (const m of [face, side]) m.envMap = env ?? null
  it.position.set(0, 0, 0)
  finish(face, faceFinish)
  finish(side, sideFinish)
  return { node: it, face, side, geometries }
}

// A finish set on a material (the interface's `finish`).
export function finish(m: THREE.MeshPhysicalMaterial, F: Finish) {
  const gradient = Array.isArray(F.colour)
  m.color.set(gradient ? '#ffffff' : (F.colour as string))
  m.emissive.set('#000000')
  m.metalness = F.metalness
  m.roughness = F.roughness
  m.envMapIntensity = F.env
  m.clearcoat = F.clearcoat ?? 0
}

// What the finishes reflect (the interface's `environment`), drawn through `renderer`'s PMREM; undefined
// with no renderer (in node).
export function environment(T: typeof THREE, renderer: THREE.WebGLRenderer | undefined, E: Env): THREE.Texture | undefined {
  if (!renderer) return
  const geometry = new T.SphereGeometry(E.size, 64, 32)
  const colours: number[] = []
  const at = new T.Color(), sky = new T.Color(E.sky), horizon = new T.Color(E.horizon), ground = new T.Color(E.ground), band = new T.Color(E.band)
  const p = geometry.attributes.position
  for (let i = 0; i < p.count; i++) {
    const a = Math.asin(Math.max(-1, Math.min(1, p.getY(i) / E.size)))
    if (Math.abs(a) < E.width / 2) at.copy(band)
    else if (a > 0) at.copy(horizon).lerp(sky, Math.min(1, a / (Math.PI / 2)))
    else at.copy(horizon).lerp(ground, Math.min(1, -a / (Math.PI / 8)))
    colours.push(at.r, at.g, at.b)
  }
  geometry.setAttribute('color', new T.Float32BufferAttribute(colours, 3))
  const room = new T.Scene()
  const material = new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })
  room.add(new T.Mesh(geometry, material))
  const pmrem = new T.PMREMGenerator(renderer)
  const target = pmrem.fromScene(room)
  pmrem.dispose()
  geometry.dispose()
  material.dispose()
  return target.texture
}

// The things made words, so each is made once, and each thing's environment, let go when it is.
const worded = new WeakSet<THREE.Object3D>()

const ease = (k: number) => 1 - (1 - k) ** 3
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const wave = ([amp, rate]: number[], t: number, phase: number) => amp * Math.sin(rate * t + phase)

type Reveal = { after: number; seconds: number; from: number[]; turn: number }
type Sway = { yaw: number[]; pitch: number[]; roll: number[]; phase: number; after: number }
type Spin = { rate: number }
type Fade = { after: number; seconds: number }
type Worded = { node: string; face: Finish; side: Finish; env: Env }

export const behaviors = (): Behaviors => ({
  word(n: Worded, it: Placed) {
    if (worded.has(it.object)) return
    worded.add(it.object)
    const env = environment(it.T, it.plugins.render3d?.renderer, n.env)
    const w = made(it.T, it.object, n.node, n.face, n.side, env)
    for (const child of it.object.children) child.visible = child === w.node
    // the thing's materials, geometries and environment let go when ui3d takes it out
    it.holder.addEventListener('removed', () => {
      for (const m of [w.face, w.side]) m.dispose()
      for (const g of w.geometries) g.dispose()
      env?.dispose()
    })
  },
  reveal(n: Reveal, it: Placed) {
    const k = (it.age - n.after) / n.seconds
    if (k <= 0) {
      it.holder.visible = false
      return
    }
    const left = 1 - ease(clamp01(k))
    const { T } = it
    it.holder.position.add(new T.Vector3().fromArray(n.from).multiplyScalar(left).applyQuaternion(it.camera.q))
    it.holder.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), left * n.turn))
  },
  sway(n: Sway, it: Placed) {
    const t = Math.max(0, it.age - n.after)
    const { T } = it
    it.holder.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(wave(n.pitch, t, n.phase), wave(n.yaw, t, n.phase + 0.7), wave(n.roll, t, n.phase + 1.9))))
  },
  fade(n: Fade, it: Placed) {
    const k = ease(clamp01((it.age - n.after) / n.seconds))
    it.object.traverse(o => {
      const m = (o as THREE.Mesh).material
      if (!m) return
      for (const one of Array.isArray(m) ? m : [m]) one.opacity *= k
    })
  },
  spin(n: Spin, it: Placed) {
    const { T } = it
    it.object.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), n.rate * it.age))
  },
})
