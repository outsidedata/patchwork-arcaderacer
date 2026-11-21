// The hair workshop's page (`/hair3d?game=<game>`): a game's hairs grown by core's own hair3d on test
// subjects, with no game running, every number tuned as it draws and saved into the game's hairs file.
//
// What it reads. The server's summary (`/api/hair3d/<game>`): each hairs file a scene of the game names
// (`world.hair3d.hairs`), the file as it is on disk, that scene's render3d prefab and step, and the
// workshop's stage file (`hair3d.stage.json`): the test subjects, their motions, the stage's light.
// `&file=<repo path>` opens one of several hairs files, `&hair=<name>` one hair, `&subject=<name>` one
// subject and `&motion=<name>` one of the stage's motions; the page keeps them in its address.
//
// The stage. A scene of the loader, the workshop's own `subjects` plugin (`plugins/subjects/`, listed as a
// game lists its own), gpgpu3d, hair3d and render3d with the game's prefab (its tone, exposure and shadows),
// under the stage's own sky and sun, on a ground with a grid of 1 m squares. hair3d's mods are
// `{ skins: ['subjects'], behaviors: ['render3d'], keeper: 'gpgpu3d', solids: 'gpgpu3d' }`: the subject is a three SkinnedMesh
// of one bone, its anchor, and gpgpu3d holds the subject's solids, the balls its hair is kept out of
// (`subjects.gpgpu3d.ts`). hair3d is handed the page's own copy of the hairs file, made again every frame: the file's
// `wind` and `gust`, the one hair shown with every number as edited here, its `on` the subject's (where a
// hair grows on a subject is the subject's; where it grows in the game is not shown or changed here), and
// one kind, the subject's name, wearing that hair. So a number changed is drawn
// that frame, and what is grown again when it changes is what the game grows again.
//
// The motion is `world.subjects.motion`, which the subjects plugin reads every frame: how fast the
// subject runs forward, two waves that move its anchor, two that turn it, and a steady spin. A button
// for each motion of the stage file sets all of it; every number is a field. It is the page's alone and
// is never saved. The camera, the ground, the grid and the sun go with the subject as it runs, the grid a
// whole square at a time, so its lines stand still and pass under it.
//
// The numbers. The right column is every number of the hair shown and of the file's wind and gust
// (`plugins/hair3d/hair3d.sim.ts` says what each is) and of its program's nodes (`plugins/gpgpu3d/
// gpgpu3d.ops.ts`; the ops, the wiring and the outputs are written in the file), a slider and a field
// each; a number changed since the file was read is amber. A hair's program is compiled as a game compiles
// it, over gpgpu3d's own ops. **Save to game** sends each changed number (`POST /api/hair3d/<game>`), set
// in place in the file and checked by hair3d's own `check`, each hair's program compiled over the ops the
// game's scene delivers; **Revert** reads the file again. The file written on disk by anything else is
// read again when nothing here is unsaved.
//
// `window.__workshop` is `{ plugins, world, shown, frame, orbit }`, for driving the page from a console:
// `frame()` is one frame, which a window behind others, given none by the browser, is stepped with, and
// `orbit` the camera's controls, whose `target` it looks at.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loader } from '#plugins/loader/loader.plugin.ts'
import { hair3d } from '#plugins/hair3d/hair3d.plugin.ts'
import { gpgpu3d } from '#plugins/gpgpu3d/gpgpu3d.plugin.ts'
import { opsOf, rangeOf, type OpTable, type Param } from '#plugins/gpgpu3d/gpgpu3d.ops.ts'
import type { Hair, Hair3d } from '#plugins/hair3d/hair3d.sim.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { subjects, type Motion, type Subject } from './plugins/subjects/subjects.plugin.ts'

type Json = any
type Path = (string | number)[]
type Found = { file: string; scenes: string[]; hairs: Hair3d; render3d: Json; dt: number }
type Stage = {
  lap: number
  ground: { size: number; colour: string }
  sky: { colour: string; ground: string; power: number }
  sun: { colour: string; power: number; at: [number, number, number]; half: number; map: number }
  camera: { fov: number; near: number; far: number; reach: number }
  skin: { colour: string; roughness: number }
  subjects: Record<string, Subject>
  motions: Record<string, Motion>
}
type Summary = { game: string; files: Found[]; stage: Stage }

