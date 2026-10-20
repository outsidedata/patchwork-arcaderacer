// The title screen's look, over the title's race once its intro is done: the game's name and each
// course's word in 3D, and for the leader while the match is in the lobby (`leads` in the match plugin)
// the course select: the tagline, the courses' words, and a hint. What else the lobby shows is the match
// plugin's.
//
// When it shows. Nothing of it shows while the scene's intro (its `cutscene` row) has not finished.
// From the first frame it is done it comes up on this page's clock: the 2D on the `title` panel, which
// `world.ui` makes modal, after `appear.after` seconds, over `appear.seconds`, fading in and everything
// on it rising `appear.rise` pixels into place; the name in 3D over `name.reveal`; and the courses'
// words `words.reveal.after` seconds later, each `words.reveal.stagger` after the last, over
// `words.reveal.seconds`. A page that arrives after the intro shows it so from its first frame.
//
// The 3D. Every word is a node of the loader's model `model` (made by `assets/title/title.py`, the
// name's node `name` and each course's its scene), drawn in render3d's overlay, over the race and never
// behind any of it, held in the camera's frame: its `at` is metres right, up and ahead (−z) of the
// camera, its face toward it, `scale` times the model's metre-tall capitals. It comes in from `from`
// in the same frame (the name's `reveal.from`, a word's `at` plus `words.reveal.from`), easing out as a
// cubic, turned `turn` radians about its upright that unwind as it comes, then sways about its own
// middle, `sway.yaw`, `pitch` and `roll` each `[radians, radians a second]` of a sine, each word a
// phase of its own. The overlay's camera is render3d's own, put where the main camera stands each
// frame; its `near` and `far` are this look's, `overlay` [near, far].
//
// The finish. Each word's faces, `face`, and walls and bevel, `side`, are its own copies of the model's
// materials, set to a finish { colour, metalness, roughness, env, clearcoat? }: `colour` one colour, or
// [bottom, top], a gradient up the word's capitals, laid in the word's own copy of its geometry's
// colours. The name's are `name.face` (chrome) and `name.side` (candy red); a course's face is its
// own `face`, its side `words.side`. Every finish reflects an environment made once from `env`: a
// sphere round them coloured from `ground` below to `horizon` at the level and `sky` above, with a
// band of `band` round the level `width` radians tall, so chrome shows a bright line across it as
// polished metal does, drawn through the renderer's PMREM; with no renderer (in node) they reflect
// nothing. A key light `key` (a point light of `colour`, `power` candela, reaching `distance` metres,
// at `at` in the camera's frame) lights them; a sweep light, `sweep`, crosses the name from `from` to
// `to` (the camera's frame) over `seconds`, first `at` seconds after the name's reveal begins and
// every `every` after, its power `power` × sin(πu) of the way u across.
//
// The course select. Each course's word is a button: a ui button in the `world.ui` style `button`
// (nothing drawn, its fills clear), laid each frame over the word's box as the camera draws it
// (`render3d.project` of its corners), so the pointer presses the word it is over, and the ui's keys
// move the focus from word to word and press the one focused (`plugins/ui`). A press sends `start`
// with its course at the title's `match` row, which the match addon answers. The words' buttons are
// shown first, so the first course takes the focus. The focused word grows to `words.focus.scale`
// and its face glows `words.focus.glow` of its own colour; the others are drawn at `words.dim` of their
// colour. While the course select is not shown (to a seat that is not the leader, or the match not in
// the lobby) the words are drawn as they are, none focused and none dimmed.
//
// The camera, once the intro is done: this claims render3d's camera and holds it where the intro's
// last shot left it, the shot's offset from the car it follows and its look and fov (the cutscene's
// `view`, on its flat ground), the offset turned about the car's upright `camera.orbit` radians a
// second on this page's clock from the frame it took the camera, so the race behind the title sweeps
// round. It places nothing on a frame whose rows lack that car, and lets go when the row goes.
//
// Its definition, every word, place and number, as above: appear, band { top, color, alpha: [from, to],
// steps } (under it all, the screen darkened from `top` down, `steps` strips of `color`, from `alpha[0]`
// to `alpha[1]`), tagline and hint { at, anchor, text, style }, model, overlay, env, key, sweep, sway,
// name { text, at, scale, reveal { seconds, from, turn }, face, side }, words { scale, side, dim,
// focus { scale, glow }, reveal { after, stagger, seconds, from, turn } }, courses [{ scene, word, at,
// face }], button, camera { orbit }.
import type * as PIXI from 'pixi.js'
import type * as THREE from 'three'
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { def, json } from '#plugins/loader/loader.sim.ts'
import { view, type Cue, type Script } from '#plugins/cutscene/cutscene.sim.ts'
import { leads } from './plugins/match/match.sim.ts'

