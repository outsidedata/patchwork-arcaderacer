// The title screen's look, over the title's race once its intro is done: the game's name and each
// course's word in 3D, and for the leader while the match is in the lobby (`leads` in the match plugin)
// the course select: the courses' words. What else the lobby shows is the match plugin's.
//
// The screens, in order, this page's own while the match is in the lobby:
//   title    the game's name, ui3d's look `name.look` of the scene's looks file (`assets/ui3d.json`: the
//            name's word, its reveal, sway and smoke), the one thing of the menu. A press on it starts
//            the game: the leader goes to the course select, any other page to the car select.
//   courses  the leader's: the courses' words. A press on one sends `choose` with its course, which the
//            match tells every seat, and goes to the car select.
//   cars     the car select. A press on a car sends `pick` with it. The seat is then on the match
//            plugin's lobby: who is here and what each picked, and what the match waits on; the leader's
//            START (the match plugin) races the chosen course once every seat has picked. Behind them
//            the courses' words stand, none selected. Solo (`index.html`, the match row's `solo`) there
//            is no lobby: the pick itself starts the race on the chosen course.
// Past the title the name stands over the select, the look `name.top`. Out of the lobby (racing, the
// results) every page is on the title again.
//
// When it shows. Nothing of it shows while the scene's intro (its `cutscene` row) has not finished.
// From the first frame it is done it comes up on this page's clock: the 2D on the `title` panel, which
// `world.ui` makes modal, after `appear.after` seconds, fading in over `appear.seconds`; the name in
// 3D over `name.reveal`; and the courses' words `words.reveal.after` seconds after they are first
// shown, each `words.reveal.stagger` after the last, over `words.reveal.seconds`. A page that arrives
// after the intro shows it so from its first frame.
//
// The 3D. Every word is a node of the loader's model `model` (made by `assets/title/title.py`, the
// name's node `name` and each course's its scene), made a word by the interface plugin
// (`plugins/interface`, `word`) with its finishes, and shown by ui3d (`plugins/ui3d`) in render3d's
// overlay, over the race and never behind any of it, held in the camera's frame: its `at` is metres
// right, up and ahead (−z) of the camera, its face toward it, `scale` times the model's metre-tall
// capitals. It comes in by the interface's `reveal`, from `from` (metres from where it stands, in the
// camera's frame; the name's `reveal.from`, a word's `words.reveal.from`), turned `turn` radians about
// its upright that unwind as it comes, then sways about its own middle by the interface's `sway`,
// `sway.yaw`, `pitch` and `roll` each `[radians, radians a second]` of a sine, each word a phase of its
// own, from the moment it has come in. The overlay's `near` and `far` are `world.ui3d.overlay`.
//
// The finish. Each word's faces and walls are set to its finishes once, when it is made: the name's by
// its look's `word` (chrome faces, candy red sides); a course's face its own `face`, its side
// `words.side`. Every finish reflects the interface's environment made once from `env`. A key light
// `key` (a point light of `colour`, `power` candela, reaching `distance` metres, at `at` in the camera's
// frame) lights them; a sweep light, `sweep`, crosses the name from `from` to `to` (the camera's frame)
// over `seconds`, first `at` seconds after the name's reveal begins and every `every` after, its power
// `power` × sin(πu) of the way u across. Both are shown by ui3d, as the words are.
//
// The course select. Each course's word can be selected (ui3d's `select`): the pointer over it selects
// it, ui3d's keys move the selection from word to word in their order and press the one selected, and
// so does a click on it. A press chooses its course (The screens). The first course is selected first. The selected word grows to
// `words.focus.scale` and its face glows `words.focus.glow` of its face's top colour (ui3d's `grow` and
// `glow`); the others are drawn at `words.dim` of their colour (`dim`). While the course select is not
// shown (to a seat that is not the leader, or the match not in the lobby) the words are drawn as they
// are, none selected and none dimmed.
//
// The car select. On the `cars` screen while this page's connection has picked no car (its roster
// entry's `car`, `entryOf` in the match plugin), the courses' words are not shown, and in their place
// is `lineup`: the cars of the `match` definition's `cars` in a line across the overlay, in
// their order, each the car file it names (`assets/cars/<car>.json`) drawn alone as the drive plugin
// draws the kind `lineup.kind` (drive's `model`), `scale` times its size. The selected car stands at
// `at` in the camera's frame, the others `gap` metres apart along the camera's right, so the car
// before it is on its left and the car after it on its right; the line slides so the selected car
// comes to `at`, closing `slide` of the way a second. Only the cars within `show` of the selected one
// are drawn, and no car stands behind another; ui3d's keys still move the selection along every car.
// Each car turns on its upright `spin` radians a second (the interface's `spin`); the cars reflect the
// finishes' environment, which is the overlay's own. Each car's name is the node of the title's model
// named as its car (made from the car file's `name` by `assets/title/title.py`), `name.below` metres
// under the car, `name.scale` times the capitals' metre, its finishes `name.face` and `name.side`,
// swaying as the words do. The line comes in as the words do, from `reveal.from` over
// `reveal.seconds`, starting `reveal.after` seconds after each car is first shown. Each car can be
// selected, the first first; a press sends `pick` with its car at the title's `match` row, which the
// match addon answers (The screens).
//
// The keys of ui3d's selection. The things that can be selected are the name, keyed `name`, the course
// words, keyed `course.<i>`, and the cars, keyed `car.<i>`, `i` each one's place in its list.
//
// The camera, once the intro is done: this claims render3d's camera and holds it where the intro's
// last shot left it, the shot's offset from the car it follows and its look and fov (the cutscene's
// `view`, on its flat ground), the offset turned about the car's upright `camera.orbit` radians a
// second on this page's clock from the frame it took the camera, so the race behind the title sweeps
// round. It places nothing on a frame whose rows lack that car, and lets go when the row goes.
//
// Its definition, every word, place and number, as above: appear, band { top, color, alpha: [from, to],
// steps } (under it all, the screen darkened from `top` down, `steps` strips of `color`, from `alpha[0]`
// to `alpha[1]`), model, env, key, sweep, sway,
// name { text, look, top } (the name's words in title.py, and its two looks), words { scale, side, dim,
// focus { scale, glow }, reveal { after, stagger, seconds, from, turn } }, courses [{ scene, word, at,
// face }], camera { orbit }, lineup { kind, at, gap, show, scale, spin, slide,
// reveal { after, seconds, from }, name { below, scale, face, side } }.
import type * as PIXI from 'pixi.js'
import type * as THREE from 'three'
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { def, json } from '#plugins/loader/loader.sim.ts'
import { view, type Cue, type Script } from '#plugins/cutscene/cutscene.sim.ts'
import type { Look } from '#plugins/ui3d/ui3d.plugin.ts'
import type { Env, Finish, Interface, Word } from './plugins/interface/interface.plugin.ts'
import { entryOf, leads } from './plugins/match/match.sim.ts'