const $ = <T extends HTMLElement = HTMLElement>(q: string) => document.querySelector(q) as T
const view = $('#view')
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: object = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e: HTMLElementTagNameMap[K] = document.createElement(tag)
  Object.assign(e, props)
  e.append(...kids)
  return e
}
function say(text: string, how: '' | 'ok' | 'bad' | 'dirty' = '') {
  const s = $('#state')
  s.textContent = text
  s.className = how
}
const fail = (e: unknown) => { const b = $('#error'); b.textContent = e instanceof Error ? e.message : String(e); b.style.display = 'block' }
const clearFail = () => { $('#error').style.display = 'none' }
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const body = await r.json()
  if (!r.ok) throw new Error(body.error ?? `${url}: ${r.status}`)
  return body as T
}
const at = (root: Json, path: Path): Json => path.reduce((o, k) => o?.[k], root)
const put = (root: Json, path: Path, v: Json) => { at(root, path.slice(0, -1))[path[path.length - 1]] = v }

// ---------------------------------------------------------------- the fields

type Field =
  | { is: 'number'; path: Path; label: string; unit: string; min: number; max: number; step: number }
  | { is: 'colour'; path: Path; label: string }
  | { is: 'flag'; path: Path; label: string }
const num = (path: Path, label: string, unit: string, min: number, max: number, step: number): Field => ({ is: 'number', path, label, unit, min, max, step })

// The ops this page's scene delivers (`gpgpu3d.ops.ts`), which say what each number of a program is.
let ops: OpTable = {}
// The slider of one number of a program's node, in the range its op gives it (`rangeOf`).
function sliderOf(path: Path, label: string, p: Param, v: number): Field {
  const r = rangeOf(p, v)
  return num(path, label, '', r.min, r.max, r.step)
}
// A field for each number a hair's program gives its nodes, one for each of a vec3's three.
function programFields(h: Hair): Field[] {
  return (h.program?.nodes ?? []).flatMap((node, k) => Object.entries(ops[node.op]?.params ?? {}).flatMap(([key, p]): Field[] => {
    const v = node[key]
    if (p.type === 'whole' || p.type === 'number') return typeof v === 'number' ? [sliderOf(['program', 'nodes', k, key], `${node.id} ${key}`, p, v)] : []
    if (p.type === 'vec3' && Array.isArray(v)) return v.map((n, i) => sliderOf(['program', 'nodes', k, key, i], `${node.id} ${key} ${'xyz'[i]}`, { type: 'number' }, n as number))
    return []
  }))
}

