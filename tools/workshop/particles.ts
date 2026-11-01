// The particle workshop's page: a game's particle effects played by core's own particle3d on a stage of
// the game's own render3d (its tone, exposure and bloom), with no game running, each layer tuned live and
// saved into the game's effects file. It opens one game (`?game=<game>`, and `&file=<repo path>` of one of
// its effects files, `&effect=<name>`), reads it as the server does (`/api/particles/<game>`), and draws
// from the file as it is on disk, with every change made since laid over it.
//
// The stage: the loader (its catalogue the scene's sheets), particle3d, lights3d when the scene lists it,
// and render3d with the scene's own prefab, ticked in the scene's order, particle3d moved each frame by the
// seconds the frame took times the speed below, in steps no longer than the scene's `dt`; a grid of 1 m squares on the ground and a stick of 1.8 m,
// a person, beside the point; the camera turned round the point by the mouse (OrbitControls), and kept
// across a reload. particle3d is handed the page's own copy of the effects file in place of the loader's,
// and told it was written (the loader's `onWritten`) each time a number changes, so every particle in the
// air takes the new number from the next step, as it does when the game's editor writes the file.
//
// The bar under the stage: how the effect is thrown. An effect any of whose layers bursts again `every`
// so many seconds (its named effects' layers too) is a stream, played without end, as the game plays it
// while it is on. Any other is one burst: thrown by the Throw button, and again every so many whole
// seconds (2 to start) while its toggle is on, which it is to start. Then, as a rule's `emit` gives them
// (particle3d's header): `scale`; `dir`, which a layer with no `dir` throws along and swirls about; `to`,
// a second point, where a beam ends; and how fast time runs, so a quick burst can be watched slowly.
//
// The left column is every effect of the file, a new one made by its name. The right column is the chosen
// effect's layers, each a card, every one shut on load, its title saying what it throws, how many and how
// often: mute it or play it alone (on this page only, never saved), move it up or down, copy it, remove
// it, or add a new one. A layer that names another effect (`{ effect, at }`) is, opened, that name and
// where it is thrown from. Every other layer is an emitter: opened, it shows its headline fields (how
// many, how often, how long, size, colour, brightness, speed, swirl), and under them folders, each shut
// until it is opened and saying how many of its fields are set: Timing, Colour and fade, Picture, Where
// it starts, Forces and Light. Each field is one line, its name, its control and ×; a number is typed, or
// dragged across the field's name; a field left out shows greyed in its control what particle3d does
// without it; a value set turns its name white, a value changed since the file was read amber, and ×
// takes the field out of the layer. `life` and `lasts` are one or the other: setting one takes the other out.
// `pace` and `flips` are lists of lists, written as JSON. Every field particle3d reads (its `FIELDS`) has a
// control here, and the page throws on load when one has none.
//
// Save to game writes each effect changed, whole, into the file (`POST /api/particles/<game>`), the rest
// of the file and its layout kept; Revert drops every change. A file of the game written on disk loads the
// page again on the same effect, unless there are changes not yet saved.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loader } from '#plugins/loader/loader.plugin.ts'
import { particle3d, FIELDS, type Effects, type Layer, type Emitter } from '#plugins/particle3d/particle3d.plugin.ts'
import { lights3d } from '#plugins/lights3d/lights3d.plugin.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'