type Reveal = { seconds: number; from: number[]; turn: number }
type Course = { scene: string; word: string; at: number[]; face: Finish }
type Card = {
  appear: { after: number; seconds: number }
  band: { top: number; color: number; alpha: number[]; steps: number }
  model: string
  env: Env
  key: { colour: string; power: number; at: number[]; distance: number }
  sweep: { colour: string; power: number; from: number[]; to: number[]; at: number; seconds: number; every: number; distance: number }
  sway: { yaw: number[]; pitch: number[]; roll: number[] }
  name: { text: string; look: string; top: string }
  words: { scale: number; side: Finish; dim: number; focus: { scale: number; glow: number }; reveal: Reveal & { after: number; stagger: number } }
  courses: Course[]
  camera: { orbit: number }
  lineup: {
    kind: string; at: number[]; gap: number; show: number; scale: number; spin: number; slide: number
    reveal: { after: number; seconds: number; from: number[] }
    name: { below: number; scale: number; face: Finish; side: Finish }
  }
}

// One car of the car select: its car, the group ui3d shows it in, its model as drive drew it, put in the
// group once it has come (undefined until then), and its name.
type Shown = { car: string; group: THREE.Group; model?: { root: THREE.Object3D; dispose(): void }; name: Word }
type Made = { words: Word[]; cars: Shown[]; key: THREE.PointLight; sweep: THREE.PointLight; env?: THREE.Texture }
// The screen this page is on while the match is in the lobby: the title, the course select (the
// leader's alone), then the car select.
type Screen = 'title' | 'courses' | 'cars'

let done = 0 // this page's clock the first frame the intro was over, ms; 0 not yet
let held = 0 // this page's clock the first frame it held the camera, ms; 0 not yet
let holder: object | undefined
let made: Made | undefined
let slid = 0 // where the line stands now: the car (a fraction between two while it slides) at `lineup.at`
let last = 0 // this page's clock the last frame the line slid, ms
let screen: Screen = 'title'

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

function make(plugins: Plugins, C: Card): Made | undefined {
  const { render3d, loader } = plugins
  const face = plugins.interface as Interface
  if (!loader.ready(C.model)) {
    loader.load(C.model).catch(() => {})
    return
  }
  const T = render3d.THREE as typeof THREE
  const root = loader.model(C.model).scene as THREE.Object3D
  const env = face.environment(C.env)
  const words = C.courses.map(c => face.word(root, c.scene, c.face, C.words.side, env))
  const N = C.lineup.name
  const cars: Shown[] = (def(plugins.wire, 'match').cars as string[]).map(car => ({ car, group: new T.Group(), name: face.word(root, car, N.face, N.side, env) }))
  const key = new T.PointLight(C.key.colour, C.key.power, C.key.distance, 2)
  const sweep = new T.PointLight(C.sweep.colour, 0, C.sweep.distance, 2)
  // the cars of the car select reflect the finishes' environment, as the words do
  plugins.ui3d.environment(env ?? null)
  return { words, cars, key, sweep, env }
}

// The sway of a thing `phase` radians along it, from `after` seconds after it is first shown.
const swaying = (C: Card, phase: number, after: number) => ({ ...C.sway, phase, after })