// Every number of a hair, in the groups the right column shows them in, each path from the hair.
const groups = (h: Hair): { title: string; note: string; fields: Field[] }[] => [
  {
    title: 'How much', note: 'Changing any of these roots and builds the hair again.',
    fields: [
      num(['density'], 'density', '/m²', 100, 60000, 100),
      num(['strands'], 'strands a lock', '', 1, 40, 1),
      num(['length', 0], 'length', 'm', 0.01, 1.5, 0.005),
      num(['length', 1], 'length spread', '', 0, 2, 0.05),
      num(['links'], 'links', '', 1, 32, 1),
      num(['segments'], 'segments', '', 1, 24, 1),
      { is: 'flag', path: ['shadow'], label: 'casts shadows' },
    ],
  },
  {
    title: 'How it lies and moves', note: '',
    fields: [
      num(['comb', 0], 'comb x', '', -2, 2, 0.05),
      num(['comb', 1], 'comb y', '', -2, 2, 0.05),
      num(['comb', 2], 'comb z', '', -2, 2, 0.05),
      num(['stiffness', 0], 'stiffness, root', '/s', 0, 80, 0.5),
      num(['stiffness', 1], 'stiffness, tip', '/s', 0, 30, 0.1),
      num(['gravity'], 'gravity', 'm/s²', -5, 20, 0.1),
      num(['damping'], 'damping', '/s', 0, 12, 0.1),
      num(['drag'], 'drag', '/s', 0, 12, 0.1),
    ],
  },
  {
    title: 'Its strands', note: '',
    fields: [
      num(['width', 0], 'width', 'm', 0.0005, 0.02, 0.0005),
      num(['width', 1], 'width spread', '', 0, 2, 0.05),
      num(['taper'], 'taper', '', 0, 1, 0.01),
      num(['thin'], 'thinnest drawn', 'm/m', 0, 0.005, 0.0001),
      num(['clump', 'radius'], 'clump radius', 'm', 0, 0.05, 0.001),
      num(['clump', 'tight'], 'clump tight', '', 0, 1, 0.01),
      num(['curl', 'radius'], 'curl radius', 'm', 0, 0.03, 0.0005),
      num(['curl', 'turns'], 'curl turns', '', 0, 8, 0.1),
      num(['ragged'], 'ragged', '', 0, 1, 0.01),
    ],
  },
  {
    title: 'Its colour', note: '',
    fields: [
      { is: 'colour', path: ['colours', 'root'], label: 'root' },
      { is: 'colour', path: ['colours', 'tip'], label: 'tip' },
      num(['vary'], 'vary', '', 0, 1, 0.01),
      num(['ao'], 'darker at root', '', 0, 1, 0.01),
      num(['roughness'], 'roughness', '', 0, 1, 0.01),
      num(['shine', 'strength'], 'shine', '', 0, 2, 0.01),
      num(['shine', 'power'], 'shine tightness', '', 1, 200, 1),
      num(['translucency'], 'translucency', '', 0, 2, 0.01),
    ],
  },
  ...(h.ties ?? []).map((t, i) => ({
    title: h.ties!.length === 1 ? 'Its tie' : `Its tie ${i + 1}`,
    note: `Held by the bone ${t.bone}, never drawn. Its place, reach and share decide which locks are gathered to it, and changing any of them roots and builds the hair again; the rest is read as it draws.`,
    fields: [
      num(['ties', i, 'at', 0], 'place x', 'm', -0.5, 0.5, 0.005),
      num(['ties', i, 'at', 1], 'place y', 'm', -0.5, 0.5, 0.005),
      num(['ties', i, 'at', 2], 'place z', 'm', -0.5, 0.5, 0.005),
      num(['ties', i, 'reach'], 'reach', 'm', 0.01, 0.6, 0.005),
      num(['ties', i, 'share'], 'share gathered', '', 0, 1, 0.01),
      num(['ties', i, 'around', 0], 'laid round x', 'm', -0.3, 0.3, 0.005),
      num(['ties', i, 'around', 1], 'laid round y', 'm', -0.3, 0.3, 0.005),
      num(['ties', i, 'around', 2], 'laid round z', 'm', -0.3, 0.3, 0.005),
      num(['ties', i, 'lift'], 'stands off the skin', 'm', 0, 0.1, 0.001),
      num(['ties', i, 'hang', 0], 'hangs x', '', -1, 1, 0.01),
      num(['ties', i, 'hang', 1], 'hangs y', '', -1, 1, 0.01),
      num(['ties', i, 'hang', 2], 'hangs z', '', -1, 1, 0.01),
      num(['ties', i, 'fall'], 'gives in to straight down', '', 0, 1, 0.01),
      num(['ties', i, 'spread'], 'bundle at the tie', 'm', 0, 0.08, 0.001),
      num(['ties', i, 'flare'], 'bundle at the end', 'm', 0, 0.15, 0.001),
      num(['ties', i, 'band'], 'second tie below', 'm', 0, 0.6, 0.005),
      num(['ties', i, 'side', 0], 'across x', '', -1, 1, 0.01),
      num(['ties', i, 'side', 1], 'across y', '', -1, 1, 0.01),
      num(['ties', i, 'side', 2], 'across z', '', -1, 1, 0.01),
      num(['ties', i, 'stiffness', 0], 'stiffness, gathered', '/s', 0, 120, 0.5),
      num(['ties', i, 'stiffness', 1], 'stiffness, hanging', '/s', 0, 60, 0.5),
      num(['ties', i, 'braid', 'radius'], 'braid swing', 'm', 0, 0.05, 0.0005),
      num(['ties', i, 'braid', 'pitch'], 'braid pitch', 'm', 0.02, 0.5, 0.005),
    ],
  })),
  ...(h.program ? [{ title: 'Its program', note: 'The numbers of its nodes, by node, which root and build the hair again. The ops, the wiring and the outputs are written in the file.', fields: programFields(h) }] : []),
]
// The file's wind and gust, each path from the file.
const WIND: Field[] = [
  num(['wind', 'toward'], 'blows toward', '°', 0, 360, 1),
  num(['wind', 'speed'], 'speed', 'm/s', 0, 20, 0.1),
  num(['gust', 'scale'], 'gust size', 'm', 0.5, 20, 0.1),
  num(['gust', 'strength'], 'gust strength', '', 0, 1, 0.01),
  num(['gust', 'rate'], 'gust rate', 'rad/s', 0, 5, 0.05),
]