type Json = any
type Found = { file: string; key: string; scenes: string[]; effects: Effects; world: Json; plugins: string[]; render3d: Json; dt: number }

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
const query = new URLSearchParams(location.search)
const game = query.get('game') ?? ''
const errorBox = $('#error')
const fail = (e: unknown) => {
  errorBox.style.display = 'block'
  errorBox.textContent = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
}
const clearFail = () => { errorBox.style.display = 'none' }
const hex = (n: number) => `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Each field of an emitter: its control, its name, what particle3d does when it is left out (shown greyed
// in the field), the step a drag moves it by a pixel, and its least, which a drag goes no lower than
// when it is 0 or more; `max` is no bound, typing past it is allowed.
type Spec =
  | { kind: 'number'; label: string; none: string; min: number; max: number; step: number }
  | { kind: 'range'; label: string; none: string; min: number; max: number; step: number }
  | { kind: 'vector'; label: string; none: string; count: number; min: number; max: number; step: number; names: string[] }
  | { kind: 'bool'; label: string; none: string }
  | { kind: 'colour'; label: string; none: string }
  | { kind: 'sheet'; label: string; none: string }
  | { kind: 'clip'; label: string; none: string }
  | { kind: 'light'; label: string; none: string }
  | { kind: 'json'; label: string; none: string; example: string }
const SPEC: Record<(typeof FIELDS)[number], Spec> = {
  n: { kind: 'range', label: 'Count', none: '1', min: 0, max: 400, step: 1 },
  every: { kind: 'number', label: 'Repeat every (s)', none: 'once', min: 0, max: 2, step: 0.005 },
  after: { kind: 'number', label: 'Delay (s)', none: '0', min: 0, max: 5, step: 0.01 },
  life: { kind: 'range', label: 'Lifetime (s)', none: '', min: 0, max: 10, step: 0.01 },
  lasts: { kind: 'bool', label: 'Lives with effect', none: '' },
  skip: { kind: 'number', label: 'Start offset (s)', none: '0', min: 0, max: 5, step: 0.01 },
  sheet: { kind: 'sheet', label: 'Sheet', none: 'squares' },
  clip: { kind: 'clip', label: 'Clip', none: '' },
  play: { kind: 'bool', label: 'Sheet timing', none: '' },
  size: { kind: 'range', label: 'Size (m)', none: '1', min: 0, max: 10, step: 0.005 },
  grow: { kind: 'number', label: 'Grow (×)', none: '1', min: 0, max: 40, step: 0.01 },
  dir: { kind: 'vector', label: 'Direction', none: 'spawn', count: 3, min: -1, max: 1, step: 0.01, names: ['x', 'y', 'z'] },
  spread: { kind: 'number', label: 'Spread (rad)', none: 'all', min: 0, max: Math.PI, step: 0.01 },
  speed: { kind: 'range', label: 'Speed (m/s)', none: '0', min: 0, max: 60, step: 0.05 },
  jitter: { kind: 'vector', label: 'Jitter (m)', none: '0', count: 3, min: 0, max: 5, step: 0.01, names: ['x', 'y', 'z'] },
  box: { kind: 'vector', label: 'Spawn box (m)', none: '', count: 6, min: -10, max: 10, step: 0.01, names: ['x', 'y', 'z', 'x', 'y', 'z'] },
  g: { kind: 'number', label: 'Gravity (m/s²)', none: '0', min: -40, max: 40, step: 0.1 },
  drag: { kind: 'number', label: 'Drag (/s)', none: '0', min: 0, max: 20, step: 0.05 },
  pull: { kind: 'number', label: 'Pull (m/s²)', none: '0', min: -100, max: 100, step: 0.1 },
  swirl: { kind: 'number', label: 'Swirl (rad/s)', none: '0', min: -30, max: 30, step: 0.05 },
  axis: { kind: 'vector', label: 'Swirl axis', none: 'dir', count: 3, min: -1, max: 1, step: 0.01, names: ['x', 'y', 'z'] },
  pace: { kind: 'json', label: 'Pace', none: '', example: '[[0.2, 0.5], [0.4, 0]]' },
  follow: { kind: 'bool', label: 'Follow point', none: '' },
  flips: { kind: 'json', label: 'Flips', none: '', example: '[[0.1, 1, 0]]' },
  tint: { kind: 'colour', label: 'Colour', none: 'white' },
  tint1: { kind: 'colour', label: 'End colour', none: 'same' },
  gain: { kind: 'number', label: 'Brightness (×)', none: '1', min: 0, max: 40, step: 0.05 },
  a0: { kind: 'number', label: 'Start opacity', none: '1', min: 0, max: 1, step: 0.01 },
  a1: { kind: 'number', label: 'End opacity', none: '1', min: 0, max: 1, step: 0.01 },
  fade: { kind: 'number', label: 'Fade (s)', none: 'life', min: 0, max: 10, step: 0.01 },
  spin: { kind: 'number', label: 'Spin (rad/s)', none: '0', min: 0, max: 30, step: 0.1 },
  origin: { kind: 'vector', label: 'Pivot', none: '0.5', count: 2, min: 0, max: 1, step: 0.01, names: ['x', 'y'] },
  add: { kind: 'bool', label: 'Additive', none: '' },
  stretch: { kind: 'bool', label: 'Stretch on path', none: '' },
  face: { kind: 'bool', label: 'Face direction', none: '' },
  beam: { kind: 'bool', label: 'Beam to target', none: '' },
  light: { kind: 'light', label: 'Point light', none: '' },
}
for (const f of FIELDS) if (!SPEC[f]) throw new Error(`the particle workshop has no control for particle3d's field ${f}`)
// What an opened layer shows first, and the folders under it, each shut until it is opened.
const HEADLINE: (keyof Emitter)[] = ['n', 'every', 'life', 'size', 'tint', 'gain', 'speed', 'swirl']
const FOLDERS: [string, (keyof Emitter)[]][] = [
  ['Timing', ['after', 'lasts', 'skip']],
  ['Colour and fade', ['tint1', 'a0', 'a1', 'fade', 'add']],
  ['Picture', ['sheet', 'clip', 'play', 'grow', 'spin', 'origin', 'stretch', 'face', 'beam', 'flips']],
  ['Where it starts', ['dir', 'spread', 'jitter', 'box']],
  ['Forces', ['g', 'drag', 'pull', 'axis', 'pace', 'follow']],
  ['Light', ['light']],
]
for (const f of FIELDS) if (!HEADLINE.includes(f) && !FOLDERS.some(([, fs]) => fs.includes(f))) throw new Error(`the particle workshop shows particle3d's field ${f} nowhere`)