// The car select's line, shown for this frame: each car's model asked of drive until it has come, the
// line slid toward the selected car, each car spinning, each name under its car, the cars past `show`
// hidden; a car pressed is picked.
function lineup(plugins: Plugins, C: Card, m: Made, match: Row, now: number) {
  const { ui3d, wire } = plugins
  const L = C.lineup
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
  last = now
  const sel = ui3d.selected() as string | undefined
  const aimed = sel?.startsWith('car.') ? Number(sel.slice(4)) : Math.round(slid)
  slid += (aimed - slid) * Math.min(1, L.slide * dt)
  const reveal = { after: L.reveal.after, seconds: L.reveal.seconds, from: L.reveal.from, turn: 0 }
  m.cars.forEach((c, i) => {
    const on = Math.abs(i - aimed) <= L.show
    const at = [L.at[0] + (i - slid) * L.gap, L.at[1], L.at[2]]
    if (!c.model) {
      c.model = plugins.drive.model(plugins, c.car, L.kind)
      if (c.model) c.group.add(c.model.root)
    }
    ui3d.show(`car.${i}`, () => c.group, { at, scale: L.scale, select: true, reveal, spin: { rate: L.spin } } satisfies Look)
    c.group.visible = on
    const below = [at[0], at[1] - L.name.below, at[2]]
    ui3d.show(`car.${i}.name`, () => c.name.node, { at: below, scale: L.name.scale, reveal, sway: swaying(C, 2.1 * (i + 1), L.reveal.after + L.reveal.seconds) } satisfies Look)
    c.name.node.visible = on
  })
  const pressed = ui3d.pressed() as string | undefined
  if (!pressed?.startsWith('car.')) return
  wire.send(match.id, 'pick', m.cars[Number(pressed.slice(4))].car)
}

export function setup() {
  done = held = last = 0
  made = undefined
  slid = 0
  screen = 'title'
}

export function tick(row: Row, plugins: Plugins) {
  const { ui, wire, render3d, ui3d } = plugins
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
  const lobby = match?.data.match === 'lobby'
  const lead = leads(wire.rows)
  const picked = entryOf(wire.rows)?.car !== ''
  // out of the lobby every page is back on the title
  if (!lobby) screen = 'title'
  // the car select while this page's connection has picked no car on it; the course select the leader's
  const picking = lobby && screen === 'cars' && !picked
  const choosing = lobby && screen === 'courses' && lead

  // The 3D: the name, the courses' words or the car select, and the lights, shown by ui3d.
  made ??= cam3 ? make(plugins, C) : undefined
  if (made) {
    // the title: the name, which a press on starts the game; on the selects, the name over them
    if (screen === 'title') {
      ui3d.show('name', C.name.look)
      if (lobby && ui3d.pressed() === 'name') screen = lead ? 'courses' : 'cars'
    } else ui3d.show('name.top', C.name.top)
    const W = C.words
    if (screen === 'courses' || (screen === 'cars' && picked)) {
      C.courses.forEach((c, i) => {
        const start = W.reveal.after + i * W.reveal.stagger
        const top = Array.isArray(c.face.colour) ? c.face.colour[1] : c.face.colour
        ui3d.show(`course.${i}`, () => made!.words[i].node, {
          at: c.at,
          scale: W.scale,
          select: choosing,
          reveal: { after: start, seconds: W.reveal.seconds, from: W.reveal.from, turn: W.reveal.turn },
          sway: swaying(C, 1.3 * (i + 1), start + W.reveal.seconds),
          grow: { scale: W.focus.scale },
          glow: { colour: top, power: W.focus.glow, materials: ['face'] },
          dim: { by: W.dim },
        } satisfies Look)
      })
      const pressed = ui3d.pressed() as string | undefined
      if (choosing && match && pressed?.startsWith('course.')) {
        wire.send(match.id, 'choose', C.courses[Number(pressed.slice(7))].scene)
        screen = 'cars'
      }
    }
    if (picking && match) lineup(plugins, C, made, match, now)
    else last = 0
    ui3d.show('key', () => made!.key, { at: C.key.at } satisfies Look)
    const S = C.sweep
    const v = since >= S.at ? ((since - S.at) % S.every) / S.seconds : 1
    const across = v < 1 ? new T.Vector3().fromArray(S.from).lerp(new T.Vector3().fromArray(S.to), v).toArray() : S.from
    ui3d.show('sweep', () => made!.sweep, { at: across } satisfies Look)
    made.sweep.intensity = v < 1 ? S.power * Math.sin(Math.PI * v) : 0
  }

  // The 2D, on the title panel.
  const A = C.appear
  const k = clamp01((since - A.after) / A.seconds)
  if (k <= 0) return
  ui.panel('title').alpha = k
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
    const face = plugins.interface as Interface
    for (const w of [...made.words, ...made.cars.map(c => c.name)]) face.letGo(w)
    for (const c of made.cars) c.model?.dispose()
    made.key.dispose()
    made.sweep.dispose()
    made.env?.dispose()
    plugins.ui3d.environment(null)
  }
  made = undefined
  done = held = last = 0
  slid = 0
  screen = 'title'
}