// ---------------------------------------------------------------- what is open

const query = new URLSearchParams(location.search)
let game = query.get('game') ?? ''
let found: Found | undefined
let stageFile: Stage | undefined
// The file as it is on disk, and as edited here.
let disk: Hair3d | undefined
let edited: Hair3d | undefined
let hair = ''
let subject = ''
let motion: Motion | undefined
let motionName = ''

const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b)
// Each number changed since the file was read: its path from the file and its value now.
function edits(): { path: Path; value: Json }[] {
  if (!disk || !edited) return []
  const out: { path: Path; value: Json }[] = []
  for (const f of WIND) if (!same(at(disk, f.path), at(edited, f.path))) out.push({ path: f.path, value: at(edited, f.path) })
  for (const name of Object.keys(edited.hairs)) {
    for (const g of groups(edited.hairs[name])) for (const f of g.fields) {
      const path = ['hairs', name, ...f.path]
      if (!same(at(disk, path), at(edited, path))) out.push({ path, value: at(edited, path) })
    }
  }
  return out
}
function told() {
  const n = edits().length
  if (n) say(`${n} number${n === 1 ? '' : 's'} changed`, 'dirty')
  else say('as the file is', 'ok')
  $<HTMLButtonElement>('#save').disabled = !n
  $<HTMLButtonElement>('#revert').disabled = !n
  for (const b of $('#hairs').children) {
    const name = (b as HTMLElement).dataset.name!
    b.classList.toggle('changed', !!disk && !!edited && !same(disk.hairs[name], edited.hairs[name]))
  }
}
function address() {
  const q = new URLSearchParams({ game })
  if (found) q.set('file', found.file)
  if (hair) q.set('hair', hair)
  if (subject) q.set('subject', subject)
  if (motionName) q.set('motion', motionName)
  history.replaceState(null, '', `${location.pathname}?${q}`)
}

// ---------------------------------------------------------------- the columns

// One line of a column: a field's name, its slider and its box, written into `root` at `path`; `from` is
// what it is compared with to show it changed, or undefined for a number that is never saved.
function line(root: Json, from: Json | undefined, f: Field): HTMLElement {
  const row = el('div', { className: 'line' })
  const mark = () => row.classList.toggle('changed', from !== undefined && !same(at(from, f.path), at(root, f.path)))
  const changed = () => { mark(); told() }
  const lab = el('span', { className: 'lab', textContent: f.label })
  if (f.is === 'colour') {
    const c = el('input', { type: 'color', value: at(root, f.path) })
    c.oninput = () => { put(root, f.path, c.value); changed() }
    row.append(lab, c)
  } else if (f.is === 'flag') {
    const c = el('input', { type: 'checkbox', checked: at(root, f.path) })
    c.onchange = () => { put(root, f.path, c.checked); changed() }
    row.append(lab, c)
  } else {
    const v = at(root, f.path) as number
    const slide = el('input', { type: 'range', min: String(f.min), max: String(f.max), step: String(f.step), value: String(v) })
    const box = el('input', { type: 'number', step: String(f.step), value: String(v) })
    slide.oninput = () => { const n = Number(slide.value); put(root, f.path, n); box.value = String(n); changed() }
    box.onfocus = () => box.select()
    box.onchange = () => {
      const n = Number(box.value)
      if (box.value.trim() === '' || !Number.isFinite(n)) { box.value = String(at(root, f.path)); return }
      put(root, f.path, n)
      slide.value = String(n)
      changed()
    }
    row.append(lab, slide, box, el('span', { className: 'unit', textContent: f.unit }))
  }
  mark()
  return row
}

function numbers() {
  const col = $('#numbers')
  col.replaceChildren()
  if (!edited || !disk) return
  for (const g of groups(edited.hairs[hair])) {
    col.append(el('h3', { textContent: `${hair}: ${g.title}` }))
    if (g.note) col.append(el('div', { className: 'say', textContent: g.note }))
    for (const f of g.fields) col.append(line(edited.hairs[hair], disk.hairs[hair], f))
  }
  col.append(el('h3', { textContent: 'The file\'s wind' }), el('div', { className: 'say', textContent: 'Every hair of the file blows in it.' }))
  for (const f of WIND) col.append(line(edited, disk, f))
}