type Text = { at: number[]; anchor: number[]; text: string; style: string }
type Finish = { colour: string | string[]; metalness: number; roughness: number; env: number; clearcoat?: number }
type Reveal = { seconds: number; from: number[]; turn: number }
type Course = { scene: string; word: string; at: number[]; face: Finish }
type Card = {
  appear: { after: number; seconds: number; rise: number }
  band: { top: number; color: number; alpha: number[]; steps: number }
  tagline: Text; hint: Text
  model: string; overlay: number[]
  env: { sky: string; horizon: string; ground: string; band: string; width: number; size: number }
  key: { colour: string; power: number; at: number[]; distance: number }
  sweep: { colour: string; power: number; from: number[]; to: number[]; at: number; seconds: number; every: number; distance: number }
  sway: { yaw: number[]; pitch: number[]; roll: number[] }
  name: { text: string; at: number[]; scale: number; reveal: Reveal; face: Finish; side: Finish }
  words: { scale: number; side: Finish; dim: number; focus: { scale: number; glow: number }; reveal: Reveal & { after: number; stagger: number } }
  courses: Course[]
  button: string
  camera: { orbit: number }
}

// One word in 3D: its node, its own face and side materials, and its finishes.
type Word = { node: THREE.Object3D; face: THREE.MeshPhysicalMaterial; side: THREE.MeshPhysicalMaterial; faceFinish: Finish; sideFinish: Finish }
type Made = { group: THREE.Group; name: Word; words: Word[]; key: THREE.PointLight; sweep: THREE.PointLight; env?: THREE.Texture; geometries: THREE.BufferGeometry[] }

let done = 0 // this page's clock the first frame the intro was over, ms; 0 not yet
let held = 0 // this page's clock the first frame it held the camera, ms; 0 not yet
let holder: object | undefined
let made: Made | undefined
let focused = -1 // the course whose word the ui has focused; −1 none

// The cue file's last shot: the one the title's camera carries on from, which follows a car.
export function lastShot(file: Script): Cue {
  const shots = file.cues.filter(c => c.do === 'shot')
  if (!shots.length) throw new Error('the intro has no shot for the title\'s camera to carry on from')
  const shot = shots.reduce((a, b) => (b.at >= a.at ? b : a))
  if (shot.follows === undefined || shot.frame === 'body') throw new Error(`the intro's last shot, ${shot.name}, is the title's, and follows a car with an offset in the world's axes`)
  return shot
}

// The offset [x, y, z] turned `a` radians about the upright, as a yaw turns a heading.
const turned = ([x, y, z]: number[], a: number) => [x * Math.cos(a) + z * Math.sin(a), y, z * Math.cos(a) - x * Math.sin(a)]
const ease = (k: number) => 1 - (1 - k) ** 3
const wave = ([amp, rate]: number[], t: number, phase = 0) => amp * Math.sin(rate * t + phase)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function camera(plugins: Plugins, d: any, orbit: number, now: number) {
  const { render3d, wire } = plugins
  const cam = render3d.camera as THREE.PerspectiveCamera | undefined
  if (!cam) return
  holder ??= {}
  if (!render3d.claim(holder)) return
  held ||= now
  const file = json(wire, wire.scene.world!.cutscene.script) as Script
  const shot = lastShot(file)
  const a = (orbit * (now - held)) / 1000
  const to = { pos: turned(shot.pos, a), look: shot.look, fov: shot.fov ?? file.fov, head: file.head, follows: shot.follows }
  const p = view(to, d.cast, wire.rows, () => 0)
  if (!p) return
  cam.position.set(p.pos[0], p.pos[1], p.pos[2])
  cam.quaternion.set(p.quat[0], p.quat[1], p.quat[2], p.quat[3])
  if (cam.fov !== p.fov) {
    cam.fov = p.fov
    cam.updateProjectionMatrix()
  }
}