const KEPT = 'particle-workshop-camera'

// A new layer's numbers (its picture is `freshLayer`'s): one burst of twenty small sparks of light, thrown out any way at a metre or two a second,
// fading over a second; no `every`, so a burst stays a burst. A starting point to turn, not a look.
const fresh = (): Emitter => ({ n: [20, 20], life: [1, 1], size: [0.08, 0.15], speed: [1, 2], gain: 2, a1: 0, add: true })

async function main() {
  const games: string[] = await (await fetch('/api/games')).json()
  const pickGame = $<HTMLSelectElement>('#game')
  for (const g of games) pickGame.append(new Option(g, g, false, g === game))
  pickGame.onchange = () => { location.search = `?game=${pickGame.value}` }
  if (!game) return fail('Choose a game.')

  const sum = await (await fetch(`/api/particles/${game}`)).json()
  if (sum.error) return fail(sum.error)
  const files: Found[] = sum.files
  if (!files.length) return fail(`${game} has no scene that lists particle3d with a world.particle3d.`)
  const found = files.find(f => f.file === query.get('file')) ?? files[0]
  const pickFile = $<HTMLSelectElement>('#file')
  for (const f of files) pickFile.append(new Option(`${f.file.split('/').pop()} (${f.scenes.join(', ')})`, f.file, false, f === found))
  pickFile.onchange = () => { location.search = `?game=${game}&file=${encodeURIComponent(pickFile.value)}` }

  // The file as it is on disk, and the page's working copy of its effects.
  const pristine: Effects = found.effects
  const working: Record<string, Layer[]> = structuredClone(pristine.effects)
  let effect = working[query.get('effect') ?? ''] ? query.get('effect')! : Object.keys(working)[0]
  // The layers muted, and the one played alone, of the effect shown: the page's alone, never saved.
  const muted = new Set<number>()
  let solo: number | undefined
  // The layers opened, by index, and the folders opened, `<layer> <folder>`: every one shut on load.
  const opened = new Set<number>()
  const folders = new Set<string>()
  // A new layer drawn with a picture the file's layers already draw with: a clip named for a glow when
  // one is, else the first a layer names; flat squares only for a file that draws none.
  const freshLayer = (): Emitter => {
    const drawn = Object.values(working).flat().filter((l): l is Emitter => !('effect' in l) && !!l.sheet && !!l.clip)
    const pick = drawn.find(l => /glow/i.test(l.clip!)) ?? drawn[0]
    return { ...fresh(), ...(pick ? { sheet: pick.sheet, clip: pick.clip } : {}) }
  }
  const changedEffects = () => Object.keys(working).filter(n => !same(working[n], pristine.effects[n]))

  // ---- the stage ----

  // What particle3d reads: the file with the working effects, the chosen effect's muted layers out.
  const shown: Effects = { ...structuredClone(pristine), effects: {} }
  const heard: (() => void)[] = []
  const restage = () => {
    for (const k of Object.keys(shown.effects)) delete shown.effects[k]
    for (const [n, layers] of Object.entries(working)) {
      shown.effects[n] = n !== effect ? structuredClone(layers)
        : structuredClone(layers.filter((_, i) => (solo === undefined ? !muted.has(i) : i === solo)))
    }
    for (const f of heard) f()
  }

  const view = $('#view')
  const width = view.clientWidth, height = view.clientHeight
  const order = ['loader', ...found.plugins]
  const scene = {
    plugins: order,
    world: found.world,
    prefabs: {
      engine: { width, height, dt: found.dt },
      render3d: { ...found.render3d, camera: { fov: 45, near: 0.02, far: 2000, at: [6, 3.5, 8], look: [0, 1.2, 0] } },
    },
  }
  const real = loader()
  // The loader as particle3d is handed it: the effects file its own copy, every sheet the loader's.
  const handed = new Proxy(real, {
    get(t, k) {
      if (k === 'on') return (name: string, f: (it: Json) => void) => (name === found.key ? f(shown) : t.on(name, f))
      if (k === 'onWritten') return (name: string, f: () => void) => (name === found.key ? heard.push(f) : t.onWritten(name, f))
      const v = Reflect.get(t, k)
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
  const fx = particle3d()
  const P: Json = { wire: { n: 1, rows: [], scene, between: 1 }, loader: handed, particle3d: fx, render3d: render3d() }
  if (found.plugins.includes('lights3d')) P.lights3d = lights3d()
  const canvas = document.createElement('canvas')
  view.prepend(canvas)
  P.render3d.mount(canvas)
  real.tick(P)
  P.render3d.tick(P)
  P.render3d.ratio(devicePixelRatio)
  const three = P.render3d.scene as THREE.Scene
  if (three.background === null) three.background = new THREE.Color(0x0b0b0e)
  const grid = new THREE.GridHelper(20, 20, 0x3a3d44, 0x24262b)
  three.add(grid)
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 12), new THREE.MeshBasicMaterial({ color: 0xdddddd }))
  stick.position.set(1.5, 0.9, 0)
  three.add(stick)
  const camera = P.render3d.camera as THREE.PerspectiveCamera
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.target.set(0, 1.2, 0)
  P.render3d.claim('workshop')
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEPT) ?? 'null')
    if (kept) { camera.position.fromArray(kept.position); controls.target.fromArray(kept.target) }
  } catch { /* kept only where the browser keeps it */ }
  controls.update()
  addEventListener('beforeunload', () => {
    try { sessionStorage.setItem(KEPT, JSON.stringify({ position: camera.position.toArray(), target: controls.target.toArray() })) } catch { /* as above */ }
  })
  // The stage fitted to its box whenever the box changes size, in place: the working copy, the camera
  // and every open card stay as they are.
  new ResizeObserver(() => {
    const w = view.clientWidth, h = view.clientHeight
    if (!w || !h) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    P.render3d.renderer.setSize(w, h)
    P.render3d.composer?.setSize(w, h)
  }).observe(view)

  // ---- how it is thrown ----

  // A stream is an effect any of whose layers, its named effects' too, bursts again `every` so many
  // seconds: it is played without end, as the game plays it while it is on. Any other is one burst: thrown
  // by the Throw button, and again every `auto.every` whole seconds while the toggle is on.
  const streams = (name: string, seen: string[] = []): boolean =>
    (working[name] ?? []).some(l => ('effect' in l ? !seen.includes(l.effect) && streams(l.effect, [...seen, name]) : !!l.every))
  const spawn = { at: [0, 1.2, 0], scale: 1, dir: [0, 1, 0], to: [6, 1.2, 0], speed: 1 }
  const auto = { on: true, every: 2 }
  let stream = false
  let since = 0
  const throwIt = () => {
    since = 0
    if (!working[effect]) return
    fx.emit(effect, [...spawn.at], { life: stream ? Infinity : 0, scale: spawn.scale, dir: [...spawn.dir], to: [...spawn.to] })
  }
  // Every running effect stopped, its particles left to live out their lives, and the chosen one thrown
  // again at once.
  const restart = () => {
    for (const e of fx.effects) e.life = Math.min(e.life, e.age)
    stream = streams(effect)
    throwIt()
    bursts()
  }

  const bar = $('#play')
  const field = (host: HTMLElement, label: string, input: HTMLInputElement) => {
    const l = make('label', '', label)
    l.append(input)
    host.append(l)
    return input
  }
  const num = (host: HTMLElement, label: string, value: number, step: number, set: (v: number) => void, min?: number) => {
    const i = make('input')
    i.type = 'number'; i.step = String(step); i.value = String(value)
    if (min !== undefined) i.min = String(min)
    i.oninput = () => { if (i.value !== '' && Number.isFinite(Number(i.value))) set(Number(i.value)) }
    return field(host, label, i)
  }
  // The start of the bar: what the chosen effect is, and for a burst, the Throw button and its toggle.
  const kind = make('span')
  kind.style.cssText = 'display:flex;gap:10px;align-items:center'
  bar.append(kind)
  function bursts() {
    kind.replaceChildren()
    if (stream) {
      kind.append(make('b', '', 'A stream: it runs without end, as it does in the game while it is on'))
      return
    }
    const go = make('button', 'go small', 'Throw')
    go.onclick = throwIt
    kind.append(make('b', '', 'A burst'), go)
    const box = make('input'); box.type = 'checkbox'; box.checked = auto.on
    box.onchange = () => { auto.on = box.checked; since = 0 }
    field(kind, 'Throw it every', box)
    const n = make('input'); n.type = 'number'; n.min = '1'; n.step = '1'; n.value = String(auto.every)
    n.oninput = () => { const v = Math.round(Number(n.value)); if (v >= 1) auto.every = v }
    const l = make('label', '', '')
    l.append(n, ' seconds')
    kind.append(l)
  }
  num(bar, 'Scale', spawn.scale, 0.1, v => { spawn.scale = v }, 0)
  ;['x', 'y', 'z'].forEach((n, i) => num(bar, `Dir ${n}`, spawn.dir[i], 0.1, v => { spawn.dir[i] = v }))
  ;['x', 'y', 'z'].forEach((n, i) => num(bar, `Target ${n}`, spawn.to[i], 0.5, v => { spawn.to[i] = v }))
  {
    const r = make('input'); r.type = 'range'; r.min = '0.05'; r.max = '2'; r.step = '0.05'; r.value = String(spawn.speed)
    const shownSpeed = make('span', '', `${spawn.speed}×`)
    r.oninput = () => { spawn.speed = Number(r.value); shownSpeed.textContent = `${spawn.speed}×` }
    field(bar, 'Time', r).after(shownSpeed)
  }
  {
    const box = make('input'); box.type = 'checkbox'; box.checked = true
    box.onchange = () => { grid.visible = stick.visible = box.checked }
    field(bar, 'Grid and stick', box)
  }

  // ---- the loop ----

  // Each frame, the seconds it took times the speed, in steps of the scene's `dt` and a last shorter one,
  // so a slowed effect still moves every frame and its quads face the camera as it turns.
  const count = $('#count')
  let last = performance.now()
  const engine = scene.prefabs.engine
  function step(now: number) {
    requestAnimationFrame(step)
    let left = Math.max(1e-4, Math.min(0.25, (now - last) / 1000) * spawn.speed)
    last = now
    controls.update()
    try {
      real.tick(P)
      for (const n of order) if (n !== 'loader') P[n].tick?.(P)
      while (left > 1e-9) {
        engine.dt = Math.min(found.dt, left)
        left -= engine.dt
        fx.afterTick(P)
        if (!stream && auto.on) {
          since += engine.dt
          if (since >= auto.every - 1e-9) throwIt()
        }
      }
      P.render3d.afterTick()
      clearFail()
    } catch (e) {
      fail(e)
    }
    count.textContent = `${fx.count} particles · ${fx.effects.length} effects running`
  }

  // ---- the left column and the header ----

  function nav() {
    const host = $('#nav')
    host.replaceChildren(make('div', 'head', 'Effects'))
    const changed = changedEffects()
    for (const n of Object.keys(working)) {
      const b = make('button', 'effect', n)
      b.classList.toggle('on', n === effect)
      b.classList.toggle('changed', changed.includes(n))
      b.onclick = () => choose(n)
      host.append(b)
    }
    const add = make('div', 'new')
    const name = make('input')
    name.placeholder = 'new effect'
    const go = make('button', 'small', 'Add')
    go.onclick = () => {
      const n = name.value.trim()
      if (!n) return
      if (working[n]) return fail(`${found.file} already has an effect ${n}`)
      working[n] = [freshLayer()]
      choose(n)
      opened.add(0)
      editor()
    }
    add.append(name, go)
    host.append(add)
  }
  function choose(n: string) {
    effect = n
    muted.clear(); solo = undefined; opened.clear(); folders.clear()
    history.replaceState(null, '', `?game=${game}&file=${encodeURIComponent(found.file)}&effect=${encodeURIComponent(n)}`)
    restage(); restart(); nav(); editor(); status()
  }
  function status() {
    const n = changedEffects().length
    const st = $('#status')
    st.textContent = n ? `${n} effect${n === 1 ? '' : 's'} changed, not saved` : 'Everything saved'
    st.classList.toggle('dirty', n > 0)
    $<HTMLButtonElement>('#save').disabled = !n
    $<HTMLButtonElement>('#revert').disabled = !n
  }
  $('#revert').onclick = () => {
    for (const k of Object.keys(working)) delete working[k]
    Object.assign(working, structuredClone(pristine.effects))
    if (!working[effect]) effect = Object.keys(working)[0]
    choose(effect)
  }
  $('#save').onclick = async () => {
    const effects = Object.fromEntries(changedEffects().map(n => [n, working[n]]))
    const r = await fetch(`/api/particles/${game}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: found.file, effects }) })
    const out = await r.json()
    if (!r.ok) return fail(out.error)
    pristine.effects = structuredClone(working)
    nav(); editor(); status()
  }

  // ---- the right column ----

  // A change to the chosen effect's layers: drawn from the next step. `again` throws it afresh, for a
  // change of how many layers there are or which, where the particles in the air no longer match a layer.
  const changed = (again = false) => {
    restage()
    if (again || streams(effect) !== stream) restart()
    nav(); status()
  }
  const layers = () => working[effect]

  // A field's row, one line: its name (dragged across, it moves the row's numbers), its control, and × to
  // take it out, which a field left out has none of. A field left out shows greyed in its control what
  // particle3d does without it.
  function row(host: HTMLElement, label: string, l: Json, k: string, i: number) {
    const r = make('div', 'row')
    const was = (pristine.effects[effect]?.[i] as Json)?.[k]
    r.classList.toggle('set', l[k] !== undefined)
    r.classList.toggle('changed', !same(l[k], was))
    const val = make('span', 'val')
    const clear = make('button', 'clear', '×')
    clear.disabled = l[k] === undefined
    clear.onclick = () => { delete l[k]; changed(); editor() }
    const name = make('span', 'name', label)
    r.append(name, val, clear)
    host.append(r)
    const mark = () => {
      r.classList.add('set')
      r.classList.toggle('changed', !same(l[k], was))
      clear.disabled = false
    }
    return { val, mark, name }
  }

  // Number fields. Each is typed into, or dragged: a drag across the row's name moves every number field
  // of the row by its step a pixel (Shift ten times, Alt a tenth), as a DCC's inspector does.
  type Num = { input: HTMLInputElement; get: () => number | undefined; put: (n: number) => void }
  const decimals = (step: number) => Math.max(0, -Math.floor(Math.log10(step)))
  function numField(host: HTMLElement, v: number | undefined, step: number, shown: string, set: (n: number) => void, axis?: string): Num {
    const wrap = make('span', 'num')
    if (axis) wrap.append(make('span', `axis ${axis}`, axis))
    const input = make('input')
    input.type = 'text'; input.inputMode = 'decimal'; input.spellcheck = false
    input.value = v === undefined ? '' : String(v)
    input.placeholder = shown
    input.oninput = () => {
      const n = Number(input.value)
      if (input.value.trim() !== '' && Number.isFinite(n)) set(n)
    }
    input.onkeydown = e => { if (e.key === 'Enter') input.blur() }
    wrap.append(input)
    host.append(wrap)
    const get = () => (input.value.trim() === '' ? undefined : Number(input.value))
    const put = (n: number) => { input.value = String(+n.toFixed(decimals(step))); set(+n.toFixed(decimals(step))) }
    return { input, get, put }
  }
  function scrub(name: HTMLElement, nums: Num[], step: number, from: (i: number) => number, least = -Infinity) {
    name.classList.add('scrub')
    name.onpointerdown = e => {
      e.preventDefault()
      name.setPointerCapture(e.pointerId)
      const x0 = e.clientX
      const base = nums.map((n, i) => n.get() ?? from(i))
      name.onpointermove = m => {
        const k = m.shiftKey ? 10 : m.altKey ? 0.1 : 1
        const d = (m.clientX - x0) * step * k
        nums.forEach((n, i) => n.put(Math.max(least, base[i] + d)))
      }
      name.onpointerup = () => { name.onpointermove = null; name.onpointerup = null }
    }
  }

  function control(host: HTMLElement, l: Json, k: keyof Emitter, i: number) {
    const s = SPEC[k as (typeof FIELDS)[number]]
    if (k === 'life' && l.lasts) return
    if (k === 'clip' && !l.sheet) return
    const { val, mark, name } = row(host, s.label, l, k, i)
    const write = (v: unknown, again = false) => {
      l[k] = v
      if (k === 'life') delete l.lasts
      if (k === 'lasts') delete l.life
      mark(); changed(again)
    }
    const shown = s.none
    if (s.kind === 'number') {
      const n = numField(val, l[k], s.step, shown, v => write(v))
      scrub(name, [n], s.step, () => Number(shown) || 0, s.min >= 0 ? s.min : -Infinity)
    } else if (s.kind === 'range') {
      // Two fields, the least and the most a particle is rolled between.
      const v: number[] = l[k] ?? []
      const lo = numField(val, v[0], s.step, shown, n => write([n, Math.max(n, (l[k] ?? [n, n])[1])]))
      val.append(make('span', 'to', 'to'))
      const hi = numField(val, v[1], s.step, shown, n => write([Math.min(n, (l[k] ?? [n, n])[0]), n]))
      scrub(name, [lo, hi], s.step, () => Number(shown) || 0, s.min >= 0 ? s.min : -Infinity)
    } else if (s.kind === 'vector') {
      const v: number[] = l[k] ?? []
      const nums = s.names.map((axis, j) =>
        numField(val, v[j], s.step, s.count === 6 ? '' : shown, n => {
          const now = [...(l[k] ?? Array(s.count).fill(0))]
          now[j] = n
          if (k === 'axis' && Math.hypot(...now) === 0) return
          write(now)
        }, axis))
      if (s.count === 6) val.classList.add('six')
      scrub(name, nums, s.step, () => 0)
    } else if (s.kind === 'bool') {
      const box = make('input'); box.type = 'checkbox'; box.checked = !!l[k]
      box.onchange = () => {
        if (box.checked) write(true, k === 'lasts')
        else {
          delete l[k]
          if (k === 'lasts') l.life = [1, 1]
          changed(k === 'lasts'); editor()
        }
      }
      val.append(box)
    } else if (s.kind === 'colour') {
      const c = make('input'); c.type = 'color'; c.value = hex(l[k] ?? 0xffffff)
      const code = make('span', 'hex', l[k] === undefined ? shown : hex(l[k]))
      c.oninput = () => { code.textContent = c.value; write(parseInt(c.value.slice(1), 16)) }
      val.append(c, code)
    } else if (s.kind === 'sheet') {
      const sel = make('select')
      sel.append(new Option(s.none, ''))
      for (const name of Object.keys(found.world.loader.assets)) sel.append(new Option(name, name, false, name === l.sheet))
      sel.onchange = () => {
        if (!sel.value) { delete l.sheet; delete l.clip; delete l.play; changed(true); editor(); return }
        const sheet = real.get(sel.value)
        const first = sheet ? Object.keys(sheet.data.clips)[0] : undefined
        l.sheet = sel.value
        if (first) l.clip = first
        else real.load(sel.value)
        changed(true); editor()
      }
      val.append(sel)
    } else if (s.kind === 'clip') {
      const sheet = real.get(l.sheet)
      if (!sheet) {
        real.load(l.sheet)
        val.append(make('span', '', `${l.clip ?? ''} (the sheet is loading)`))
        const tryAgain = setInterval(() => { if (real.get(l.sheet)) { clearInterval(tryAgain); editor() } }, 200)
        return
      }
      const sel = make('select')
      for (const name of Object.keys(sheet.data.clips)) sel.append(new Option(name, name, false, name === l.clip))
      sel.onchange = () => write(sel.value, true)
      val.append(sel)
    } else if (s.kind === 'light') {
      const box = make('input'); box.type = 'checkbox'; box.checked = !!l.light
      if (!found.plugins.includes('lights3d')) {
        box.disabled = true
        val.append(box, make('span', 'note', 'the scene has no lights3d'))
        return
      }
      box.onchange = () => {
        if (box.checked) write({ intensity: 2, distance: 3, decay: 2 })
        else { delete l.light; changed() }
        editor()
      }
      val.append(box)
      if (l.light) {
        for (const [part, label] of [['intensity', 'Intensity'], ['distance', 'Reach (m)'], ['decay', 'Falloff']] as const) {
          const sub = row(host, label, l.light, part, -1)
          sub.name.parentElement!.classList.add('sub')
          const n = numField(sub.val, l.light[part], 0.05, '', v => { l.light = { ...l.light, [part]: v }; mark(); changed() })
          scrub(sub.name, [n], 0.05, () => 0)
        }
      }
    } else if (s.kind === 'json') {
      const t = make('input')
      t.type = 'text'; t.spellcheck = false; t.className = 'code'
      t.value = l[k] === undefined ? '' : JSON.stringify(l[k])
      t.placeholder = s.example
      t.oninput = () => {
        try {
          const v = JSON.parse(t.value)
          if (!Array.isArray(v) || !v.every(e => Array.isArray(e) && e.every(n => typeof n === 'number'))) return
          t.style.borderColor = ''
          write(v)
        } catch { t.style.borderColor = '#a33' }
      }
      val.append(t)
    }
  }

  function card(l: Layer, i: number) {
    const c = make('div', 'layer')
    c.classList.toggle('muted', solo === undefined ? muted.has(i) : solo !== i)
    c.classList.toggle('shut', !opened.has(i))
    const top = make('div', 'top')
    // Its title: what it draws, and how many how often, dimmer.
    const what = 'effect' in l ? l.effect : l.clip ?? 'squares'
    const often = 'effect' in l ? 'every layer of it' : `${l.n ? (l.n[0] === l.n[1] ? l.n[0] : `${l.n[0]}–${l.n[1]}`) : 1} ${l.every ? `every ${l.every} s` : 'once'}`
    const title = make('span', 'title')
    title.append(make('span', 'chev', opened.has(i) ? '▾' : '▸'), make('span', 'index', String(i + 1)), make('span', 'what', what), make('span', 'often', often))
    title.onclick = () => { if (opened.has(i)) opened.delete(i); else opened.add(i); editor() }
    const tools = make('span', 'tools')
    const button = (text: string, on: boolean, f: () => void) => {
      const b = make('button', `tool${on ? ' on' : ''}`, text)
      b.onclick = f
      tools.append(b)
    }
    top.append(title, tools)
    button('Mute', muted.has(i), () => { if (muted.has(i)) muted.delete(i); else muted.add(i); restage(); restart(); editor() })
    button('Solo', solo === i, () => { solo = solo === i ? undefined : i; restage(); restart(); editor() })
    // What is opened, muted and played alone follows each layer to where it now stands: `to(j)` is
    // where the layer at `j` went, or undefined for one taken out.
    const follow = (to: (j: number) => number | undefined) => {
      const map = (s: Set<number>) => { const was = [...s]; s.clear(); for (const j of was) { const k = to(j); if (k !== undefined) s.add(k) } }
      map(opened); map(muted)
      const was = [...folders]
      folders.clear()
      for (const f of was) {
        const [j, ...name] = f.split(' ')
        const k = to(Number(j))
        if (k !== undefined) folders.add(`${k} ${name.join(' ')}`)
      }
      solo = solo === undefined ? undefined : to(solo)
    }
    const move = (to: number) => {
      const list = layers()
      if (to < 0 || to >= list.length) return
      ;[list[i], list[to]] = [list[to], list[i]]
      follow(j => (j === i ? to : j === to ? i : j))
      changed(true); editor()
    }
    button('↑', false, () => move(i - 1))
    button('↓', false, () => move(i + 1))
    button('Copy', false, () => {
      layers().splice(i + 1, 0, structuredClone(l))
      follow(j => (j > i ? j + 1 : j))
      changed(true); editor()
    })
    button('Delete', false, () => {
      layers().splice(i, 1)
      follow(j => (j === i ? undefined : j > i ? j - 1 : j))
      changed(true); editor()
    })
    const body = make('div', 'body')
    c.append(top, body)
    if (!opened.has(i)) return c
    if ('effect' in l) {
      const which = row(body, 'Effect', l, 'effect', i)
      const sel = make('select')
      for (const n of Object.keys(working)) if (n !== effect) sel.append(new Option(n, n, false, n === l.effect))
      sel.onchange = () => { (l as Json).effect = sel.value; changed(true); editor() }
      which.val.append(sel)
      // A layer that names an effect always names one: nothing to take out.
      which.name.parentElement!.classList.add('fixed')
      const at = row(body, 'Offset (m)', l, 'at', i)
      const v: number[] = l.at ?? []
      const nums = ['x', 'y', 'z'].map((axis, j) => numField(at.val, v[j], 0.05, '0', n => {
        const now = [...((l as Json).at ?? [0, 0, 0])]
        now[j] = n
        ;(l as Json).at = now
        at.mark(); changed(true)
      }, axis))
      scrub(at.name, nums, 0.05, () => 0)
      return c
    }
    for (const k of HEADLINE) control(body, l, k, i)
    for (const [name, keys] of FOLDERS) {
      const key = `${i} ${name}`
      const open = folders.has(key)
      const set = keys.filter(k => (l as Json)[k] !== undefined).length
      const head = make('button', `folder${open ? ' open' : ''}`)
      head.append(make('span', 'chev', open ? '▾' : '▸'), make('span', '', name), make('span', 'count', set ? `${set} set` : ''))
      head.onclick = () => { if (open) folders.delete(key); else folders.add(key); editor() }
      body.append(head)
      if (open) {
        const inner = make('div', 'inner')
        for (const k of keys) control(inner, l, k, i)
        body.append(inner)
      }
    }
    return c
  }

  function editor() {
    const host = $('#edit')
    const list = layers() ?? []
    host.replaceChildren(...list.map(card))
    if (!list.length) host.append(make('div', 'empty', 'This effect has no layers.'))
    const add = make('div', 'add')
    const emitter = make('button', 'small', 'Add a layer')
    emitter.onclick = () => { list.push(freshLayer()); opened.add(list.length - 1); changed(true); editor() }
    const ref = make('button', 'small', 'Add another effect as a layer')
    const other = Object.keys(working).find(n => n !== effect)
    ref.disabled = !other
    ref.onclick = () => { list.push({ effect: other! }); opened.add(list.length - 1); changed(true); editor() }
    add.append(emitter, ref)
    host.append(add)
  }

  // ---- files written on disk ----

  const events = new EventSource('/api/events')
  events.onmessage = e => {
    const what = String(e.data).replace(/^changed /, '')
    if (what !== found.file) return
    if (!changedEffects().length) location.reload()
    else $('#status').textContent = `${what.split('/').pop()} changed on disk: save or revert to load it`
  }

  restage()
  nav()
  editor()
  status()
  restart()
  requestAnimationFrame(step)
}

main().catch(fail)