function picks() {
  const hairs = $('#hairs')
  hairs.replaceChildren(...Object.keys(edited!.hairs).map(name => {
    const b = el('button', { textContent: name, className: name === hair ? 'on' : '', onclick: () => { hair = name; picks(); numbers(); address(); told() } })
    b.dataset.name = name
    return b
  }))
  $('#subjects').replaceChildren(...Object.keys(stageFile!.subjects).map(name =>
    el('button', { textContent: name, className: name === subject ? 'on' : '', onclick: () => { subject = name; world.subjects.subject = name; picks(); address() } })))
  $('#motions').replaceChildren(...Object.keys(stageFile!.motions).map(name =>
    el('button', { textContent: name, className: name === motionName ? 'on' : '', onclick: () => moving(name) })))
}

// The motion set to one of the stage file's, and its fields shown.
function moving(name: string) {
  motionName = name
  motion = structuredClone(stageFile!.motions[name])
  world.subjects.motion = motion
  const col = $('#motion')
  col.replaceChildren()
  const m = motion
  // any number typed makes the motion the page's own, none of the stage file's
  const own = () => { motionName = ''; for (const b of $('#motions').children) b.classList.remove('on'); address() }
  const typed = (root: Json, path: Path, step: number) => {
    const box = el('input', { type: 'number', step: String(step), value: String(at(root, path)) })
    box.onfocus = () => box.select()
    box.onchange = () => {
      const n = Number(box.value)
      if (box.value.trim() === '' || !Number.isFinite(n)) { box.value = String(at(root, path)); return }
      put(root, path, n)
      own()
    }
    return box
  }
  const three = (label: string, root: Json, path: Path, step: number, unit: string) =>
    el('div', { className: 'line' }, el('span', { className: 'lab', textContent: label }), typed(root, [...path, 0], step), typed(root, [...path, 1], step), typed(root, [...path, 2], step), el('span', { className: 'unit', textContent: unit }))
  const one = (label: string, root: Json, path: Path, step: number, unit: string) =>
    el('div', { className: 'line' }, el('span', { className: 'lab', textContent: label }), typed(root, path, step), el('span', { className: 'unit', textContent: unit }))
  col.append(
    el('div', { className: 'say', textContent: 'Running forward, as fast as a body runs.' }),
    one('forward', m, ['forward'], 0.1, 'm/s'),
    el('div', { className: 'say', textContent: 'Moved either way of its place: how far along x, y and z, and how many times a second.' }),
  )
  m.moves.forEach((w, i) => col.append(three(`move ${i + 1}`, w, ['amplitude'], 0.01, 'm'), one('', w, ['rate'], 0.1, '/s')))
  col.append(el('div', { className: 'say', textContent: 'Turned either way: degrees about x (a nod), y (a shake) and z (a tilt), and how many times a second.' }))
  m.turns.forEach((w, i) => col.append(three(`turn ${i + 1}`, w, ['amplitude'], 1, '°'), one('', w, ['rate'], 0.1, '/s')))
  col.append(
    el('div', { className: 'say', textContent: 'Spun without end, about x, y and z.' }),
    three('spin', m, ['spin'], 5, '°/s'),
  )
  for (const b of $('#motions').children) b.classList.toggle('on', b.textContent === name)
  address()
}

// ---------------------------------------------------------------- the stage

// The hairs file as hair3d is handed it, made again each frame from what is shown.
const shown = {} as Hair3d
function show() {
  const s = stageFile!.subjects[subject], h = edited!.hairs[hair]
  shown.wind = edited!.wind
  shown.gust = edited!.gust
  shown.kinds = { [subject]: { hairs: [hair] } }
  // its ties are carried by the subject's one bone: each place the game says in the frame of its own bone
  // (a head's, whose origin is at the neck) moved by where that frame's origin is in the subject's
  const o = s.ties?.origin ?? [0, 0, 0]
  const moved = (p: [number, number, number]): [number, number, number] => [p[0] + o[0], p[1] + o[1], p[2] + o[2]]
  shown.hairs = { [hair]: { ...h, on: s.on, ties: s.ties ? h.ties?.map(t => ({ ...t, bone: 'anchor', at: moved(t.at), around: moved(t.around) })) : undefined } as Hair }
}

let world: Json
let P: Json
let orbit: OrbitControls
let grid: THREE.GridHelper, ground: THREE.Mesh, sun: THREE.DirectionalLight
const was = new THREE.Vector3()