// The environment the finishes reflect: a sphere seen from inside, coloured by height, through PMREM.
function environment(plugins: Plugins, E: Card['env']): THREE.Texture | undefined {
  const { render3d } = plugins
  const renderer = render3d.renderer as THREE.WebGLRenderer | undefined
  if (!renderer) return
  const T = render3d.THREE as typeof THREE
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

// A node of the model made a word of its own: its geometry copied, coloured up its capitals by its
// face's gradient, its materials its own.
function word(plugins: Plugins, root: THREE.Object3D, node: string, faceFinish: Finish, sideFinish: Finish, geometries: THREE.BufferGeometry[], env?: THREE.Texture): Word {
  const T = plugins.render3d.THREE as typeof THREE
  const it = root.getObjectByName(node)
  if (!it) throw new Error(`the title's model has no node ${node}`)
  const face = new T.MeshPhysicalMaterial({ name: 'face', vertexColors: Array.isArray(faceFinish.colour) })
  const side = new T.MeshPhysicalMaterial({ name: 'side' })
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
  return { node: it, face, side, faceFinish, sideFinish }
}

function make(plugins: Plugins, C: Card): Made | undefined {
  const { render3d, loader } = plugins
  if (!loader.ready(C.model)) {
    loader.load(C.model).catch(() => {})
    return
  }
  const T = render3d.THREE as typeof THREE
  const root = loader.model(C.model).scene as THREE.Object3D
  const env = environment(plugins, C.env)
  const geometries: THREE.BufferGeometry[] = []
  const name = word(plugins, root, 'name', C.name.face, C.name.side, geometries, env)
  const words = C.courses.map(c => word(plugins, root, c.scene, c.face, C.words.side, geometries, env))
  const group = new T.Group()
  group.add(name.node, ...words.map(w => w.node))
  const key = new T.PointLight(C.key.colour, C.key.power, C.key.distance, 2)
  const sweep = new T.PointLight(C.sweep.colour, 0, C.sweep.distance, 2)
  group.add(key, sweep)
  group.visible = false
  render3d.overlay.scene.add(group)
  return { group, name, words, key, sweep, env, geometries }
}

// A finish set on a material, `light` times its colour and `glow` of it given off.
function finish(m: THREE.MeshPhysicalMaterial, F: Finish, light = 1, glow = 0) {
  const gradient = Array.isArray(F.colour)
  m.color.set(gradient ? '#ffffff' : (F.colour as string)).multiplyScalar(light)
  m.emissive.set(gradient ? (F.colour as string[])[1] : (F.colour as string)).multiplyScalar(glow)
  m.metalness = F.metalness
  m.roughness = F.roughness
  m.envMapIntensity = F.env
  m.clearcoat = F.clearcoat ?? 0
}

// A word placed in the camera's frame: from `from` to `at` as `k` goes 0 to 1, turned `turn` that
// unwinds, swaying `t` seconds into its sway with `phase`, `scale` big.
function place(T: typeof THREE, w: Word, cam: { p: THREE.Vector3; q: THREE.Quaternion }, from: number[], at: number[], k: number, turn: number, sway: Card['sway'], t: number, phase: number, scale: number) {
  const e = ease(clamp01(k))
  w.node.visible = k > 0
  w.node.position.copy(new T.Vector3().fromArray(from).lerp(new T.Vector3().fromArray(at), e)).applyQuaternion(cam.q).add(cam.p)
  const s = new T.Euler(wave(sway.pitch, t, phase), wave(sway.yaw, t, phase + 0.7) + (1 - e) * turn, wave(sway.roll, t, phase + 1.9))
  w.node.quaternion.copy(cam.q).multiply(new T.Quaternion().setFromEuler(s))
  w.node.scale.setScalar(scale)
}

export function setup() {
  done = held = 0
  made = undefined
  focused = -1
}

export function tick(row: Row, plugins: Plugins) {
  const { ui, wire, render3d } = plugins
  const cut = wire.rows.find(r => r.kind === 'cutscene')?.data
  if (!cut?.done) return
  const now = performance.now()
  done ||= now
  const since = (now - done) / 1000
  const C = def(wire, row.kind) as Card
  camera(plugins, cut, C.camera.orbit, now)
  const T = render3d.THREE as typeof THREE
  const cam3 = render3d.camera as THREE.PerspectiveCamera | undefined
  const match = wire.rows.find(r => r.kind === 'match')
  const choosing = match?.data.match === 'lobby' && leads(wire.rows)

  // The 3D: the name and the courses' words in the overlay, in the camera's frame.
  made ??= cam3 ? make(plugins, C) : undefined
  if (made && cam3) {
    made.group.visible = true
    const over = render3d.overlay.camera as THREE.PerspectiveCamera
    if (over.near !== C.overlay[0] || over.far !== C.overlay[1]) {
      over.near = C.overlay[0]
      over.far = C.overlay[1]
      over.updateProjectionMatrix()
    }
    cam3.updateMatrixWorld()
    const frame = { p: new T.Vector3(), q: new T.Quaternion() }
    cam3.matrixWorld.decompose(frame.p, frame.q, new T.Vector3())
    const N = C.name
    const kName = since / N.reveal.seconds
    const settled = Math.max(0, since - N.reveal.seconds)
    place(T, made.name, frame, N.reveal.from, N.at, kName, N.reveal.turn, C.sway, settled, 0, N.scale)
    finish(made.name.face, N.face)
    finish(made.name.side, N.side)
    const W = C.words
    C.courses.forEach((c, i) => {
      const w = made!.words[i]
      const start = W.reveal.after + i * W.reveal.stagger
      const k = (since - start) / W.reveal.seconds
      const from = c.at.map((v, j) => v + W.reveal.from[j])
      const on = choosing && focused === i
      place(T, w, frame, from, c.at, k, W.reveal.turn, C.sway, Math.max(0, since - start - W.reveal.seconds), 1.3 * (i + 1), W.scale * (on ? W.focus.scale : 1))
      const light = choosing && focused >= 0 && !on ? W.dim : 1
      finish(w.face, c.face, light, on ? W.focus.glow : 0)
      finish(w.side, W.side, light)
    })
    const ahead = (p: number[]) => new T.Vector3().fromArray(p).applyQuaternion(frame.q).add(frame.p)
    made.key.position.copy(ahead(C.key.at))
    const S = C.sweep
    const v = since >= S.at ? ((since - S.at) % S.every) / S.seconds : 1
    if (v < 1) {
      made.sweep.position.copy(ahead(new T.Vector3().fromArray(S.from).lerp(new T.Vector3().fromArray(S.to), v).toArray()))
      made.sweep.intensity = S.power * Math.sin(Math.PI * v)
    } else made.sweep.intensity = 0
  }

  // The 2D, on the title panel.
  const A = C.appear
  const k = clamp01((since - A.after) / A.seconds)
  if (k <= 0) return
  const lift = A.rise - (1 - (1 - k) ** 3) * A.rise
  ui.panel('title').alpha = k
  const text = (key: string, spec: Text) => {
    const t = ui.show('title', key, () => new (ui.PIXI as typeof PIXI).Text({ text: spec.text, style: ui.style(spec.style) })) as PIXI.Text
    t.anchor.set(spec.anchor[0], spec.anchor[1])
    t.position.set(spec.at[0], spec.at[1] + lift)
    return t
  }
  if (choosing) {
    // the words' buttons first, so the first course takes the focus; each laid over its word's box
    C.courses.forEach((c, i) => {
      const b = ui.show('title', `course.${i}`, () => {
        const it = ui.button({ ...ui.style(C.button), label: '' }).on('pointertap', () => wire.send(match.id, 'start', c.scene))
        it.on('focus', () => { focused = i })
        it.on('blur', () => { if (focused === i) focused = -1 })
        return it
      }) as PIXI.Container
      const node = made?.words[i].node
      if (!node || !node.visible) return
      node.updateMatrixWorld(true)
      const box = new T.Box3().setFromObject(node)
      const xs: number[] = [], ys: number[] = []
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const s = render3d.project([x, y, z])
        xs.push(s.x)
        ys.push(s.y)
      }
      const x0 = Math.min(...xs), y0 = Math.min(...ys)
      b.position.set(x0, y0)
      b.hitArea = new (ui.PIXI as typeof PIXI).Rectangle(0, 0, Math.max(...xs) - x0, Math.max(...ys) - y0)
    })
    text('tagline', C.tagline)
    text('hint', C.hint)
  } else focused = -1
  const B = C.band
  const band = ui.show('title', 'band', () => {
    const g = new (ui.PIXI as typeof PIXI).Graphics()
    const [w, h] = wire.scene.world!.ui.panels.title.size
    const strip = (h - B.top) / B.steps
    for (let i = 0; i < B.steps; i++) g.rect(0, B.top + i * strip, w, strip + 1).fill({ color: B.color, alpha: B.alpha[0] + ((B.alpha[1] - B.alpha[0]) * i) / Math.max(1, B.steps - 1) })
    return g
  }) as PIXI.Graphics
  band.zIndex = -1
  band.parent?.sortChildren()
}

export function remove(plugins: Plugins) {
  const { render3d } = plugins
  if (holder) render3d.release(holder)
  holder = undefined
  if (made) {
    render3d.overlay.scene.remove(made.group)
    for (const w of [made.name, ...made.words]) { w.face.dispose(); w.side.dispose() }
    for (const g of made.geometries) g.dispose()
    made.key.dispose()
    made.sweep.dispose()
    made.env?.dispose()
  }
  made = undefined
  done = held = 0
  focused = -1
}