async function build(f: Found, stage: Stage) {
  const first = stage.subjects[subject]
  world = {
    loader: { assets: {} },
    shipped: { plugins: ['subjects'] },
    scenemanager: { home: new URL('/tools/workshop/', location.href).href },
    subjects: { subjects: stage.subjects, lap: stage.lap, skin: stage.skin, subject, motion },
    gpgpu3d: { reach: stage.camera.far, mods: { things: ['subjects'], behaviors: ['anim'] } },
    hair3d: { hairs: 'hairs', mods: { skins: ['subjects'], behaviors: ['render3d'], keeper: 'gpgpu3d', solids: 'gpgpu3d' } },
  }
  const reach = stage.camera.reach
  const scene = {
    plugins: ['loader', 'shipped', 'gpgpu3d', 'hair3d', 'render3d'],
    world,
    prefabs: {
      engine: { width: view.clientWidth, height: view.clientHeight, dt: f.dt },
      render3d: { ...f.render3d, camera: { fov: stage.camera.fov, near: stage.camera.near, far: stage.camera.far, at: [reach * 0.55, first.height + reach * 0.12, -reach * 0.8], look: [0, first.height, 0] } },
    },
  }
  await prepare({}, [], world)
  ops = opsOf(world)
  const real = loader()
  // The loader as hair3d is handed it: the hairs file the page's own copy.
  const handed = new Proxy(real, {
    get(t, k) {
      if (k === 'get') return (name: string) => (name === 'hairs' ? shown : t.get(name))
      const v = Reflect.get(t, k)
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
  P = { wire: { n: 1, rows: [], scene, between: 1 }, loader: handed, subjects: subjects(), gpgpu3d: gpgpu3d(), hair3d: hair3d(), render3d: render3d() }
  const canvas = document.createElement('canvas')
  view.prepend(canvas)
  P.render3d.mount(canvas)
  real.tick(P)
  P.render3d.tick(P)
  P.render3d.ratio(devicePixelRatio)
  P.render3d.claim('workshop')
  const three = P.render3d.scene as THREE.Scene
  if (three.background === null) three.background = new THREE.Color(0x0b0b0e)
  three.add(new THREE.HemisphereLight(stage.sky.colour, stage.sky.ground, stage.sky.power))
  sun = new THREE.DirectionalLight(stage.sun.colour, stage.sun.power)
  sun.castShadow = true
  sun.shadow.mapSize.set(stage.sun.map, stage.sun.map)
  const c = sun.shadow.camera
  c.left = -stage.sun.half; c.right = stage.sun.half; c.top = stage.sun.half; c.bottom = -stage.sun.half
  c.near = 0.1; c.far = 4 * Math.hypot(...stage.sun.at)
  c.updateProjectionMatrix()
  sun.shadow.bias = -0.0002
  sun.shadow.normalBias = 0.02
  three.add(sun, sun.target)
  ground = new THREE.Mesh(new THREE.PlaneGeometry(stage.ground.size, stage.ground.size).rotateX(-Math.PI / 2), P.render3d.dress(new THREE.MeshStandardMaterial({ color: stage.ground.colour, roughness: 1, metalness: 0 })))
  ground.receiveShadow = true
  three.add(ground)
  grid = new THREE.GridHelper(stage.ground.size, stage.ground.size, 0x5a5e68, 0x4a4d55)
  grid.position.y = 0.003
  three.add(grid)
  orbit = new OrbitControls(P.render3d.camera, canvas)
  orbit.target.set(0, first.height, 0)
  orbit.update()
  was.set(0, first.height, 0)
  for (const [name, d] of Object.entries({ side: [1, 0.15, 0], front: [0, 0.15, 1], back: [0, 0.15, -1], above: [0.001, 1, 0] }))
    $('#views').append(el('button', { textContent: name, onclick: () => {
      const cam = P.render3d.camera as THREE.PerspectiveCamera
      const far = cam.position.distanceTo(orbit.target)
      cam.position.copy(orbit.target).addScaledVector(new THREE.Vector3(...d).normalize(), far)
      orbit.update()
    } }))
  const fit = () => {
    const w = view.clientWidth, h = view.clientHeight
    if (!w || !h) return
    const cam = P.render3d.camera as THREE.PerspectiveCamera
    cam.aspect = w / h
    cam.updateProjectionMatrix()
    P.render3d.renderer.setSize(w, h)
    P.render3d.composer?.setSize(w, h)
  }
  addEventListener('resize', fit)
  const frame = () => {
    try {
      show()
      real.tick(P)
      P.subjects.tick(P)
      P.render3d.tick(P)
      // the camera, the ground and the sun go with the subject as it runs, the grid a whole square at a time
      const [x, y, z] = P.subjects.at() as [number, number, number]
      const cam = P.render3d.camera as THREE.PerspectiveCamera
      cam.position.x += x - was.x; cam.position.y += y - was.y; cam.position.z += z - was.z
      orbit.target.set(orbit.target.x + x - was.x, orbit.target.y + y - was.y, orbit.target.z + z - was.z)
      was.set(x, y, z)
      orbit.update()
      ground.position.set(Math.round(x), 0, Math.round(z))
      grid.position.set(Math.round(x), 0.003, Math.round(z))
      sun.target.position.set(x, y, z)
      sun.position.set(x + stageFile!.sun.at[0], y + stageFile!.sun.at[1], z + stageFile!.sun.at[2])
      P.gpgpu3d.afterTick(P)
      P.hair3d.afterTick(P)
      clearFail()
    } catch (e) {
      fail(e)
    }
    P.render3d.afterTick()
    const b = (P.hair3d.bodies() as { patches: { locks: number; strands: number }[] }[])[0]
    $('#hud').textContent = b ? `${b.patches[0].locks} locks\n${b.patches[0].strands} strands` : ''
  }
  ;(window as Json).__workshop = { plugins: P, world, shown, frame, orbit }
  const loop = () => { requestAnimationFrame(loop); frame() }
  requestAnimationFrame(loop)
}

// ---------------------------------------------------------------- reading, saving

async function read() {
  const s = await api<Summary>(`/api/hair3d/${game}`)
  stageFile = s.stage
  found = s.files.find(f => f.file === (found?.file ?? query.get('file'))) ?? s.files[0]
  disk = found.hairs
  edited = structuredClone(disk)
  if (!edited.hairs[hair]) hair = Object.keys(edited.hairs)[0]
  const files = $<HTMLSelectElement>('#file')
  files.replaceChildren(...s.files.map(f => el('option', { value: f.file, textContent: f.file.replace(`games/${game}/`, ''), selected: f.file === found!.file })))
  return s
}

$<HTMLButtonElement>('#save').onclick = async () => {
  const list = edits()
  if (!list.length || !found) return
  try {
    await api(`/api/hair3d/${game}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: found.file, edits: list }) })
    disk = structuredClone(edited!)
    numbers()
    told()
  } catch (e) {
    say((e as Error).message, 'bad')
  }
}
$<HTMLButtonElement>('#revert').onclick = async () => {
  await read()
  picks()
  numbers()
  told()
}
$<HTMLSelectElement>('#game').onchange = e => { location.search = `?game=${(e.target as HTMLSelectElement).value}` }
$<HTMLSelectElement>('#file').onchange = e => { location.search = `?${new URLSearchParams({ game, file: (e.target as HTMLSelectElement).value })}` }
addEventListener('beforeunload', e => { if (edits().length) e.preventDefault() })

const games = await api<string[]>('/api/games')
$<HTMLSelectElement>('#game').replaceChildren(el('option', { value: '', textContent: 'game…' }), ...games.map(g => el('option', { value: g, textContent: g, selected: g === game })))
if (!game) say('pick a game')
else {
  try {
    const s = await read()
    hair = edited!.hairs[query.get('hair') ?? ''] ? query.get('hair')! : hair
    subject = s.stage.subjects[query.get('subject') ?? ''] ? query.get('subject')! : Object.keys(s.stage.subjects)[0]
    const named = query.get('motion') ?? ''
    motionName = s.stage.motions[named] ? named : Object.keys(s.stage.motions)[0]
    motion = structuredClone(s.stage.motions[motionName])
    show()
    await build(found!, s.stage)
    picks()
    moving(motionName)
    numbers()
    told()
    // the file written on disk by anything else is read again when nothing here is unsaved
    new EventSource('/api/events').onmessage = async m => {
      if (m.data !== `changed ${found!.file}`) return
      if (edits().length) return
      await read()
      picks()
      numbers()
      told()
    }
  } catch (e) {
    say((e as Error).message, 'bad')
    fail(e)
  }
}
