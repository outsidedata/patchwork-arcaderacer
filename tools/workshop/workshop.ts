// The asset workshop's page: a game's props made and fitted to the game, drawn by the game's own
// systems. It opens one game (`?game=<game>`) from its own files, as the server reads them
// (`/api/game/<game>`), and draws with the game's own plugins, loader, anim, ik3d and render3d, ticked
// each frame on a stand-in scene made from the game's numbers: its catalogue, anim's numbers and
// kinds, ik3d's kinds, render3d's prefab (so the tone, the shadows and the AO are the game's). The
// page puts a studio stage in that scene (lights, a grid, a 1.8 m figure) and nothing else of its own:
// what a body plays, how it holds a prop and how its arms reach are anim's and ik3d's, from the same
// numbers the game reads, so what is fitted here is what the game draws.
//
// The left column lists the game's models, each with its count of open notes and a button for each
// body (filled where that body holds it), and the game's bodies, each with the scenes whose numbers
// for it differ from the first scene's. Choosing a model shows it alone; choosing a body shows it
// playing its rig's clips with whatever it holds; choosing a model on a body is a fit:
//   In the hand (IK off): the body's `props` entry for the model, `at` and `turn` in the bone's
//     scale-free frame. IK: `world.ik3d.kinds.<body>`, the anchor (the model's stock against a bone)
//     and each limb reaching a mount point. The gizmo and six fields set the one thing chosen: the
//     hold, the anchor, or a mount point (an empty in the model's own frame).
//   Take from this pose sets the mount points from the clip's pose, IK off: the grip and the support
//     where the hands are, the anchor where the stock is. IK then begins from the hold in the hand.
//   Save writes what changed into the game: the mount points into the model's glb, and the hold and
//     the IK into every scene of the game that draws the body and has the model.
// The clip list is the rig's clips, as the game plays them, and every clip of Bill's packs, tried on
// the body before it is baked: retargeted as the bake retargets (`plugins/anim/anim.export.py`) and
// played by anim through a stand-in rig, so it is a preview of the clip, not a clip the game has.
//
// A click on the model asks for a note, kept with the point in the model's own frame, the mesh and
// the material, and the camera, drawn as a numbered pin; a card's click puts the camera back. When a
// file of the game is written, the game is read again and the view built again with the camera kept,
// and "reloaded" shows the time.
//
// Bring… brings a glb model of another game into this one: its glb copied into this game, a catalogue
// entry added, and, with a body, held as the other game's body held it, the starting point to fit.
//
// A solids model (a `json` the solids plugin makes meshes of) is drawn as the game draws it, on a
// stand-in scene of its own (`drawn.ts`): one still row of the kind the game finds it by, drawn by the
// solids plugin (`world.solids.kinds`) or by the game's own plugins that draw solids models, loaded
// from the game's folder as `shipped` loads them (a machine standing on its legs as legs3d stands it,
// a structure as base draws it); or, when nothing of the game's draws a lone row of it (a module, a
// cabin), hung by the page from the solids plugin's own meshes and lights. The hud says which. Its
// tris, meshes, paints, parts, nodes, empties and bounds are counted off its own meshes as drawn; each
// node is shown as a frame with its name (a node no part hangs in, a mount, in amber), each empty as a
// dot. The gizmo and the fields set a node's `at` and `turn` ([rx, ry], radians, about x then y; shown
// in degrees, no z) or an empty's `at` and `turn` (a quaternion, as a glb's point holds; shown in
// degrees, XYZ), in its parent's frame; Add makes a node (hung from the node
// chosen) or, in a model with no nodes, an empty. Each edit is written into the loader's copy of the
// model, so the game's own code draws it moved that frame; Save writes it into the json in place, its
// layout kept (`/api/frames`). A click on the model notes its node and paint. No body holds a solids
// model: anim hangs a loader `model`, a glb.
//
// A solids model that is a machine with interactions (`plugins/interact`, the server's `interactions`)
// is shown in one of them, chosen above its steps ("model" shows it alone): the machine fitted as the
// interaction's scene fits it, posed as its game poses it in the step (`poses`, mech's jimmy kneeling),
// and the body beside it, drawn by anim, placed by interact's own `advance` at the step's point, its
// limbs bent by ik3d through interact's `limbs` mod: the scene the game runs, its plugins ticked in its
// order. Each step is tuned alone: its clip (any of the body's rig, or a pack clip tried through a
// stand-in rig, as a body's clips are), its `turn`, each IK limb's pole, and its points alone as the
// targets (`at` and each limb's `target`), each an empty of the model of a module the machine is
// fitted with, else of the machine's own, as interact's point mod looks for it. Save writes the points
// into their models (`/api/frames`), bakes each pack clip a step plays into the body's rig
// (`/api/bake`, the clip named after its file), and writes the interaction (`/api/interaction`).
//
// A machine is of two kinds, and the interaction is tuned the same on either; they differ where the
// machine is drawn and where its points are kept:
//   a solids model (mech's jimmy, above): drawn by its game's plugins on its stand-in scene, fitted and
//     posed, its points its empties and its fitted modules', read and written by `/api/frames`, a step's
//     dots where interact's point mod puts them, the gizmo in a module empty's frame read off its drawn
//     object;
//   a vehicle of box3dvehicle's fleet (the server's `vehicles`, vehicles's jeep, cart and truck), listed
//     as `vehicle · <name>`: drawn by core's box3dvehicle on still rows, a `box3dvehicle` row naming
//     the vehicle (row 1), its chassis row at rest at the origin (`standing` high, unturned) and its
//     wheel rows where its springs hold them at rest (`wheelAt` at each axle's `sag`), with the look
//     plugins the server names (particle3d for an exhaust) and nothing that moves it: no gravity, no
//     land. Its interactions are those of the kind `box3dvehicle` whose points box3dvehicle hands;
//     "vehicle" shows it alone with every point of its look. Its points are its look's `points` in the
//     chassis's frame, read and written by `/api/vehicle` (the scene file that gives the look), each a
//     dot on the empty box3dvehicle draws for it (`point`), the gizmo in that empty's frame less its own
//     place and turn (the chassis's, or for a point riding `steer` the turned wheel's), each edit put in
//     the stand-in's fleet so box3dvehicle draws it moved that frame. The steer field sets the car row's
//     `steer`, so the wheel turns and the hands on it follow; it is not saved. A vehicle has no notes.

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { loader } from '../../plugins/loader/loader.plugin.ts'
import { json, prepared, written } from '../../plugins/loader/loader.sim.ts'
import { anim } from '../../plugins/anim/anim.plugin.ts'
import { ik3d, type Kind as Ik } from '../../plugins/ik3d/ik3d.plugin.ts'
import { render3d } from '../../plugins/render3d/render3d.plugin.ts'
import { solids } from '../../plugins/solids/solids.plugin.ts'
import { interact } from '../../plugins/interact/interact.plugin.ts'
import { box3dvehicle } from '../../plugins/box3dvehicle/box3dvehicle.plugin.ts'
import { particle3d } from '../../plugins/particle3d/particle3d.plugin.ts'
import { corners, standing, wheelAt, type Vehicle } from '../../plugins/box3dvehicle/box3dvehicle.sim.ts'
import { advance, placeOf, type Interaction, type Step } from '../../plugins/interact/interact.sim.ts'
import { mod, prepare } from '../../addons/scenemanager/scenemanager.addon.ts'
import type { Row, W } from '../../engine/engine.ts'
import type { Prop, Rig } from '../../plugins/anim/anim.sim.ts'
import { assemble, labels, movedTo, nodeGroups, pointOf, rootOf, standScene, stillRow, type Model as Solid, type Named, type Stand } from './drawn.ts'

type Model = { key: string; url: string; file: string; type: 'glb' | 'solids'; scenes: string[]; open: number; named?: Named[]; stand?: Stand }
type Frames = { nodes: Record<string, { parent?: string; at: number[]; turn: number[]; mirror?: boolean }>; empties: Record<string, number[]>; turns: Record<string, number[]> }
type FrameEdits = { nodes: Record<string, { parent?: string; at: number[]; turn: number[] }>; empties: Record<string, number[]>; turns: Record<string, number[]> }
type Body = { kind: string; model: string; rig: string; scenes: string[]; props: Prop[]; ik?: Ik; drift: string[] }
// An interaction of a machine (the server's `interactions`, `plugins/interact`): its machine's kind and
// its name, its file, the body that plays it, how its scene fits the machine, what the machine does in
// each step, and the plugin that hands interact the machine's points.
type Act = { scene: string; machine: string; name: string; key: string; url: string; file: string; body: string; fit: Record<string, string | null>; poses: Record<string, Record<string, unknown>>; mods: { point: string; object: string; body?: string } }
// A vehicle of box3dvehicle's fleet a scene has interactions for (the server's `vehicles`): its name,
// the scene it is read from, the files that give its look, its look's model's key (null when drawn in
// code), the look plugins that draw it and their numbers.
type Car = { name: string; scene: string; files: string[]; model: string | null; plugins: string[]; world: Record<string, any> }
type Game = { game: string; scenes: string[]; world: any; render3d: any; engine: { dt?: number }; models: Model[]; bodies: Body[]; interactions: Act[]; vehicles: Car[] }
const BODY = 2 // the body's row in an interaction's stand-in scene, beside its machine's (1)
type Camera = { position: number[]; target: number[]; fov: number }
type Note = { id: number; text: string; at: number[]; mesh: string; material: string; camera: Camera; status: 'open' | 'fixed'; reply: string; made: string }
type Point = { at: number[]; turn: number[] } // a quaternion turn, as the glb holds it
type Fit = { hold: Prop; ik: Ik; ikOn: boolean; base: string }
type View = 'free' | 'front' | 'side' | 'top' | 'close'

const DEG = Math.PI / 180
const ROW = 1 // the one row of the stand-in scene: the body
const POINTS = ['stock', 'grip', 'support'] // the mount points IK stands on
const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T
const view = $('#view')

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  if (!r.ok) throw new Error(`${url}: ${r.status} ${await r.text()}`)
  return r.json()
}
const post = <T>(url: string, body: unknown) => api<T>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

function fail(e: unknown) {
  const el = $('#error')
  el.textContent = e instanceof Error ? e.message : String(e)
  el.style.display = 'block'
  el.title = e instanceof Error ? e.stack ?? '' : ''
  console.error(e)
}
const clearFail = () => { $('#error').style.display = 'none' }

// ---------------------------------------------------------------- state

let game: Game
const sel: { model?: string; body?: string; vehicle?: string } = {}
const fits = new Map<string, Fit>() // `${body}|${model}`: how the body holds the model, as tuned here
const savedPoints = new Map<string, Record<string, Point>>() // each glb's empties as it holds them
const pointEdits = new Map<string, Record<string, Point>>() // each glb's empties as moved here, not yet saved
const savedFrames = new Map<string, Frames>() // each solids model's nodes and empties as its file holds them
const frameEdits = new Map<string, FrameEdits>() // each solids model's nodes and empties as moved here, not yet saved
let notes: Note[] = []
let clip = '' // the clip the body plays: a rig clip's name, or `pack:<pack>/<file>`
let clipT = 0
let paused = false
let target = 'hold' // what the gizmo and the fields set: `hold`, `anchor`, or a point's name
let act: string | undefined // the interaction shown on a machine, `<machine>.<name>`; its first when none
let step = 0 // the step of it shown
const actSaved = new Map<string, Interaction>() // each interaction's file as it holds it, by file
const actEdits = new Map<string, Interaction>() // each interaction as changed here, not yet saved, by file
let steer = 0 // a vehicle's car row's `steer`, -1 to 1, as the steer field sets it
let mode: View = 'free'
let wire = false, showBounds = true, showEmpties = true

const fitKey = () => `${sel.body}|${sel.model}`
const modelOf = (key = sel.model) => game.models.find(m => m.key === key)
const bodyOf = (kind = sel.body) => game.bodies.find(b => b.kind === kind)
const fitting = () => !!(sel.body && sel.model)
const isSolid = () => modelOf()?.type === 'solids'
const carOf = (name = sel.vehicle) => (game.vehicles ?? []).find(v => v.name === name)
// A vehicle's points' key among the solids models' files, which its points are kept by beside theirs.
const carKey = (name: string) => `vehicle:${name}`
// The file whose points the machine or model shown has of its own: a vehicle's key, or the model's file.
const ownFile = (): string | undefined => (sel.vehicle ? carKey(sel.vehicle) : modelOf()?.file)
// Where a machine's points are read and written: a vehicle's look (`/api/vehicle`), or a solids model's
// json (`/api/frames`).
const framesUrl = (file: string) => (file.startsWith('vehicle:') ? `/api/vehicle/${game.game}/${encodeURIComponent(file.slice('vehicle:'.length))}` : `/api/frames?file=${encodeURIComponent(file)}`)
// The machine shown: the kind of its row and the plugins that draw it, which interact's point and object
// mods must be among. A vehicle is a `box3dvehicle` row, drawn by box3dvehicle; a solids model is a row
// of the kind its game stands it as, drawn by its drawers.
type Machine = { kind: string; drawers: string[] }
const VEHICLE: Machine = { kind: 'box3dvehicle', drawers: ['box3dvehicle'] }
const machineOf = (): Machine | undefined => {
  if (sel.vehicle) return carOf() && VEHICLE
  const s = isSolid() ? modelOf()!.stand : undefined
  return s && { kind: s.kind, drawers: s.drawers }
}
// The interactions of a machine, those of its kind whose point and object plugins draw it.
const actsFor = (m: Machine): Act[] => (game.interactions ?? []).filter(a => a.machine === m.kind && m.drawers.includes(a.mods.point) && m.drawers.includes(a.mods.object))
// The interactions of the machine shown.
const actsOf = (): Act[] => { const m = machineOf(); return m ? actsFor(m) : [] }
// The interaction shown on the lab, on a solids model or a vehicle.
const labAct = (): Act | undefined => lab?.solid?.act ?? lab?.car?.act
// The interaction shown ('' is none, the model alone), and it as it stands here: changed, else as its
// file holds it.
const actOf = (): Act | undefined => { if (act === '') return undefined; const all = actsOf(); return all.find(a => `${a.machine}.${a.name}` === act) ?? all[0] }
const actNow = (a = actOf()): Interaction | undefined => a && (actEdits.get(a.file) ?? actSaved.get(a.file))
// The step shown, as it stands here, in the interaction shown on the lab.
const stepNow = (): Step | undefined => { const a = labAct(); return a && actNow(a)?.steps[step] }
// An interaction's file as it is on disk, read once.
async function actLoaded(a: Act): Promise<Interaction> {
  if (!actSaved.has(a.file)) actSaved.set(a.file, await (await fetch(a.url, { cache: 'no-store' })).json())
  return actNow(a)!
}
// A step's points: where it stands, where it goes, and what each limb reaches, each once.
const stepPoints = (s: Step): string[] => [...new Set([s.at, ...(s.ik ?? []).map(l => l.target)])]
// What the machine does in the step shown, as its game poses it: fields set on its row.
const poseOf = (a: Act, s: Step): Record<string, unknown> => a.poses[s.name] ?? {}
// The step shown changed: the interaction's edits, written into the loader's copy of its file, so
// interact reads it changed this frame. A new clip builds the lab again (a pack clip plays through a
// stand-in rig).
function setStep(change: Partial<Step>, rebuild = false) {
  const a = labAct()
  if (!a) return
  const f = structuredClone(actNow(a)!)
  Object.assign(f.steps[step], change)
  actEdits.set(a.file, f)
  written(a.url, JSON.stringify(f))
  if (rebuild) build()
  else fill(false)
}
// The stand-in scene's rows as a rule reads them, for interact's own placement and its point mod.
function wOf(P: any): W {
  const rows = P.wire.rows as Row[]
  const none = (what: string) => () => { throw new Error(`the workshop's scene ${what} nothing`) }
  return {
    world: P.wire.scene.world,
    all: (kind: string) => rows.filter(r => r.kind === kind),
    get: (id: number) => rows.find(r => r.id === id)!,
    find: (kind: string, pred: (r: Row) => boolean = () => true) => rows.find(r => r.kind === kind && pred(r))!,
    spawn: none('spawns'), end: none('ends'), die: none('rolls'), call: none('calls'),
  } as unknown as W
}
// A pack clip's name in the body's rig when it is baked: its file's words, camel-cased
// (`Stand To Sit.fbx`: `standToSit`).
function clipName(choice: string) {
  const words = choice.slice(choice.lastIndexOf('/') + 1).replace(/\.fbx$/i, '').split(/[^A-Za-z0-9]+/).filter(Boolean)
  const name = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('')
  return /^[A-Za-z]/.test(name) ? name : `clip${name}`
}
// A model's notes file, beside it: `<stem>.notes.json`.
const notesOf = (file: string) => file.replace(/\.(glb|json)$/, '.notes.json')

// The fit of the chosen model on the chosen body: the body's props entry for it and its IK as the
// game holds them, or a first hold in the right hand and a first IK.
function fitOf(): Fit | undefined {
  if (!fitting()) return undefined
  let f = fits.get(fitKey())
  if (!f) {
    const b = bodyOf()!, key = sel.model!
    const hold = structuredClone(b.props.find(p => p.model === key) ?? { model: key, bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] })
    const had = b.ik && JSON.stringify(b.ik).includes(JSON.stringify(key)) ? structuredClone(b.ik) : undefined
    const ik: Ik = had ?? {
      anchor: { prop: key, bone: 'RightShoulder', at: [0, 0, 0], turn: [0, 0, 0], point: 'stock' },
      limbs: [
        { bones: ['RightArm', 'RightForeArm', 'RightHand'], prop: key, target: 'grip', pole: [-1, -1, 0] },
        { bones: ['LeftArm', 'LeftForeArm', 'LeftHand'], prop: key, target: 'support', pole: [1, -1, 0] },
      ],
    }
    f = { hold, ik, ikOn: !!had, base: '' }
    f.base = fitText(f, !!had)
    fits.set(fitKey(), f)
  }
  return f
}
// What a save compares: the hold, and the IK when it is on.
const fitText = (f: Fit, ikOn = f.ikOn) => JSON.stringify({ hold: f.hold, ik: ikOn ? f.ik : null })

// ---------------------------------------------------------------- the lab: the game's plugins on a stand-in scene

type Lab = {
  P: any
  world: any
  canvas: HTMLCanvasElement
  controls: OrbitControls
  labels: CSS2DRenderer
  stage?: THREE.Object3D // a model shown alone
  rig?: Rig
  last: number
  ready: boolean // built: the rig and the model have landed, so a frame can tick
  solid?: SolidLab // a solids model, drawn as the game draws it
  car?: CarLab // a vehicle of box3dvehicle's fleet, drawn by box3dvehicle
}
// A vehicle on its stand-in scene: its rows are the car (1), the body in an interaction (2), the chassis
// (3) and the wheels (4 on), and its plugins are ticked in the order the scene lists them.
type CarLab = {
  name: string
  fleet: any // the stand-in world's `box3dvehicle`, whose look's points are the game's with the edits made here
  base: Record<string, any> // the look's points as the game gives them
  order: string[] // the stand-in scene's plugins, in the order it lists them
  proxy: THREE.Object3D // what the gizmo moves for a point
  act?: Act // the interaction shown, its body drawn in the car in the step shown
}
// A solids model on its stand-in scene (`drawn.ts`).
type SolidLab = {
  key: string
  url: string // its catalogue url, which the loader's copy of it is written to as it is edited
  text: string // what the loader holds now: the file with the edits made here
  drawers: [string, any][] // the game's own plugins drawing it, by name, in order
  by: string // who draws it, for the hud
  made?: { root: THREE.Object3D; groups: Map<string, any>; owned: { dispose(): void }[] } // the page's own drawing
  root?: THREE.Object3D // the drawing this frame
  groups: Map<string, any> // each node's (and piece's) group in it
  parts: Map<THREE.Object3D, { node: string; paint: string }> // the model's meshes in it
  proxy: THREE.Object3D // what the gizmo moves for a node or an empty
  act?: Act // the interaction shown, its body drawn beside the machine in the step shown
  // The solids models of the modules the machine is fitted with (mech's mount3d hangs them): each its
  // catalogue key, url and file, and what the loader holds of it now (the file with the edits made
  // here). A point of a step is the empty of the first of them that has it, else of the machine's own.
  fitted: { key: string; url: string; file: string; text: string }[]
}
let lab: Lab | undefined
let building: Promise<void> | undefined
let reframe = false // the next build frames the view again, the camera not kept: a new interaction or step

// The model drawn now: the one shown alone, or the body's prop of that model.
function shown(): THREE.Object3D | undefined {
  if (!lab) return undefined
  if (lab.solid) return lab.solid.root
  if (lab.car) return carRoot()
  if (lab.stage) return lab.stage
  if (!sel.body || !sel.model) return undefined
  const k = lab.world.anim.kinds[sel.body]
  const i = (k?.props ?? []).findIndex((p: Prop) => p.model === sel.model)
  return i < 0 ? undefined : lab.P.anim.props(ROW)[i]
}

// The row the body is drawn from: standing still where the scene starts, facing +z, in the clip.
function rowData(reads: Record<string, string>) {
  const d: Record<string, any> = { clip, clipT, blend: 1 }
  d[reads.pos] = [0, 0, 0]
  d[reads.yaw] = 0
  d[reads.vel] = [0, 0, 0]
  d[reads.grounded] = true
  d[reads.limp] = false
  if (reads.aim) {
    const path = reads.aim.split('.')
    let o = d
    for (const f of path.slice(0, -1)) o = o[f] ??= {}
    o[path[path.length - 1]] = 0
  }
  return d
}

// The loader as anim sees it: the game's, with a pack clip tried on a body put among its model's clips.
function withPack(real: ReturnType<typeof loader>, pack: () => { model: string; clip: THREE.AnimationClip } | undefined) {
  return new Proxy(real, {
    get(t, k) {
      if (k === 'model') return (name: string) => { const m = t.model(name), p = pack(); return p && name === p.model ? { ...m, animations: [...m.animations, p.clip] } : m }
      const v = Reflect.get(t, k)
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
}
// A pack clip given to a body's rig through a stand-in rig, a copy of the rig with the clip in it and
// measured as standing still, put in the scene's catalogue and named by the body's anim kind.
function standInRig(world: any, kind: any, body: string, rig: Rig, clip: THREE.AnimationClip) {
  const name = `workshop rig ${body}`
  const url = `/workshop/${encodeURIComponent(body)}.rig.json`
  const measure = { dur: clip.duration, forward: 0, left: 0, yaw: 0, travel: [[0, 0, 0, 0], [clip.duration, 0, 0, 0]] }
  written(url, JSON.stringify({ ...rig, clips: { ...rig.clips, [clip.name]: { loop: true } }, table: { ...rig.table, [clip.name]: measure } }))
  world.loader.assets[name] = { type: 'json', url }
  kind.rig = name
  return name
}

// The lab made again: for a new game, a new choice, a new size, a game file written.
function build() {
  building = (async () => {
    const was = lab && !reframe ? { position: lab.P.render3d.camera.position.clone(), target: lab.controls.target.clone() } : undefined
    reframe = false
    close()
    clearFail()
    const width = Math.max(1, view.clientWidth), height = Math.max(1, view.clientHeight)
    if (sel.vehicle) return buildCar(width, height, was)
    if (isSolid()) return buildSolid(width, height, was)
    const world = structuredClone(game.world)
    const body = bodyOf()
    const f = fitOf()
    if (body) {
      const kind = world.anim.kinds[body.kind]
      world.anim.kinds = { [body.kind]: kind }
      if (f) {
        kind.props = [f.hold] // the fit's own objects: an edit here is an edit anim reads
        world.ik3d.kinds = f.ikOn ? { [body.kind]: f.ik } : {}
      } else world.ik3d.kinds = body.ik ? { [body.kind]: body.ik } : {}
    } else {
      world.anim.kinds = {}
      world.ik3d.kinds = {}
    }
    const scene = {
      plugins: ['loader', 'anim', 'ik3d', 'render3d'],
      world,
      prefabs: {
        engine: { width, height, dt: game.engine.dt ?? 1 / 60 },
        render3d: { ...(game.render3d ?? {}), camera: { fov: 40, near: 0.01, far: 500, at: [1.6, 1.4, 2.4], look: [0, 1, 0] } },
      },
    }
    await prepare({} as any, [], world) // the mods the scene names: anim's body for ik3d
    let rig: Rig | undefined
    const real = loader()
    let pack: { model: string; clip: THREE.AnimationClip } | undefined
    const wrapped = withPack(real, () => pack)
    const rows = body ? [{ id: ROW, kind: body.kind, data: {} as any }] : []
    const P: any = { wire: { n: 1, rows, scene }, loader: wrapped, anim: anim(), ik3d: ik3d(), render3d: render3d() }
    const canvas = document.createElement('canvas')
    view.prepend(canvas)
    P.render3d.mount(canvas)
    real.tick(P)
    P.render3d.tick(P)
    P.render3d.ratio(devicePixelRatio)
    const three = P.render3d.scene as THREE.Scene
    stageIn(three, P.render3d.renderer)
    const labels = new CSS2DRenderer()
    labels.setSize(width, height)
    labels.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none'
    view.append(labels.domElement)
    const controls = new OrbitControls(P.render3d.camera, canvas)
    controls.enableDamping = true
    P.render3d.claim('workshop')
    lab = { P, world, canvas, controls, labels, last: performance.now(), ready: false }
    if (body) {
      const kind = world.anim.kinds[body.kind]
      rig = await prepared(world, kind.rig)
      lab.rig = rig
      if (!clip || (!clip.startsWith('pack:') && !rig!.clips[clip])) clip = Object.keys(rig!.clips)[0]
      if (clip.startsWith('pack:')) {
        await real.load(kind.model)
        pack = await tryPack(clip, real.model(kind.model).scene, kind.model)
        lab.rig = await prepared(world, standInRig(world, kind, body.kind, rig!, pack.clip))
      }
      rows[0].data = rowData(kind.reads)
    } else if (sel.model) {
      await real.load(sel.model)
      const m = real.model(sel.model).scene as THREE.Object3D
      m.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true } })
      three.add(m)
      lab.stage = m
    }
    if (sel.model) await pointsOf(modelOf()!.file)
    gizmo.attachTo(three)
    if (was) {
      P.render3d.camera.position.copy(was.position)
      controls.target.copy(was.target)
    } else framed = false
    lab.ready = true
    lab.last = performance.now()
    clearFail()
    fill()
    side()
  })().catch(fail)
  return building
}

// A solids model drawn as the game draws it (`drawn.ts`): on a stand-in scene of the loader, the
// solids plugin, the game's own plugins that draw it and render3d, with one still row of its kind; or,
// when nothing of the game's draws a lone row of it, hung here from the solids plugin's meshes. The
// loader's copy of the model is the file with the edits made here, so a moved node is drawn by the
// game's own code.
async function buildSolid(width: number, height: number, was: { position: THREE.Vector3; target: THREE.Vector3 } | undefined) {
  const m = modelOf()!
  const home = new URL(`/games/${game.game}/`, location.href).href
  const { scene, drawers: names } = standScene(game, m.key, m.stand, home, { width, height })
  // A machine in an interaction: fitted as the interaction's scene fits it, so its modules are drawn,
  // and the body beside it, drawn by anim, placed by interact and bent by ik3d through interact's
  // `limbs`, as the game's scene lists them.
  const a = actOf()
  const f = a && await actLoaded(a)
  const kind = a && actWorld(scene.world, a, f!)
  if (a) scene.plugins = ['loader', 'anim', ...scene.plugins.slice(1, -1), 'interact', 'ik3d', 'render3d']
  await prepare({} as any, [], scene.world) // the mods the drawers name of each other, and interact's and ik3d's
  const real = loader()
  let pack: { model: string; clip: THREE.AnimationClip } | undefined
  const S = solids()
  // The solids plugin as the drawers are handed it, each `meshes` call's name kept by the parts it made,
  // so the hud can say which plugin drew the model.
  const whose = new WeakMap<object, string>()
  const handed = { ...S, whose, meshes: (...a: Parameters<typeof S.meshes>) => { whose.set(a[3], a[4]); return S.meshes(...a) } }
  const rows: { id: number; kind: string; data: Record<string, any> }[] = m.stand ? [stillRow(m.stand.kind)] : []
  if (a) {
    rows[0].data.fit = structuredClone(a.fit)
    rows[0].data.modules = Object.fromEntries(Object.entries(a.fit).filter(([, k]) => k !== null).map(([mount]) => [mount, { serial: 1, stick: [0, 0] }]))
    Object.assign(rows[0].data, poseOf(a, f!.steps[step]))
    clip = f!.steps[step].clip
    rows.push({ id: BODY, kind: a.body, data: { ...rowData(kind.reads), interact: null } })
  }
  const P: any = { wire: { n: 1, rows, scene, home }, loader: a ? withPack(real, () => pack) : real, solids: handed, render3d: render3d(), ...(a ? { anim: anim(), interact: interact(), ik3d: ik3d() } : {}) }
  const drawers: [string, any][] = []
  for (const n of names) {
    const mod = await import(/* @vite-ignore */ new URL(`plugins/${n}/${n}.plugin.ts`, home).href)
    drawers.push([n, mod[n]()])
    P[n] = drawers[drawers.length - 1][1]
  }
  // The file as it is on disk, with the edits made here, is what the loader holds.
  const url = m.url
  const text = JSON.stringify(withEdits(await (await fetch(url, { cache: 'no-store' })).json(), m.file))
  written(url, text)
  // The models of the modules the machine is fitted with, in the order its fit names them, each its file
  // with the edits made here put in the loader as the model's is.
  const fitted: SolidLab['fitted'] = []
  if (a) for (const k of Object.values(a.fit)) {
    const sm = k && game.models.find(x => x.type === 'solids' && x.named?.some(n => n.by === 'defs' && n.path === `${k}.model`))
    if (!sm || fitted.some(x => x.file === sm.file)) continue
    await framesOf(sm.file)
    const t = JSON.stringify(withEdits(await (await fetch(sm.url, { cache: 'no-store' })).json(), sm.file))
    written(sm.url, t)
    fitted.push({ key: sm.key, url: sm.url, file: sm.file, text: t })
  }
  const canvas = document.createElement('canvas')
  view.prepend(canvas)
  P.render3d.mount(canvas)
  real.tick(P)
  // Every json of the catalogue, as the game preloads them: a drawer reads the definitions and every
  // model they name. The loader starts a file once it has ticked.
  await Promise.all(Object.entries(scene.world.loader.assets as Record<string, any>).filter(([, a]) => a.type === 'json').map(([k]) => real.load(k)))
  P.render3d.tick(P)
  P.render3d.ratio(devicePixelRatio)
  const three = P.render3d.scene as THREE.Scene
  // The key's shadow over the model and round it: its corners' reach from the middle, and a metre.
  // Each part's corners in its node's frame, each node's frame as far out as its chain of `at`s.
  const parsed = JSON.parse(text) as Solid
  const out = (n: string | undefined): number => (n && parsed.nodes?.[n] ? Math.hypot(parsed.nodes[n].at[0], parsed.nodes[n].at[2]) + out(parsed.nodes[n].parent) : 0)
  const far = parsed.parts.map(p => out(p.node) + Math.max(...S.solid(p).v.map(v => Math.hypot(v[0], v[2]))))
  stageIn(three, P.render3d.renderer, Math.max(1.5, ...far) + 1)
  const labelsR = new CSS2DRenderer()
  labelsR.setSize(width, height)
  labelsR.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none'
  view.append(labelsR.domElement)
  const controls = new OrbitControls(P.render3d.camera, canvas)
  controls.enableDamping = true
  P.render3d.claim('workshop')
  const proxy = new THREE.Object3D()
  proxy.userData.workshop = true
  const solid: SolidLab = { key: m.key, url, text, drawers, by: '', groups: new Map(), parts: new Map(), proxy, act: a, fitted }
  lab = { P, world: scene.world, canvas, controls, labels: labelsR, last: performance.now(), ready: false, solid }
  if (a) {
    const r = await actRig(scene.world, real, kind, a, f!)
    pack = r.pack
    lab.rig = r.rig
  }
  // The first frame: a drawer that throws on the still row is let go of, so the rest draw.
  const dropped: string[] = []
  for (const phase of ['tick', 'afterTick'] as const) {
    if (phase === 'afterTick') S.afterTick(P)
    for (const [n, d] of [...solid.drawers]) {
      try { await d[phase]?.(P) } catch (e) {
        try { d.close?.(P) } catch { /* it is let go of either way */ }
        solid.drawers = solid.drawers.filter(([x]) => x !== n)
        delete P[n]
        dropped.push(`${n} (${(e as Error).message})`)
      }
    }
  }
  locate()
  if (!solid.root) {
    // Nothing of the game's drew a lone row of it: hung here from the solids plugin's meshes.
    rows.length = 0
    for (const [, d] of solid.drawers) d.afterTick?.(P)
    solid.by = m.stand
      ? `hung by the workshop from solids' meshes: no plugin of the game's draws a lone ${m.stand.kind}`
      : `hung by the workshop from solids' meshes: ${m.named?.length ? m.named.map(n => n.path).join(', ') : 'nothing of the game\'s names it'}`
    remake()
  } else solid.by = m.stand!.by === 'solids'
    ? `drawn by solids, a row of ${m.stand!.kind} (${m.stand!.scene})`
    : `drawn by ${drawerOf()}, a still row of ${m.stand!.kind} (${m.stand!.scene})`
  if (dropped.length) solid.by += `\nlet go of: ${dropped.join('; ')}`
  if (a) solid.by += `\n${a.body} in its ${a.name} (${a.file}), the ${a.machine} fitted as ${a.scene} fits it`
  await framesOf(m.file)
  gizmo.attachTo(three)
  if (was) {
    P.render3d.camera.position.copy(was.position)
    controls.target.copy(was.target)
  } else framed = false
  lab.ready = true
  lab.last = performance.now()
  fill()
  side()
}

// What a machine's stand-in scene adds for an interaction, on either kind of machine, as the game's
// scene lists it: anim with the body's kind, ik3d bending the limbs interact hands it, and interact with
// the one interaction and the scene's mods, the interaction as it stands here put in the loader. The
// step shown is kept within the interaction. Hands back the body's anim kind, a copy, which a pack clip's
// stand-in rig is set on.
function actWorld(world: any, a: Act, f: Interaction) {
  const kind = structuredClone(game.world.anim.kinds[a.body])
  if (!kind) throw new Error(`${a.file}: its body ${a.body} is no anim kind of ${game.game}'s`)
  step = Math.min(step, f.steps.length - 1)
  world.anim = { ...game.world.anim, kinds: { [a.body]: kind } }
  world.ik3d = { mods: { body: 'anim', limbs: 'interact' }, kinds: {} }
  world.interact = { kinds: { [a.machine]: { [a.name]: a.key } }, mods: a.mods }
  written(a.url, JSON.stringify(f))
  return kind
}
// The body's rig, and the step's clip: one of the rig's, or a pack clip through a stand-in rig.
async function actRig(world: any, real: ReturnType<typeof loader>, kind: any, a: Act, f: Interaction) {
  const s = f.steps[step]
  let rig: Rig = await prepared(world, kind.rig)
  let pack: { model: string; clip: THREE.AnimationClip } | undefined
  if (s.clip.startsWith('pack:')) {
    await real.load(kind.model)
    pack = await tryPack(s.clip, real.model(kind.model).scene, kind.model)
    rig = await prepared(world, standInRig(world, kind, a.body, rig, pack.clip))
  }
  return { rig, pack }
}

// A vehicle of box3dvehicle's fleet drawn as the game draws it: on a stand-in scene of the loader,
// box3dvehicle and the look plugins the server names, and render3d, with still rows of the car at rest
// at the origin: the car row (1) naming the vehicle, steered as the steer field says, its chassis row
// (3) `standing` over the ground unturned, and a wheel row (4 on) for each corner where its spring
// holds it at rest, `wheelAt` its axle's `sag` (as box3dvehicle makes a car's parts), still. In an
// interaction the body is row 2, and the scene lists anim, interact and ik3d after the look plugins,
// as the game's does. The look's points are the game's with the edits made here.
async function buildCar(width: number, height: number, was: { position: THREE.Vector3; target: THREE.Vector3 } | undefined) {
  const c = carOf()!
  const home = new URL(`/games/${game.game}/`, location.href).href
  const key = carKey(c.name)
  await framesOf(key)
  const world: any = { loader: structuredClone(game.world.loader), scenemanager: { home }, ...structuredClone(c.world) }
  const fleet = world.box3dvehicle
  const v: Vehicle = fleet.vehicles[c.name]
  const base = structuredClone(v.look.points ?? {}) as Record<string, any>
  v.look.points = withPointEdits(base, key)
  const a = actOf()
  const f = a && await actLoaded(a)
  const kind = a && actWorld(world, a, f!)
  const order = ['loader', ...c.plugins, ...(a ? ['anim', 'interact', 'ik3d'] : []), 'render3d']
  const scene = {
    plugins: order,
    world,
    prefabs: {
      engine: { width, height, dt: game.engine.dt ?? 1 / 60 },
      render3d: { ...(game.render3d ?? {}), camera: { fov: 40, near: 0.01, far: 500, at: [4, 3, 6], look: [0, 1, 0] } },
    },
  }
  await prepare({} as any, [], world) // the mods the scene names: interact's point, object and body, ik3d's
  const at = [0, standing(v), 0]
  const cs = corners(v)
  const still = { vel: [0, 0, 0], spin: [0, 0, 0] }
  const rows: Row[] = [
    { id: 1, kind: 'box3dvehicle', data: { vehicle: c.name, steer, chassis: 3, wheels: cs.map((_, i) => 4 + i) } },
    ...(a ? [{ id: BODY, kind: a.body, data: { ...rowData(kind.reads), interact: null } }] : []),
    { id: 3, kind: fleet.chassis, data: { pos: at, rot: [0, 0, 0, 1], ...still } },
    ...cs.map((k, i) => { const w = wheelAt(k, k.axle.spring.sag); return { id: 4 + i, kind: fleet.wheel, data: { pos: [at[0] + w[0], at[1] + w[1], at[2] + w[2]], rot: [0, 0, 0, 1], ...still } } }),
  ] as Row[]
  if (a) clip = f!.steps[step].clip
  const real = loader()
  let pack: { model: string; clip: THREE.AnimationClip } | undefined
  const makers: Record<string, () => any> = { box3dvehicle, particle3d, anim, interact, ik3d }
  const P: any = { wire: { n: 1, rows, scene, home }, loader: a ? withPack(real, () => pack) : real, render3d: render3d() }
  for (const n of order.slice(1, -1)) P[n] = makers[n]()
  const canvas = document.createElement('canvas')
  view.prepend(canvas)
  P.render3d.mount(canvas)
  real.tick(P)
  P.render3d.tick(P)
  P.render3d.ratio(devicePixelRatio)
  const three = P.render3d.scene as THREE.Scene
  stageIn(three, P.render3d.renderer, Math.max(1.5, v.body.length / 2 + 1))
  const labelsR = new CSS2DRenderer()
  labelsR.setSize(width, height)
  labelsR.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none'
  view.append(labelsR.domElement)
  const controls = new OrbitControls(P.render3d.camera, canvas)
  controls.enableDamping = true
  P.render3d.claim('workshop')
  const proxy = new THREE.Object3D()
  proxy.userData.workshop = true
  lab = { P, world, canvas, controls, labels: labelsR, last: performance.now(), ready: false, car: { name: c.name, fleet, base, order, proxy, act: a } }
  if (a) {
    const r = await actRig(world, real, kind, a, f!)
    pack = r.pack
    lab.rig = r.rig
  }
  gizmo.attachTo(three)
  if (was) {
    P.render3d.camera.position.copy(was.position)
    controls.target.copy(was.target)
  } else framed = false
  lab.ready = true
  lab.last = performance.now()
  fill()
  side()
}
// The look's points with the edits made here: each moved point at its new place, riding the part it
// rode, each turned point given its turn.
function withPointEdits(base: Record<string, any>, key: string): Record<string, any> {
  const out = structuredClone(base), e = frameEdits.get(key)
  if (!e) return out
  for (const [n, p] of Object.entries(e.empties)) out[n] = movedTo(out[n], p)
  for (const [n, turn] of Object.entries(e.turns)) {
    const p = out[n]
    if (p !== undefined) out[n] = Array.isArray(p) ? { at: p, turn } : { ...p, turn }
  }
  return out
}
// The empty box3dvehicle draws for a vehicle's point this frame, or undefined while it is not drawn.
const carPoint = (name: string): THREE.Object3D | undefined => lab?.P.box3dvehicle.point(1, name)
// Whether the car is drawn whole: its look's model on its chassis (`box3dvehicle.model`), when its look
// has one, which box3dvehicle hangs the frame the loader has it, after the chassis is drawn.
const carWhole = (m: THREE.Object3D) => !carOf()?.model || !!m.getObjectByName('box3dvehicle.model')
// The car's chassis as drawn: the drawing its points hang in, the scene's child above them.
function carRoot(): THREE.Object3D | undefined {
  const c = lab!.car!
  for (const n of Object.keys(c.fleet.vehicles[c.name].look.points ?? {})) {
    const o = carPoint(n)
    if (o) return rootOf(o as any, lab!.P.render3d.scene) as THREE.Object3D | undefined
  }
  return undefined
}

// The model's file as the loader holds it now.
const solidNow = (): Solid => JSON.parse(lab!.solid!.text)

// The page's own drawing made again from the model as it stands.
function remake() {
  const s = lab!.solid!, P = lab!.P
  if (s.made) { s.made.root.removeFromParent(); for (const o of s.made.owned) o.dispose() }
  s.made = assemble(THREE, P.solids, P.render3d.dress, solidNow())
  P.render3d.scene.add(s.made.root)
}

// The drawing this frame and its pieces: the solids plugin's row, or the drawers' (the drawing whose
// meshes are of this model's parts), or the page's own.
function locate() {
  const s = lab!.solid!, P = lab!.P
  const m = solidNow()
  let root: THREE.Object3D | undefined
  if (s.made) root = s.made.root
  else if (modelOf()!.stand?.by === 'solids') root = P.solids.group(1)
  else {
    // A drawer hangs the model's meshes in their nodes; the drawing is the scene's child above them.
    P.render3d.scene.traverse((o: THREE.Object3D) => {
      if (root || !(o as THREE.Mesh).isMesh || o.userData.workshop) return
      const r = rootOf(o as any, P.render3d.scene) as THREE.Object3D | undefined
      if (!r) return
      if (r.userData.workshopOf?.text === s.text) { if (r.userData.workshopOf.is) root = r; return }
      // A drawing is the model's when its node groups hold the model's meshes as its parts lay them.
      const found = labels(r as any, m)
      const is = found.size > 0 && found.size === new Set(m.parts.map(p => `${p.node} ${p.paint}`)).size
      r.userData.workshopOf = { text: s.text, is }
      if (is) root = r
    })
  }
  if (root !== s.root) marks.clear()
  s.root = root
  if (!root) { s.groups = new Map(); s.parts = new Map(); return }
  s.groups = s.made ? s.made.groups : nodeGroups(root as any, m) as Map<string, any>
  s.parts = labels(root as any, m, s.groups) as Map<THREE.Object3D, { node: string; paint: string }>
}
// The plugin whose drawing it is: the one that last made meshes of the model's parts through solids,
// by the name it gives `meshes` (`legs3d: model of strider`).
const drawerOf = () => {
  const s = lab!.solid!
  return (lab!.P.solids.whose.get(json(lab!.P.wire, s.key).parts) as string | undefined)?.split(':')[0] ?? s.drawers.map(([n]) => n).join(', ')
}

function close() {
  if (!lab) return
  gizmo.detach()
  marks.clear()
  if (lab.solid) {
    for (const [, d] of [...lab.solid.drawers].reverse()) d.close?.(lab.P)
    lab.P.solids.close()
    if (lab.solid.made) { lab.solid.made.root.removeFromParent(); for (const o of lab.solid.made.owned) o.dispose() }
    lab.P.loader.close?.()
    lab.P.render3d.close()
    lab.controls.dispose()
    lab.labels.domElement.remove()
    lab.canvas.remove()
    lab = undefined
    return
  }
  if (lab.car) {
    // Each plugin let go of in the reverse of the order it is listed, render3d last.
    for (const n of [...lab.car.order].reverse()) if (n !== 'render3d') lab.P[n].close?.(lab.P)
    lab.P.render3d.close()
    lab.controls.dispose()
    lab.labels.domElement.remove()
    lab.canvas.remove()
    lab = undefined
    return
  }
  for (const k of ['anim', 'ik3d', 'loader'] as const) lab.P[k].close?.()
  lab.P.render3d.close()
  lab.controls.dispose()
  lab.labels.domElement.remove()
  lab.canvas.remove()
  lab = undefined
}

// The studio: a warm key casting shadows, a cool fill, a rim, the room's light on every surface, a grid
// and a floor that takes shadows, and a 1.8 m figure beside a model shown alone.
const figure = new THREE.Group()
// `reach` is how far each way of the middle the key's shadow falls: a prop's 1.5 m, a machine's more.
function stageIn(three: THREE.Scene, renderer: THREE.WebGLRenderer | undefined, reach = 1.5) {
  if (renderer) {
    three.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
    three.environmentIntensity = 0.6
  }
  if (three.background === null) three.background = new THREE.Color(0x202226)
  const key = new THREE.DirectionalLight(0xfff1e0, 2.2)
  key.position.set(2, 3, 2).multiplyScalar(Math.max(1, reach / 1.5))
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = key.shadow.camera.bottom = -reach
  key.shadow.camera.right = key.shadow.camera.top = reach
  key.shadow.camera.far = Math.max(500, reach * 8)
  key.shadow.bias = -0.0005
  const fill = new THREE.DirectionalLight(0xdbe6ff, 0.7)
  fill.position.set(-2.5, 1.5, 1)
  const rim = new THREE.DirectionalLight(0xffffff, 1.4)
  rim.position.set(0, 2, -3)
  const across = Math.max(10, Math.ceil(reach * 4))
  const grid = new THREE.GridHelper(across, across * 10, 0x4a4d55, 0x2c2e33)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(across, across), new THREE.ShadowMaterial({ opacity: 0.35 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  figure.clear()
  const grey = new THREE.MeshStandardMaterial({ color: 0x6a6e76, roughness: 0.8, transparent: true, opacity: 0.5 })
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.2, 6, 16), grey)
  torso.position.y = 0.77
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), grey)
  head.position.y = 1.68
  const tall = new CSS2DObject(Object.assign(document.createElement('div'), { className: 'label', textContent: '1.8 m' }))
  tall.position.y = 1.86
  figure.add(torso, head, tall)
  three.add(key, fill, rim, new THREE.HemisphereLight(0xffffff, 0x303030, 0.3), grid, floor, figure, frames.hold, frames.anchor)
}

// ---------------------------------------------------------------- pack clips, tried before they are baked

// A Mixamo bone's name without its `mixamorig…` prefix, which differs between packs and bodies.
const boneName = (name: string) => name.replace(/^mixamorig\d*:?/, '')
type Rest = Map<string, { name: string; quaternion: THREE.Quaternion; position: THREE.Vector3 }>
const restOf = (root: THREE.Object3D): Rest => {
  const r: Rest = new Map()
  root.traverse(o => { if ((o as THREE.Bone).isBone && !r.has(boneName(o.name))) r.set(boneName(o.name), { name: o.name, quaternion: o.quaternion.clone(), position: o.position.clone() }) })
  return r
}
// A pack clip laid on a body as the bake lays it: each bone's turn on each key taken as a turn from
// its rest in the FBX and laid on its rest in the body; the hips keep their travel, scaled by the two
// hip heights; every other bone keeps the body's own length.
function retarget(c: THREE.AnimationClip, from: Rest, onto: Rest, name: string) {
  const tracks: THREE.KeyframeTrack[] = []
  for (const track of c.tracks) {
    const dot = track.name.lastIndexOf('.')
    const bone = boneName(track.name.slice(0, dot)), what = track.name.slice(dot + 1)
    const a = from.get(bone), b = onto.get(bone)
    if (!a || !b) continue
    if (what === 'quaternion') {
      const v = track.values.slice(), q = new THREE.Quaternion(), inv = a.quaternion.clone().invert()
      for (let i = 0; i < v.length; i += 4) q.fromArray(v, i).premultiply(inv).premultiply(b.quaternion).toArray(v, i)
      tracks.push(new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, track.times, v))
    } else if (what === 'position' && bone === 'Hips') {
      const k = Math.abs(a.position.y) > 1e-6 ? b.position.y / a.position.y : 1
      const v = track.values.slice(), p = new THREE.Vector3()
      for (let i = 0; i < v.length; i += 3) p.fromArray(v, i).sub(a.position).multiplyScalar(k).add(b.position).toArray(v, i)
      tracks.push(new THREE.VectorKeyframeTrack(`${b.name}.position`, track.times, v))
    }
  }
  return new THREE.AnimationClip(name, c.duration, tracks)
}
const fbx = new FBXLoader()
const fbxClips = new Map<string, Promise<{ rest: Rest; clip: THREE.AnimationClip }>>()
async function tryPack(choice: string, body: THREE.Object3D, model: string) {
  const key = choice.slice(5)
  let got = fbxClips.get(key)
  if (!got) {
    got = fbx.loadAsync('/packs/' + key.split('/').map(encodeURIComponent).join('/')).then(g => ({ rest: restOf(g), clip: g.animations[0] }))
    fbxClips.set(key, got)
    got.catch(() => fbxClips.delete(key))
  }
  const { rest, clip: raw } = await got
  return { model, clip: retarget(raw, rest, restOf(body), choice) }
}

// ---------------------------------------------------------------- the frame

// The bone frames the hold and the anchor are set in: a body bone's world frame with its scale taken
// off, as anim hangs a prop and ik3d anchors one. Each holds the proxy the gizmo moves.
const frames = { hold: new THREE.Group(), anchor: new THREE.Group() }
const proxies = { hold: new THREE.Object3D(), anchor: new THREE.Object3D() }
for (const k of ['hold', 'anchor'] as const) {
  frames[k].matrixAutoUpdate = false
  frames[k].add(proxies[k])
  frames[k].userData.workshop = true
}
function scaleFree(o: THREE.Object3D) {
  o.updateWorldMatrix(true, false)
  const at = new THREE.Vector3(), turn = new THREE.Quaternion(), scale = new THREE.Vector3()
  o.matrixWorld.decompose(at, turn, scale)
  return new THREE.Matrix4().compose(at, turn, scale.set(1, 1, 1))
}
function setFrame(k: 'hold' | 'anchor', bone: string | undefined) {
  const b = bone && lab?.P.anim.socket(ROW, bone)
  frames[k].visible = !!b
  if (!b) return
  frames[k].matrix.copy(scaleFree(b))
  frames[k].matrixWorldNeedsUpdate = true
  frames[k].updateMatrixWorld(true)
}

// Every mount point moved here and not saved, set on the model drawn now, made where it is missing.
function applyPoints() {
  const m = shown(), glb = modelOf()?.type === 'glb' ? modelOf()!.file : undefined
  if (!m || !glb) return
  for (const [name, p] of Object.entries(pointEdits.get(glb) ?? {})) {
    let o = pointIn(m, name)
    if (!o) { o = new THREE.Object3D(); o.name = name; m.add(o) }
    o.position.fromArray(p.at)
    o.quaternion.fromArray(p.turn)
  }
  m.updateMatrixWorld(true)
}
function pointIn(m: THREE.Object3D, name: string) {
  let found: THREE.Object3D | undefined
  m.traverse(o => { if (!found && o !== m && !o.userData.workshop && o.name === name) found = o })
  return found
}

let framed = false
function loop(now: number) {
  requestAnimationFrame(loop)
  if (!lab?.ready) return
  const { P } = lab
  const dt = Math.min(0.1, (now - lab.last) / 1000)
  lab.last = now
  if (lab.car) {
    try {
      // As the game's scene ticks them, in the order it lists them: each plugin's tick, then each one's
      // afterTick but render3d's, the page's own, and render3d's afterTick, which draws. The car row
      // steered as the field says; a body in an interaction placed first, at its step and playhead.
      const acting = !!lab.car.act
      P.wire.rows[0].data.steer = steer
      if (acting) {
        const d = durOf()
        if (!paused) clipT = d > 0 ? (clipT + dt) % d : 0
        place()
      }
      P.wire.n++
      for (const n of lab.car.order) P[n].tick?.(P)
      for (const n of lab.car.order) if (n !== 'render3d') P[n].afterTick?.(P)
      if (acting) showTime()
      gizmo.tick()
      marks.tick()
      const car = shown()
      if (!framed && car && carWhole(car) && (!acting || P.anim.model(BODY))) { framed = true; frameView(mode) }
      lab.controls.update()
      P.render3d.afterTick()
      lab.labels.render(P.render3d.scene, P.render3d.camera)
    } catch (e) {
      fail(e)
    }
    return
  }
  if (lab.solid) {
    try {
      // As the game's scene ticks them: the loader, anim, the drawers, interact, ik3d, render3d's tick,
      // then anim's afterTick, solids' and the drawers' (listed after solids, as `shipped`), interact's
      // (the body on its point as the drawers placed it this frame) and ik3d's, and render3d's
      // afterTick, which draws. A body in an interaction is placed first, at its step and playhead.
      const acting = !!lab.solid.act
      if (acting) {
        const d = durOf()
        if (!paused) clipT = d > 0 ? (clipT + dt) % d : 0
        place()
      }
      P.wire.n++
      P.loader.tick(P)
      if (acting) P.anim.tick(P)
      for (const [, d] of lab.solid.drawers) d.tick?.(P)
      if (acting) {
        P.interact.tick(P)
        P.ik3d.tick(P)
      }
      P.render3d.tick(P)
      if (acting) P.anim.afterTick()
      P.solids.afterTick(P)
      for (const [, d] of lab.solid.drawers) d.afterTick?.(P)
      if (acting) {
        P.interact.afterTick(P)
        P.ik3d.afterTick(P)
        showTime()
      }
      locate()
      gizmo.tick()
      marks.tick()
      // In an interaction, framed once the body is drawn too, so both are in view.
      if (!framed && lab.solid.root && (!acting || P.anim.model(BODY))) { framed = true; frameView(mode) }
      lab.controls.update()
      P.render3d.afterTick()
      lab.labels.render(P.render3d.scene, P.render3d.camera)
    } catch (e) {
      fail(e)
    }
    return
  }
  try {
    const row = P.wire.rows[0]
    if (row && lab.rig) {
      const d = durOf()
      if (!paused) clipT = d > 0 ? (clipT + dt) % d : 0
      row.data.clip = clip
      row.data.clipT = clipT
    }
    P.loader.tick(P)
    P.anim.tick(P)
    applyPoints()
    if (row) P.ik3d.tick(P)
    P.render3d.tick(P)
    P.anim.afterTick()
    applyPoints()
    if (row) P.ik3d.afterTick(P)
    const f = fitOf()
    setFrame('hold', f && !f.ikOn ? f.hold.bone : undefined)
    setFrame('anchor', f && f.ikOn ? f.ik.anchor!.bone : undefined)
    gizmo.tick()
    marks.tick()
    if (!framed && (lab.stage || P.anim.model(ROW))) { framed = true; frameView(mode) }
    lab.controls.update()
    P.render3d.afterTick()
    lab.labels.render(P.render3d.scene, P.render3d.camera)
    showTime()
  } catch (e) {
    fail(e)
  }
}
requestAnimationFrame(loop)

const durOf = () => (lab?.rig?.table[clip]?.dur ?? 0)

// The body placed as the game places it in the step shown, at the playhead: the machine posed as its
// game poses it in the step, the body's row in the step `clipT` seconds in, and interact's own `advance`
// (handed no time) putting it on the step's point, facing as `turn` turns it.
// The points are read off the models as edited here, so a moved point moves the body this frame.
function place() {
  const a = labAct()!, P = lab!.P
  const st = actNow(a)!.steps[step]
  const [machine, me] = P.wire.rows as Row[]
  Object.assign(machine.data, poseOf(a, st))
  if (clip !== st.clip) { clip = st.clip; clipT = 0 }
  // A step that holds lasts for ever, its clip looping; one that does not is shown short of its end,
  // where interact would hand the body to the next step.
  const d = durOf()
  const t = st.hold || d <= 0 ? clipT : Math.min(clipT, d - 1e-6)
  me.data.clip = clip
  me.data.clipT = t
  me.data.interact = { machine: machine.id, kind: machine.kind, name: a.name, step, t }
  advance(me, wOf(P), 0)
}

// ---------------------------------------------------------------- overlays: triangles, bounds, empties, pins

// What the page draws on the model drawn now, made again whenever that model is another object (a
// new load, or anim hanging its prop again).
const marks = (() => {
  let on: THREE.Object3D | undefined
  let whole = false // a car drawn with its look's model, when the marks were drawn
  let made: THREE.Object3D[] = []
  let points: THREE.Object3D[] = [] // the dots of a step's points, placed each frame
  function clear() {
    for (const o of made) {
      o.traverse(c => { if (c instanceof CSS2DObject) c.element.remove() })
      o.removeFromParent()
    }
    made = []
    points = []
    on = undefined
  }
  // A solids model's: its tris, meshes, paints, nodes and empties counted off the model's meshes in
  // the drawing; its bounds; each node a frame of short axes with its name (a node no part hangs in,
  // a mount, in amber), each empty a dot; the pins.
  function drawSolid(m: THREE.Object3D) {
    const s = lab!.solid!, model = solidNow()
    let tris = 0
    const shownParts = [...s.parts.keys()].filter(drawnNow)
    for (const mesh of shownParts) {
      const g = (mesh as THREE.Mesh).geometry
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3
      for (const mat of [(mesh as THREE.Mesh).material].flat()) (mat as THREE.MeshStandardMaterial).wireframe = wire
    }
    const box = localBox(m)
    const size = box.getSize(new THREE.Vector3())
    const nodes = Object.keys(model.nodes ?? {}).length, empties = Object.keys(model.empties ?? {}).length
    $('#hud').textContent = `${sel.model}  ·  ${modelOf()?.file}  ·  solids\n${Math.round(tris).toLocaleString()} tris · ${shownParts.length} meshes drawn (of ${s.parts.size}) · ${Object.keys(model.paints).length} paints · ${model.parts.length} parts · ${nodes} nodes · ${empties} empties\n` +
      `bounds ${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)} m\n${s.by}`
    bounds(m, box, size)
    const st = stepNow()
    if (showEmpties && st) dots(st)
    else if (showEmpties) {
      const hung = new Set(model.parts.map(p => p.node))
      const reach = Math.max(0.15, Math.max(size.x, size.y, size.z) * 0.04)
      for (const name of Object.keys(model.nodes ?? {})) {
        const g = s.groups.get(name)
        if (!g) continue
        const mark = new THREE.AxesHelper(reach)
        mark.userData.workshop = true
        ;(mark.material as THREE.Material).depthTest = false
        mark.renderOrder = 10
        const l = new CSS2DObject(Object.assign(document.createElement('div'), { className: 'label', textContent: name }))
        if (!hung.has(name)) l.element.style.color = '#e0a33a'
        mark.add(l)
        g.add(mark)
        made.push(mark)
      }
      for (const [name, at] of Object.entries(model.empties ?? {})) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(reach * 0.12, 12, 8), new THREE.MeshBasicMaterial({ color: 0x5bbf7a, depthTest: false }))
        dot.renderOrder = 10
        dot.userData.workshop = true
        dot.position.fromArray(pointOf(at))
        const l = new CSS2DObject(Object.assign(document.createElement('div'), { className: 'label', textContent: name }))
        dot.add(l)
        m.add(dot)
        made.push(dot)
      }
    }
    pinsOn(m)
  }
  // A machine's points as dots in the scene, placed again each frame (`tick`): in an interaction the
  // step's points alone, each named with what the step does there (`at`, the hand or foot that reaches
  // it); else, a vehicle alone, every point of its look, by its name.
  function dots(st: Step | undefined, all: string[] = []) {
    const roles = new Map<string, string[]>()
    const role = (n: string, r?: string) => roles.set(n, [...(roles.get(n) ?? []), ...(r ? [r] : [])])
    if (st) {
      role(st.at, 'at')
      for (const l of st.ik ?? []) role(l.target, l.bones[2])
    } else for (const n of all) role(n)
    for (const [name, rs] of roles) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshBasicMaterial({ color: 0x5bbf7a, depthTest: false }))
      dot.renderOrder = 10
      dot.userData.workshop = true
      dot.userData.point = name
      const l = new CSS2DObject(Object.assign(document.createElement('div'), { className: 'label', textContent: rs.length ? `${name} · ${rs.join(', ')}` : name }))
      dot.add(l)
      lab!.P.render3d.scene.add(dot)
      made.push(dot)
      points.push(dot)
    }
  }
  // The bounds of what is drawn of the model, a box with its three lengths, hung on it.
  function bounds(m: THREE.Object3D, box: THREE.Box3, size: THREE.Vector3) {
    if (!showBounds || box.isEmpty()) return
    const lift = new THREE.Group()
    lift.userData.workshop = true
    lift.add(new THREE.Box3Helper(box, 0xe0a33a))
    for (const [axis, len] of [['x', size.x], ['y', size.y], ['z', size.z]] as const) {
      const p = box.getCenter(new THREE.Vector3())
      p[axis] = box.max[axis]
      if (axis !== 'y') p.y = box.min.y
      const l = new CSS2DObject(Object.assign(document.createElement('div'), { className: 'label', textContent: `${axis} ${len.toFixed(3)} m` }))
      l.element.style.color = '#e0a33a'
      l.position.copy(p)
      lift.add(l)
    }
    m.add(lift)
    made.push(lift)
  }
  // A vehicle's: who draws it and from where, its chassis's tris and meshes as drawn (the wheels and the
  // corners stand beside it), its bounds, and its points as dots. A vehicle has no notes, so no pins.
  function drawCar(m: THREE.Object3D) {
    const c = lab!.car!, car = carOf()!, a = c.act
    let tris = 0, meshes = 0
    m.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || o.userData.workshop) return
      meshes++
      const g = mesh.geometry
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3
      for (const mat of [mesh.material].flat()) (mat as THREE.MeshStandardMaterial).wireframe = wire
    })
    const box = localBox(m), size = box.getSize(new THREE.Vector3())
    const names = Object.keys(c.fleet.vehicles[c.name].look.points ?? {})
    $('#hud').textContent = `vehicle · ${c.name}  ·  ${car.files.join(', ')}\n${Math.round(tris).toLocaleString()} tris · ${meshes} meshes on the chassis · ${names.length} points\n` +
      `chassis bounds ${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)} m\n` +
      `drawn by box3dvehicle, its look ${car.model ? `the model ${car.model}` : 'drawn in code'}, on still rows (${car.scene})${c.order.includes('particle3d') ? ', its exhaust by particle3d' : ''}` +
      (a ? `\n${a.body} in its ${a.name} (${a.file})` : '')
    bounds(m, box, size)
    if (showEmpties) dots(stepNow(), names)
  }
  function pinsOn(m: THREE.Object3D) {
    const pins = new THREE.Group()
    pins.userData.workshop = true
    for (const n of notes) {
      const el = document.createElement('div')
      el.className = `pin ${n.status}`
      el.textContent = String(n.id)
      el.style.pointerEvents = 'auto'
      el.onclick = () => goTo(n)
      const p = new CSS2DObject(el)
      p.position.fromArray(n.at)
      pins.add(p)
    }
    m.add(pins)
    made.push(pins)
  }
  function draw(m: THREE.Object3D) {
    clear()
    on = m
    whole = !!lab?.car && carWhole(m)
    if (lab?.solid) return drawSolid(m)
    if (lab?.car) return drawCar(m)
    let tris = 0, meshes = 0
    const materials = new Set<string>()
    m.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || o.userData.workshop) return
      meshes++
      const g = mesh.geometry
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(mat.name || '(unnamed)')
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) (mat as THREE.MeshStandardMaterial).wireframe = wire
    })
    const box = localBox(m)
    const size = box.getSize(new THREE.Vector3())
    $('#hud').textContent = `${sel.model}  ·  ${modelOf()?.file}\n${Math.round(tris).toLocaleString()} tris · ${meshes} meshes · ${materials.size} material${materials.size === 1 ? '' : 's'}\n` +
      `bounds ${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)} m`
    bounds(m, box, size)
    if (showEmpties) {
      const empties: THREE.Object3D[] = []
      m.traverse(o => { if (o !== m && !o.userData.workshop && !o.parent?.userData.workshop && o.type === 'Object3D' && !(o instanceof CSS2DObject) && !o.children.some(c => (c as THREE.Mesh).isMesh)) empties.push(o) })
      for (const o of empties) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), new THREE.MeshBasicMaterial({ color: 0x5bbf7a, depthTest: false }))
        dot.renderOrder = 10
        dot.userData.workshop = true
        const l = new CSS2DObject(Object.assign(document.createElement('div'), { className: 'label', textContent: o.name || '(empty)' }))
        l.position.y = 0.02
        dot.add(l)
        o.add(dot)
        made.push(dot)
      }
    }
    pinsOn(m)
  }
  return {
    clear,
    redraw() { const m = shown(); if (m) draw(m); else clear() },
    tick() {
      const m = shown()
      // A car is drawn again once its look's model has come, so its counts and bounds are its own.
      if (m !== on || (m && lab?.car && carWhole(m) !== whole)) { if (m) draw(m); else { clear(); $('#hud').textContent = sel.body ? `${sel.body}  ·  ${clip}` : '' } }
      // A solids machine's points where interact's point mod puts them; a vehicle's on the empties
      // box3dvehicle draws, which ride the steering wheel as it turns.
      if (points.length && lab?.solid?.act) {
        const w = wOf(lab.P), machine = lab.P.wire.rows[0] as Row
        for (const dot of points) dot.position.fromArray(placeOf(w, machine, dot.userData.point).at)
      } else if (points.length && lab?.car) {
        for (const dot of points) {
          const o = carPoint(dot.userData.point)
          dot.visible = !!o
          if (o) o.getWorldPosition(dot.position)
        }
      }
      // A point made after the marks were drawn gets its mark.
      if (m && showEmpties && !lab?.solid && !lab?.car) for (const name of POINTS) { const o = pointIn(m, name); if (o && !o.children.some(c => c.userData.workshop)) { draw(m); break } }
    },
  }
})()

// Whether an object is drawn this frame: it and every group it hangs in shown (a structure's ruin is not).
function drawnNow(o: THREE.Object3D | null) {
  for (; o; o = o.parent) if (!o.visible) return false
  return true
}
function localBox(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true)
  const toRoot = root.matrixWorld.clone().invert()
  const box = new THREE.Box3()
  root.traverse(o => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || o.userData.workshop || o.parent?.userData.workshop) return
    if (lab?.solid && (!lab.solid.parts.has(o) || !drawnNow(o))) return // a solids model's own meshes as drawn, not what hangs on it
    mesh.geometry.computeBoundingBox()
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(toRoot.clone().multiply(mesh.matrixWorld)))
  })
  return box
}

// ---------------------------------------------------------------- views

const VIEWS: [View, string][] = [['free', 'Free'], ['front', 'Front'], ['side', 'Side'], ['top', 'Top'], ['close', 'Close-up']]
$('#views').replaceChildren(...VIEWS.map(([v, text]) => {
  const b = document.createElement('button')
  b.textContent = text
  b.dataset.view = v
  b.onclick = () => { mode = v; frameView(v) }
  return b
}))
function frameView(v: View) {
  document.querySelectorAll<HTMLButtonElement>('#views button').forEach(b => b.classList.toggle('on', b.dataset.view === v))
  if (!lab) return
  const camera = lab.P.render3d.camera as THREE.PerspectiveCamera
  const m = shown()
  const body = lab.car ? undefined : lab.P.anim?.model(ROW) as THREE.Object3D | undefined
  // A model alone, or on a body, is framed on the model; a body alone on the body.
  const box = m ? localBox(m).applyMatrix4(m.matrixWorld) : body ? new THREE.Box3().setFromObject(body) : new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5))
  // A machine in an interaction is framed with the body where the step puts it.
  const acting = labAct() && lab.P.anim.model(BODY) as THREE.Object3D | undefined
  if (acting) box.union(new THREE.Box3().setFromObject(acting))
  if (!m && lab.stage) figure.position.set(-0.6, 0, 0)
  figure.visible = !!lab.stage || !!lab.solid || !!lab.car
  if ((lab.solid || lab.car) && m) figure.position.set(box.min.x - 0.6, 0, (box.min.z + box.max.z) / 2)
  if (lab.stage) {
    const own = localBox(lab.stage)
    lab.stage.position.set(-(own.min.x + own.max.x) / 2, -own.min.y, -(own.min.z + own.max.z) / 2)
    lab.stage.updateMatrixWorld(true)
    box.copy(localBox(lab.stage).applyMatrix4(lab.stage.matrixWorld))
    figure.position.set(box.min.x - 0.5, 0, (box.min.z + box.max.z) / 2)
  }
  const centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3())
  let reach = Math.max(size.x, size.y, size.z, 0.2) / (2 * Math.tan(camera.fov * DEG / 2)) * 1.3
  if (body && m) reach = Math.max(reach, 1.6) // a fit is seen with the body round it
  const dirs: Record<View, number[]> = { free: [0.7, 0.45, 1], front: [0, 0, 1], side: [1, 0, 0], top: [0, 1, 0.001], close: [0.6, 0.35, 1] }
  const d = new THREE.Vector3().fromArray(dirs[v]).normalize().multiplyScalar(v === 'close' ? reach * 0.4 : reach)
  lab.controls.target.copy(centre)
  camera.position.copy(centre).add(d)
  camera.updateProjectionMatrix()
}

// ---------------------------------------------------------------- the left column

function side() {
  const models = $('#models')
  models.replaceChildren(...game.models.map(m => {
    const row = document.createElement('div')
    row.className = 'item' + (m.key === sel.model ? ' sel' : '')
    row.innerHTML = `<div class="top"><span></span><span class="count${m.open ? '' : ' zero'}">${m.open}</span></div><div class="on-bodies"></div>`
    row.querySelector('.top span')!.textContent = m.key
    row.onclick = () => choose({ model: m.key })
    const on = row.querySelector('.on-bodies')!
    if (m.type === 'solids') {
      // A solids model says what it is and how the game finds it; no body can hold one (anim hangs a glb).
      const k = document.createElement('div')
      k.className = 'kind'
      k.textContent = `solids · ${m.named?.length ? m.named.map(n => n.by === 'solids' ? `solids' ${n.kind}` : n.path).join(', ') : 'named by nothing'}`
      k.title = m.named?.map(n => `${n.path}: ${n.scenes.join(', ')}`).join('\n') ?? ''
      row.querySelector('.top')!.after(k)
      return row
    }
    // A body's own model is not a prop; anything else may be tried in any body's hand.
    for (const b of game.bodies.filter(() => !game.bodies.some(x => x.model === m.key))) {
      const btn = document.createElement('button')
      const holds = b.props.some(p => p.model === m.key)
      btn.textContent = `on ${b.kind}`
      btn.className = (holds ? 'holds' : '') + (m.key === sel.model && b.kind === sel.body ? ' on' : '')
      btn.title = holds ? `${b.kind} holds ${m.key} in the game` : `try ${m.key} on ${b.kind}: Save adds it to ${b.kind}'s props`
      btn.onclick = e => { e.stopPropagation(); choose({ model: m.key, body: b.kind }) }
      on.append(btn)
    }
    return row
  }), ...(game.vehicles ?? []).map(v => {
    // A vehicle of box3dvehicle's fleet with interactions: a machine, drawn by box3dvehicle.
    const row = document.createElement('div')
    row.className = 'item' + (v.name === sel.vehicle ? ' sel' : '')
    row.innerHTML = '<div class="top"><span></span></div><div class="kind"></div>'
    row.querySelector('.top span')!.textContent = `vehicle · ${v.name}`
    row.querySelector('.kind')!.textContent = `box3dvehicle, ${v.model ? `its model ${v.model}` : 'drawn in code'} · ${actsFor(VEHICLE).map(a => a.name).join(', ')}`
    row.title = `world.box3dvehicle.vehicles.${v.name}, its points in ${v.files.join(', ')}`
    row.onclick = () => choose({ vehicle: v.name })
    return row
  }))
  $('#bodies').replaceChildren(...game.bodies.map(b => {
    const row = document.createElement('div')
    row.className = 'item' + (b.kind === sel.body && !sel.model ? ' sel' : '')
    row.innerHTML = `<div class="top"><span></span><span class="count zero"></span></div>`
    row.querySelector('.top span')!.textContent = `${b.kind}`
    row.querySelector('.count')!.textContent = b.props.map(p => p.model).join(', ') || 'holds nothing'
    if (b.drift.length) {
      const d = document.createElement('div')
      d.className = 'drift'
      d.textContent = `differs in ${b.drift.join(', ')}`
      d.title = `the numbers for ${b.kind} in these scenes are not the first scene's (${b.scenes[0]}); the workshop shows ${b.scenes[0]}'s and Save writes every scene`
      row.append(d)
    }
    row.onclick = () => choose({ body: b.kind })
    return row
  }))
}

function choose(c: { model?: string; body?: string; vehicle?: string }) {
  sel.model = c.model
  sel.body = c.body
  sel.vehicle = c.vehicle
  if (c.vehicle) steer = 0
  const q = new URLSearchParams({ game: game.game })
  if (sel.model) q.set('model', sel.model)
  if (sel.body) q.set('body', sel.body)
  if (sel.vehicle) q.set('vehicle', sel.vehicle)
  history.replaceState(null, '', `?${q}`)
  const f = fitOf()
  target = f ? (f.ikOn ? 'anchor' : 'hold') : POINTS[0]
  act = undefined
  step = 0
  framed = false
  refreshNotes()
  build()
}

// ---------------------------------------------------------------- a solids model's nodes and empties

// A solids model's nodes and empties, or a vehicle's points (by its key, `carKey`), as its file holds them.
async function framesOf(file: string) {
  if (!savedFrames.has(file)) savedFrames.set(file, await api<Frames>(framesUrl(file)))
  return savedFrames.get(file)!
}
// A model's file with the nodes and empties moved here put in it, nodes it lacks added last.
function withEdits(model: Solid, file: string): Solid {
  const e = frameEdits.get(file)
  if (!e) return model
  model.nodes ??= {}
  for (const [name, n] of Object.entries(e.nodes)) {
    const was = model.nodes[name]
    const turn = n.turn[0] || n.turn[1] ? { turn: n.turn } : {}
    if (was) { was.at = n.at; if (was.turn || n.turn[0] || n.turn[1]) was.turn = n.turn } else model.nodes[name] = { ...(n.parent === undefined ? {} : { parent: n.parent }), at: n.at, ...turn }
  }
  if (Object.keys(e.empties).length) model.empties = { ...(model.empties ?? {}), ...Object.fromEntries(Object.entries(e.empties).map(([name, at]) => [name, movedTo(model.empties?.[name], at)])) }
  // An empty turned here: `{ at, turn }`, its part kept.
  for (const [name, turn] of Object.entries(e.turns)) {
    const was = model.empties?.[name]
    if (was === undefined) continue
    model.empties![name] = Array.isArray(was) ? { at: was, turn } : { ...was, turn }
  }
  return model
}
// The model a target is of: in an interaction, the first model of a module the machine is fitted with
// that has the empty, as interact's point mod looks for it, else the model shown; a vehicle's points
// are its own.
type Fitted = SolidLab['fitted'][number]
function where(name: string): { file: string; fitted?: Fitted } | undefined {
  const s = lab?.solid
  if (s?.act) for (const f of s.fitted) if ((frameEdits.get(f.file)?.empties[name] ?? savedFrames.get(f.file)?.empties[name]) !== undefined) return { file: f.file, fitted: f }
  const file = ownFile()
  return file ? { file } : undefined
}
// A node or an empty as it stands now: moved here, else as the file holds it. A node's `turn` is
// [rx, ry] radians; an empty's `quat` its quaternion, as a glb's empty holds one (none: unturned).
function frameNow(name: string): { at: number[]; turn?: number[]; quat?: number[]; node: boolean; parent?: string } | undefined {
  const w = where(name)
  if (!w) return undefined
  const e = frameEdits.get(w.file), saved = savedFrames.get(w.file)
  const n = e?.nodes[name] ?? saved?.nodes[name]
  if (n) return { at: n.at, turn: n.turn, node: true, parent: n.parent ?? saved?.nodes[name]?.parent }
  const p = e?.empties[name] ?? saved?.empties[name]
  return p && { at: p, quat: e?.turns[name] ?? saved?.turns[name], node: false }
}
// A node or an empty moved here (an empty turned, by `quat`): the loader's copy of its model written
// again, so whatever draws it draws it moved this frame (mount3d makes a module again when its model
// changes).
function moveFrame(name: string, at: number[], turn?: number[], parent?: string, quat?: number[]) {
  const w = where(name)!
  const e = frameEdits.get(w.file) ?? { nodes: {}, empties: {}, turns: {} }
  const r = (v: number[]) => v.map(x => +x.toFixed(4) || 0)
  const now = frameNow(name)
  if (now?.node || (!now && turn)) e.nodes[name] = { ...(parent ?? now?.parent) !== undefined ? { parent: parent ?? now?.parent } : {}, at: r(at), turn: r(turn ?? now?.turn ?? [0, 0]) }
  else {
    e.empties[name] = r(at)
    if (quat) e.turns[name] = quat.map(x => +x.toFixed(6) || 0)
  }
  frameEdits.set(w.file, e)
  const c = lab?.car
  // A vehicle's look in the stand-in's fleet, so box3dvehicle draws the car again with it this frame.
  if (c) { c.fleet.vehicles[c.name].look.points = withPointEdits(c.base, w.file); return }
  const s = lab?.solid
  if (!s) return
  if (w.fitted) {
    w.fitted.text = JSON.stringify(withEdits(JSON.parse(w.fitted.text) as Solid, w.file))
    written(w.fitted.url, w.fitted.text)
    return
  }
  const base = JSON.parse(s.text) as Solid
  // The file's own values with this page's edits: what the file holds, with the edits over it.
  s.text = JSON.stringify(withEdits(base, w.file))
  written(s.url, s.text)
  if (s.made) remake()
}
// The targets of a machine or a solids model: in an interaction, the step's points alone; else every
// node and empty a solids model has, or every point of a vehicle's look, as it stands here.
function frameNames(): string[] {
  const st = stepNow()
  if (st) return stepPoints(st)
  const file = ownFile()
  if (!file) return []
  const saved = savedFrames.get(file), e = frameEdits.get(file)
  return [...new Set([...Object.keys(saved?.nodes ?? {}), ...Object.keys(e?.nodes ?? {}), ...Object.keys(saved?.empties ?? {}), ...Object.keys(e?.empties ?? {})])]
}
// The files a save of the solids model or the vehicle shown writes points into: its own (a vehicle's
// key), and in an interaction on a solids model each fitted module's.
const frameFiles = (): string[] => [...(ownFile() ? [ownFile()!] : []), ...(lab?.solid?.fitted ?? []).map(f => f.file)]
// Whether the thing shown is tuned by its points: a solids model, or a vehicle.
const framing = () => isSolid() || !!sel.vehicle
// The nodes and empties of a solids model's file moved here and not saved.
function movedIn(file: string): string[] {
  const saved = savedFrames.get(file), e = frameEdits.get(file)
  return [
    ...Object.entries(e?.nodes ?? {}).filter(([n, x]) => { const s = saved?.nodes[n]; return !s || JSON.stringify([s.at, s.turn]) !== JSON.stringify([x.at, x.turn]) }).map(([n]) => n),
    ...Object.entries(e?.empties ?? {}).filter(([n, x]) => JSON.stringify(saved?.empties[n]) !== JSON.stringify(x) || (e!.turns[n] !== undefined && JSON.stringify(saved?.turns[n]) !== JSON.stringify(e!.turns[n]))).map(([n]) => n),
  ]
}

// ---------------------------------------------------------------- mount points

async function pointsOf(glb: string) {
  if (!savedPoints.has(glb)) savedPoints.set(glb, await api<Record<string, Point>>(`/api/points?file=${encodeURIComponent(glb)}`))
  return savedPoints.get(glb)!
}
// A point as it stands now: moved here, else as the glb holds it.
function pointNow(name: string): Point | undefined {
  const glb = modelOf()?.file
  if (!glb) return undefined
  return pointEdits.get(glb)?.[name] ?? savedPoints.get(glb)?.[name]
}
function setPoint(name: string, p: Point) {
  const glb = modelOf()!.file
  const all = pointEdits.get(glb) ?? {}
  all[name] = { at: p.at.map(v => +v.toFixed(4)), turn: p.turn.map(v => +v.toFixed(6)) }
  pointEdits.set(glb, all)
}
// The empties a model has, and the mount points it lacks, which a first move or Take makes.
function pointNames() {
  const m = shown()
  const names = new Set<string>(POINTS)
  m?.traverse(o => { if (o !== m && !o.userData.workshop && !o.parent?.userData.workshop && o.type === 'Object3D' && !(o instanceof CSS2DObject) && !o.children.some(c => (c as THREE.Mesh).isMesh) && o.name) names.add(o.name) })
  return [...names]
}
// Where a mount point the model lacks most likely goes, from its bounds: the stock at its back, the
// grip under its middle, the support ahead of that.
function guess(name: string): Point {
  const m = shown()!
  const box = localBox(m), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3())
  const at = name === 'stock' ? [mid.x, mid.y, box.max.z] : name === 'grip' ? [mid.x, box.min.y + size.y * 0.35, mid.z + size.z * 0.15] : [mid.x, mid.y, mid.z - size.z * 0.2]
  return { at, turn: [0, 0, 0, 1] }
}

// ---------------------------------------------------------------- the gizmo and the fit panel

const gizmo = (() => {
  let tc: TransformControls | undefined
  let helper: THREE.Object3D | undefined
  const panel = $('#fit')
  const fields = [...panel.querySelectorAll<HTMLInputElement>('input[data-k]')]

  // The value set now: place and turn (degrees, XYZ) of the hold, the anchor or a point.
  function get(): { at: number[]; turn: number[] } | undefined {
    if (lab?.solid || lab?.car) {
      // A node's turn [rx, ry] in radians, shown in degrees with no z; an empty's quaternion in degrees,
      // XYZ, as a glb's point is.
      const n = frameNow(target)
      if (!n) return undefined
      if (n.node) return { at: n.at, turn: [n.turn![0] / DEG, n.turn![1] / DEG, 0] }
      const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(n.quat ?? [0, 0, 0, 1]), 'XYZ')
      return { at: n.at, turn: [e.x, e.y, e.z].map(v => v / DEG) }
    }
    const f = fitOf()
    if (target === 'hold' && f) return { at: f.hold.at, turn: f.hold.turn }
    if (target === 'anchor' && f) return { at: f.ik.anchor!.at, turn: f.ik.anchor!.turn }
    const p = pointNow(target)
    if (!p) return undefined
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(p.turn), 'XYZ')
    return { at: p.at, turn: [e.x, e.y, e.z].map(v => v / DEG) }
  }
  function set(at: number[], turnDeg: number[]) {
    const f = fitOf()
    const r = (v: number[], n: number) => v.map(x => +x.toFixed(n))
    if (lab?.solid || lab?.car) {
      const n = frameNow(target)
      if (n?.node) moveFrame(target, at, [turnDeg[0] * DEG, turnDeg[1] * DEG])
      else {
        // An empty's turn written only once it is turned, so a move alone leaves an unturned point bare.
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(turnDeg[0] * DEG, turnDeg[1] * DEG, turnDeg[2] * DEG, 'XYZ'))
        const turned = n?.quat !== undefined || turnDeg.some(v => Math.abs(v) > 1e-6)
        moveFrame(target, at, undefined, undefined, turned ? q.toArray() as number[] : undefined)
      }
      return
    }
    if (target === 'hold' && f) { f.hold.at = r(at, 4); f.hold.turn = r(turnDeg, 2); return }
    if (target === 'anchor' && f) { f.ik.anchor!.at = r(at, 4); f.ik.anchor!.turn = r(turnDeg, 2); return }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(turnDeg[0] * DEG, turnDeg[1] * DEG, turnDeg[2] * DEG, 'XYZ'))
    setPoint(target, { at, turn: q.toArray() as number[] })
  }
  // The frame a fitted module's empty, or a vehicle's point, is set in, as the machine's plugin hung it
  // this frame: the empty's own object (interact's `object` mod; a vehicle's, box3dvehicle's `point`, the
  // same object, with or without an interaction) less its point, turned as the empty is: a module's
  // frame, the chassis's, or the turned steering wheel's for a point riding it. Held still while the
  // gizmo drags, so the module or the car made again under it each move does not move the frame.
  const moduleGroup = new THREE.Group()
  moduleGroup.matrixAutoUpdate = false
  moduleGroup.userData.workshop = true
  function moduleFrame(name: string, at: number[], quat = [0, 0, 0, 1]): THREE.Object3D | undefined {
    const P = lab!.P
    if (moduleGroup.parent !== P.render3d.scene) P.render3d.scene.add(moduleGroup)
    if (tc?.dragging) return moduleGroup
    const o = lab!.car ? carPoint(name) : mod<(plugins: any, machine: number, name: string) => THREE.Object3D | undefined>(P.wire.scene.world, 'interact', 'object')?.(P, 1, name)
    if (!o) return undefined
    // The empty's world frame with its own place and turn taken off.
    const own = new THREE.Matrix4().compose(new THREE.Vector3().fromArray(at), new THREE.Quaternion().fromArray(quat), new THREE.Vector3(1, 1, 1))
    moduleGroup.matrix.copy(scaleFree(o).multiply(own.invert()))
    moduleGroup.matrixWorldNeedsUpdate = true
    moduleGroup.updateMatrixWorld(true)
    return moduleGroup
  }
  // The object the gizmo moves for what is set now.
  function object(): THREE.Object3D | undefined {
    if (lab?.car) {
      // A vehicle's point: the proxy hung in the frame of the empty box3dvehicle draws for it.
      const n = frameNow(target)
      const frame = n && moduleFrame(target, n.at, n.quat)
      if (!frame) return undefined
      if (lab.car.proxy.parent !== frame) frame.add(lab.car.proxy)
      return lab.car.proxy
    }
    if (lab?.solid) {
      // The proxy, hung in the frame the node or empty is set in: its parent node's, else the model's;
      // a fitted module's empty in its module's frame as the machine's plugin hangs it (`moduleFrame`).
      const s = lab.solid, n = frameNow(target)
      if (!n || !s.root) return undefined
      const frame = where(target)?.fitted ? moduleFrame(target, n.at, n.quat) : (n.parent !== undefined && s.groups.get(n.parent)) || s.root
      if (!frame) return undefined
      if (s.proxy.parent !== frame) frame.add(s.proxy)
      return s.proxy
    }
    if (target === 'hold') return proxies.hold
    if (target === 'anchor') return proxies.anchor
    const m = shown()
    if (!m) return undefined
    let o = pointIn(m, target)
    if (!o) {
      setPoint(target, pointNow(target) ?? guess(target))
      applyPoints()
      o = pointIn(m, target)
    }
    return o
  }
  // The proxies stand where the numbers say, unless the gizmo is moving them.
  function sync() {
    const v = get()
    if (!v || tc?.dragging) return
    if (lab?.solid || lab?.car) {
      const p = (lab.solid ?? lab.car)!.proxy, node = !!frameNow(target)?.node
      p.position.fromArray(v.at)
      // A node turns about x, then about y, as solids turns one; an empty about all three, XYZ.
      p.rotation.order = node ? 'ZYX' : 'XYZ'
      p.rotation.set(v.turn[0] * DEG, v.turn[1] * DEG, node ? 0 : v.turn[2] * DEG)
      p.updateMatrixWorld(true)
      if (tc) tc.showZ = !node || tc.mode !== 'rotate'
      return
    }
    const proxy = target === 'hold' ? proxies.hold : target === 'anchor' ? proxies.anchor : undefined
    if (!proxy) return
    proxy.position.fromArray(v.at)
    proxy.rotation.set(v.turn[0] * DEG, v.turn[1] * DEG, v.turn[2] * DEG, 'XYZ')
    proxy.updateMatrixWorld(true)
  }

  for (const f of fields) {
    f.addEventListener('input', () => {
      const v = get(), n = Number(f.value)
      if (!v || !Number.isFinite(n)) return
      const [k, i] = f.dataset.k!.split('.')
      const at = [...v.at], turn = [...v.turn]
      ;(k === 'at' ? at : turn)[+i] = n
      set(at, turn)
      applyPoints()
      fill(false)
    })
  }
  panel.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.onclick = () => {
    tc?.setMode(b.dataset.mode as 'translate' | 'rotate')
    panel.querySelectorAll('[data-mode]').forEach(o => o.classList.toggle('on', o === b))
  })
  panel.querySelector<HTMLButtonElement>('[data-act=pause]')!.onclick = () => { paused = !paused; fill() }
  panel.querySelector<HTMLButtonElement>('[data-act=ik]')!.onclick = () => {
    const f = fitOf()
    if (!f || !lab) return
    f.ikOn = !f.ikOn
    lab.world.ik3d.kinds = f.ikOn ? { [sel.body!]: f.ik } : {}
    target = f.ikOn ? 'anchor' : 'hold'
    attach()
  }
  panel.querySelector<HTMLButtonElement>('[data-act=take]')!.onclick = () => take()
  panel.querySelector<HTMLButtonElement>('[data-act=add]')!.onclick = () => {
    const input = panel.querySelector<HTMLInputElement>('[data-add]')!, name = input.value.trim()
    if (!isSolid() || !lab?.solid || !/^[\w.-]+$/.test(name) || frameNow(name)) return
    // A model with nodes takes a node, hung from the node chosen; one without, an empty.
    if (solidNow().nodes) {
      const parent = frameNow(target)?.node ? target : undefined
      moveFrame(name, [0, 0, 0], [0, 0], parent)
    } else moveFrame(name, [0, 0, 0])
    input.value = ''
    target = name
    attach()
  }
  panel.querySelector<HTMLButtonElement>('[data-act=revert]')!.onclick = () => {
    if (sel.model) pointEdits.delete(modelOf()!.file)
    for (const file of frameFiles()) frameEdits.delete(file)
    const a = labAct()
    if (a) actEdits.delete(a.file)
    if (fitting()) fits.delete(fitKey())
    build()
  }
  panel.querySelector<HTMLButtonElement>('[data-act=save]')!.onclick = () => save().catch(fail)
  $<HTMLInputElement>('#turn').addEventListener('input', e => {
    const n = Number((e.target as HTMLInputElement).value)
    if (Number.isFinite(n)) setStep(n ? { turn: n } : { turn: undefined })
  })
  // A vehicle's steer: the car row's, read by box3dvehicle each frame, so the wheel and the points on it
  // turn, and the hands bent onto them follow.
  $<HTMLInputElement>('#steer').addEventListener('input', e => {
    const n = Number((e.target as HTMLInputElement).value)
    if (Number.isFinite(n)) steer = Math.max(-1, Math.min(1, n))
    fill(false)
  })
  $<HTMLInputElement>('#time').addEventListener('input', e => {
    paused = true
    clipT = Number((e.target as HTMLInputElement).value) * durOf()
    fill()
  })

  function attach() {
    const o = object()
    if (tc && o) tc.attach(o)
    else tc?.detach()
    fill()
  }

  return {
    attachTo(three: THREE.Scene) {
      tc?.dispose()
      tc = new TransformControls(lab!.P.render3d.camera, lab!.canvas)
      tc.space = 'local'
      tc.setSize(0.7)
      tc.addEventListener('dragging-changed', e => { if (lab) lab.controls.enabled = !e.value })
      tc.addEventListener('objectChange', () => {
        const o = tc!.object
        if (!o) return
        // A solids node's proxy turns about x then y (its order 'ZYX'), and its z is not kept.
        set(o.position.toArray(), [o.rotation.x, o.rotation.y, lab?.solid && frameNow(target)?.node ? 0 : o.rotation.z].map(v => v / DEG))
        fill(false)
      })
      helper = tc.getHelper()
      helper.userData.workshop = true
      three.add(helper)
      const mode = panel.querySelector<HTMLButtonElement>('[data-mode].on')?.dataset.mode as 'translate' | 'rotate' | undefined
      if (mode) tc.setMode(mode)
      attach()
    },
    detach() { tc?.detach(); tc?.dispose(); tc = undefined; helper?.removeFromParent() },
    attach,
    // Each frame: the proxies where the numbers say, the gizmo on its object (anim makes a prop again
    // when its hold changes, so a point's object is found again), the reach of each limb.
    tick() {
      sync()
      const o = object()
      if (tc && o && tc.object !== o) tc.attach(o)
      const f = fitOf(), reach = panel.querySelector('.reach')!
      const st = stepNow()
      if (st && lab) {
        // A step's limbs, as interact hands them to ik3d after the body's own (it has none here).
        const short: number[] = lab.P.ik3d.short(BODY) ?? []
        reach.replaceChildren(...(st.ik ?? []).map((l, i) => {
          const s = document.createElement('div'), off = short[i]
          s.textContent = `${l.bones[2]} → ${l.target}: ${off === undefined ? 'not drawn' : off < 0.0005 ? 'on it' : `${(off * 1000).toFixed(0)} mm short`}`
          if (off !== undefined && off >= 0.0005) s.className = 'far'
          return s
        }))
        if (tc?.dragging) fill(false)
        return
      }
      if (!f?.ikOn || !lab) { reach.textContent = ''; return }
      const short: (number | null)[] = lab.P.ik3d.short(ROW) ?? []
      reach.replaceChildren(...(f.ik.limbs ?? []).map((l, i) => {
        const s = document.createElement('div')
        const off = short[i]
        s.textContent = `${l.bones[2]} → ${l.target}: ${off === undefined ? '—' : off === null ? 'not bent now' : off < 0.0005 ? 'on it' : `${(off * 1000).toFixed(0)} mm short`}`
        if (typeof off === 'number' && off >= 0.0005) s.className = 'far'
        return s
      }))
      if (tc?.dragging) fill(false)
    },
    get busy() { return !!tc && (tc.dragging || tc.axis !== null) },
    get,
  }
})()

// The panel, as the choice stands: shown for a model (its points) and a body (its clips), the
// targets for what is chosen, the fields for the target, and whether anything is not saved.
function fill(rebuildTargets = true) {
  const panel = $('#fit')
  const f = fitOf()
  panel.style.display = sel.model || sel.body || sel.vehicle ? 'block' : 'none'
  panel.querySelector('.who')!.textContent = f
    ? `${sel.model} on ${sel.body} · ${f.ikOn ? `IK, anchored at ${f.ik.anchor!.bone}` : `in ${f.hold.bone}`}`
    : sel.vehicle ? `vehicle · ${sel.vehicle} · its points` : sel.body ? `${sel.body} · its clips` : isSolid() ? `${sel.model} · its nodes and empties` : `${sel.model} · its mount points`
  panel.querySelector<HTMLButtonElement>('[data-act=ik]')!.style.display = f ? '' : 'none'
  panel.querySelector<HTMLButtonElement>('[data-act=take]')!.style.display = f ? '' : 'none'
  panel.querySelector('[data-act=ik]')!.classList.toggle('on', !!f?.ikOn)
  panel.querySelector('[data-act=pause]')!.classList.toggle('on', paused)
  const acts = actsOf(), a = labAct(), st = stepNow()
  const timed = !!sel.body || !!st
  $('#time-row').style.display = timed ? '' : 'none'
  $('#clip-row').style.display = timed ? '' : 'none'
  // The panel's name says what it tunes.
  panel.querySelector('.top b')!.textContent = a ? 'Interaction' : f ? 'Fit' : sel.body && !sel.model ? 'Clips' : isSolid() ? 'Frames' : 'Points'
  if (a) panel.querySelector('.who')!.textContent = `${sel.vehicle ? `vehicle · ${sel.vehicle}` : a.machine} · played by ${a.body}`
  $('#targets-label').textContent = a ? 'point' : f ? 'set' : isSolid() ? 'frame' : 'point'
  // The machine's interactions, and the machine alone (a solids model, or a vehicle); then the steps of
  // the one shown.
  $('#acts-row').style.display = acts.length ? '' : 'none'
  const alone = sel.vehicle ? { text: 'vehicle', title: 'the vehicle alone, every point of its look' } : { text: 'model', title: 'the model alone, its nodes and empties' }
  $('#acts').replaceChildren(...[{ key: '', text: alone.text }, ...acts.map(x => ({ key: `${x.machine}.${x.name}`, text: x.name }))].map(o => {
    const b = document.createElement('button')
    b.textContent = o.text
    b.title = o.key ? `${o.key}: ${acts.find(x => `${x.machine}.${x.name}` === o.key)!.file}` : alone.title
    b.classList.toggle('on', o.key === (a ? `${a.machine}.${a.name}` : ''))
    b.onclick = () => { act = o.key; step = 0; clipT = 0; reframe = true; build() }
    return b
  }))
  $('#steps-row').style.display = a ? '' : 'none'
  $('#steps').replaceChildren(...(a ? actNow(a)!.steps : []).map((s, i) => {
    const b = document.createElement('button')
    b.textContent = s.name
    b.title = `${s.clip} at ${s.at}${s.hold ? ', held' : ''}`
    b.classList.toggle('on', i === step)
    b.onclick = () => { step = i; clipT = 0; reframe = true; build() }
    return b
  }))
  // The step's own numbers: its turn, whether it holds, and each limb's pole.
  const own = panel.querySelector<HTMLElement>('.step')!
  own.style.display = st ? '' : 'none'
  if (st) {
    const turn = $<HTMLInputElement>('#turn')
    if (document.activeElement !== turn) turn.value = String(st.turn ?? 0)
    $('#held').textContent = st.hold ? 'holds until the game ends it' : `lasts ${durOf().toFixed(2)} s`
    if (rebuildTargets) poles(st)
  }
  // A vehicle's steer, the car row's: the wheel turned by it times the look's lock.
  $('#steer-row').style.display = sel.vehicle ? '' : 'none'
  const steerField = $<HTMLInputElement>('#steer')
  if (document.activeElement !== steerField) steerField.value = String(steer)
  $('#steer-at').textContent = steer.toFixed(2)
  const shownAny = !!(sel.model || sel.vehicle)
  if (rebuildTargets) {
    const names = framing() ? frameNames() : !sel.model ? [] : [...(f ? [f.ikOn ? 'anchor' : 'hold'] : []), ...pointNames()]
    if (shownAny && !names.includes(target)) target = names[0]
    $('#targets').replaceChildren(...names.map(n => {
      const b = document.createElement('button')
      b.textContent = n
      b.classList.toggle('on', n === target)
      b.onclick = () => { target = n; gizmo.attach() }
      return b
    }))
    if (timed) clips()
  }
  // Adding a node or an empty is the model's, not an interaction's: a step uses points the models have.
  panel.querySelector<HTMLElement>('.add')!.style.display = isSolid() && !a ? '' : 'none'
  const v = shownAny ? gizmo.get() : undefined
  panel.querySelector<HTMLElement>('.nums')!.style.display = v ? '' : 'none'
  // A solids node turns about x and y alone; an empty, as a glb's point, about all three, and a
  // vehicle's point too, its turn a quaternion in the chassis's frame.
  const frame = framing() ? frameNow(target) : undefined
  for (const field of panel.querySelectorAll<HTMLInputElement>('input[data-k^=turn]')) field.disabled = !!frame?.node && field.dataset.k === 'turn.2'
  $('#modes').style.display = shownAny && v ? '' : 'none'
  if (v) for (const field of panel.querySelectorAll<HTMLInputElement>('input[data-k]')) {
    if (document.activeElement === field) continue
    const [k, i] = field.dataset.k!.split('.')
    field.value = String(+(k === 'at' ? v.at : v.turn)[+i].toFixed(k === 'at' ? 4 : 2))
  }
  const dirty = changes()
  panel.querySelector('[data-act=save]')!.classList.toggle('on', dirty.length > 0)
  panel.querySelector<HTMLElement>('[data-act=save]')!.style.display = shownAny ? '' : 'none'
  panel.querySelector<HTMLElement>('[data-act=revert]')!.style.display = shownAny ? '' : 'none'
  const state = panel.querySelector<HTMLElement>('.state')!
  if (!state.dataset.held) state.textContent = shownAny ? (dirty.length ? `not saved: ${dirty.join(', ')}` : 'saved') : ''
}

// Each IK limb's pole in the step shown, three fields a limb, made again for each step.
function poles(st: Step) {
  $('#poles').replaceChildren(...(st.ik ?? []).map((l, i) => {
    const row = document.createElement('div')
    row.className = 'pole'
    const name = document.createElement('span')
    name.textContent = `${l.bones[2]} bends`
    name.title = `the way ${l.bones[1]} bends, in the body's frame, as it reaches ${l.target}`
    row.append(name, ...l.pole.map((v, j) => {
      const input = Object.assign(document.createElement('input'), { type: 'number', step: '0.1', value: String(v) })
      input.addEventListener('input', () => {
        const n = Number(input.value)
        const ik = structuredClone(stepNow()!.ik!)
        ik[i].pole[j] = n
        // A pole of no length is no direction: interact refuses it, so it waits for one that is.
        if (Number.isFinite(n) && ik[i].pole.some(x => x !== 0)) setStep({ ik })
      })
      return input
    }))
    return row
  }))
}

// What is changed here and not in the game's files.
function changes() {
  const out: string[] = []
  const file = ownFile()
  if (file && framing()) {
    for (const f of frameFiles()) {
      const moved = movedIn(f)
      const key = lab?.solid?.fitted.find(x => x.file === f)?.key
      if (moved.length) out.push(key ? `${key}: ${moved.join(', ')}` : moved.join(', '))
    }
    const a = labAct(), edited = a && actEdits.get(a.file)
    if (edited && JSON.stringify(edited) !== JSON.stringify(actSaved.get(a.file))) {
      const was = actSaved.get(a.file)!
      const steps = edited.steps.filter((s, i) => JSON.stringify(s) !== JSON.stringify(was.steps[i])).map(s => s.name)
      out.push(`${a.name}: ${steps.join(', ')}`)
      const packs = edited.steps.filter(s => s.clip.startsWith('pack:')).map(s => clipName(s.clip))
      if (packs.length) out.push(`bakes ${[...new Set(packs)].join(', ')}`)
    }
    return out
  }
  const glb = file
  if (glb) {
    const saved = savedPoints.get(glb) ?? {}
    const moved = Object.entries(pointEdits.get(glb) ?? {}).filter(([n, p]) => JSON.stringify(p) !== JSON.stringify(saved[n])).map(([n]) => n)
    if (moved.length) out.push(`points ${moved.join(', ')}`)
  }
  const f = fitOf()
  if (f) {
    const base = JSON.parse(f.base)
    if (JSON.stringify(f.hold) !== JSON.stringify(base.hold)) out.push('hold')
    if (f.ikOn && JSON.stringify(f.ik) !== JSON.stringify(base.ik)) out.push('IK')
  }
  return out
}

// The clip picker: a search box over the rig's clips by name, then each pack's. Typing filters the list
// to the clips whose name and pack hold every word typed, any case; ↑ and ↓ move through it, Enter or a
// click picks, Escape closes it. Shut, the box shows the clip playing.
type Choice = { value: string; name: string; from: string }
let packs: { pack: string; clips: string[] }[] | undefined
let choices: Choice[] = []
// A clip picked: in an interaction the step's, else the one the body plays.
function onClip(v: string) {
  clipT = 0
  if (stepNow()) setStep({ clip: v }, true)
  else { clip = v; build() }
}
const clipPicker = (() => {
  const box = $<HTMLInputElement>('#clip-search'), list = $('#clip-list')
  let shown: Choice[] = [], lit = 0
  const nameOf = (value: string) => choices.find(c => c.value === value)?.name ?? value
  function render() {
    const words = box.value.toLowerCase().split(/\s+/).filter(Boolean)
    shown = choices.filter(c => words.every(w => `${c.name} ${c.from}`.toLowerCase().includes(w))).slice(0, 300)
    lit = Math.min(lit, Math.max(0, shown.length - 1))
    list.replaceChildren(...(shown.length ? shown.map((c, i) => {
      const row = document.createElement('div')
      row.className = 'pick' + (i === lit ? ' lit' : '') + (c.value === clip ? ' now' : '')
      row.innerHTML = '<span></span><span class="from"></span>'
      row.children[0].textContent = c.name
      row.children[1].textContent = c.from
      row.onmousedown = e => { e.preventDefault(); choose(c) }
      return row
    }) : [Object.assign(document.createElement('div'), { className: 'none', textContent: 'no clip matches' })]))
    list.querySelector('.lit')?.scrollIntoView({ block: 'nearest' })
  }
  function open() { list.hidden = false; box.select(); lit = 0; render() }
  function shut() { list.hidden = true; box.value = nameOf(clip) }
  function choose(c: Choice) { shut(); box.blur(); if (c.value !== clip) onClip(c.value) }
  box.addEventListener('focus', open)
  box.addEventListener('blur', shut)
  box.addEventListener('input', () => { lit = 0; render() })
  box.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { lit = Math.min(lit + 1, shown.length - 1); render(); e.preventDefault() }
    else if (e.key === 'ArrowUp') { lit = Math.max(lit - 1, 0); render(); e.preventDefault() }
    else if (e.key === 'Enter' && shown[lit]) { choose(shown[lit]); e.preventDefault() }
    else if (e.key === 'Escape') { shut(); box.blur() }
  })
  list.hidden = true
  return { show() { if (document.activeElement !== box) box.value = nameOf(clip) } }
})()
async function clips() {
  packs ??= await api('/api/packs')
  const body = labAct()?.body ?? sel.body
  const rigClips = lab?.rig ? Object.keys(lab.rig.clips).filter(c => !c.startsWith('pack:')) : []
  choices = [
    ...rigClips.map(c => ({ value: c, name: c, from: `${body}'s rig` })),
    ...packs!.flatMap(p => p.clips.map(c => ({ value: `pack:${p.pack}/${c}`, name: c.replace(/\.fbx$/i, ''), from: `${p.pack} (not baked)` }))),
  ]
  clipPicker.show()
}
function showTime() {
  const d = durOf(), range = $<HTMLInputElement>('#time')
  if (document.activeElement !== range) range.value = String(d > 0 ? clipT / d : 0)
  $('#clock').textContent = `${clipT.toFixed(2)} s`
}

// Take from this pose: with IK off for a frame, so the body stands in its clip and the model hangs in
// its hand, each limb's end bone becomes its mount point in the model's frame and the stock's frame
// becomes the anchor in its bone's frame. Then IK is on, and nothing moves.
function take() {
  const f = fitOf()
  if (!f || !lab) return
  const { P } = lab
  lab.world.ik3d.kinds = {}
  P.anim.tick(P)
  P.ik3d.tick(P) // lets go of the body: its bones back as the clip left them
  P.anim.afterTick()
  const m = shown()
  if (!m) return
  m.updateMatrixWorld(true)
  const toModel = m.matrixWorld.clone().invert()
  const q = new THREE.Quaternion(), at = new THREE.Vector3()
  for (const l of f.ik.limbs ?? []) {
    const hand = P.anim.socket(ROW, l.bones[2])
    if (!hand) continue
    toModel.clone().multiply(scaleFree(hand)).decompose(at, q, new THREE.Vector3())
    setPoint(l.target, { at: at.toArray(), turn: q.toArray() as number[] })
  }
  const a = f.ik.anchor!
  if (!pointNow(a.point)) setPoint(a.point, guess(a.point))
  applyPoints()
  const stock = pointIn(m, a.point), bone = P.anim.socket(ROW, a.bone)
  if (stock && bone) {
    const e = new THREE.Euler()
    const local = scaleFree(bone).invert().multiply(scaleFree(stock))
    local.decompose(at, q, new THREE.Vector3())
    e.setFromQuaternion(q, 'XYZ')
    a.at = at.toArray().map(v => +v.toFixed(4))
    a.turn = [e.x, e.y, e.z].map(v => +(v / DEG).toFixed(2))
  }
  f.ikOn = true
  lab.world.ik3d.kinds = { [sel.body!]: f.ik }
  target = 'anchor'
  gizmo.attach()
}

// Save: the points into the glb, the hold and the IK into the game's scenes; a machine's points into
// their solids models or its vehicle's look, and its interaction.
async function save() {
  const glb = ownFile()
  if (!glb) return
  const state = $('#fit').querySelector<HTMLElement>('.state')!
  const wrote = new Set<string>()
  if (framing()) {
    // The nodes and empties moved here into the model's json, in place, and each fitted module's into
    // its own; a vehicle's points into the scene files that give its look (`written`, as the server
    // says).
    for (const file of frameFiles()) {
      const e = frameEdits.get(file)
      if (e && movedIn(file).length) {
        const r = await post<Frames & { written?: string[] }>(framesUrl(file), e)
        savedFrames.set(file, r)
        for (const w of r.written ?? [file]) wrote.add(w)
      }
      frameEdits.delete(file)
    }
    const a = labAct()
    if (a) await saveAct(a, state, wrote)
  }
  const edits = pointEdits.get(glb)
  if (edits && Object.keys(edits).length) {
    savedPoints.set(glb, await post<Record<string, Point>>(`/api/points?file=${encodeURIComponent(glb)}`, { points: edits }))
    pointEdits.delete(glb)
    wrote.add(glb)
  }
  const f = fitOf()
  if (f) {
    const base = JSON.parse(f.base)
    const hold = JSON.stringify(f.hold) !== JSON.stringify(base.hold) ? { bone: f.hold.bone, at: f.hold.at, turn: f.hold.turn } : undefined
    const ik = f.ikOn && JSON.stringify(f.ik) !== JSON.stringify(base.ik) ? f.ik : undefined
    // A body that does not hold the model yet gets it, so the IK has a prop to reach.
    const holds = bodyOf()!.props.some(p => p.model === sel.model)
    if (hold || ik) {
      const r = await post<{ scenes: string[] }>(`/api/fit/${game.game}`, { body: sel.body, prop: sel.model, hold: hold ?? (holds ? undefined : { bone: f.hold.bone, at: f.hold.at, turn: f.hold.turn }), ik })
      r.scenes.forEach(s => wrote.add(s))
    }
    f.base = fitText(f)
  }
  state.dataset.held = '1'
  state.textContent = wrote.size ? `saved to ${wrote.size} file${wrote.size === 1 ? '' : 's'}` : 'nothing changed'
  state.title = [...wrote].join('\n')
  setTimeout(() => { delete state.dataset.held; fill(false) }, 4000)
  fill(false)
}

// An interaction's save: each pack clip its steps play baked into the body's rig, named after its file,
// the step then playing the rig's clip; the rig and the bodies baked put in the loader as they now are;
// then the interaction written into its file.
async function saveAct(a: Act, state: HTMLElement, wrote: Set<string>) {
  const edited = actEdits.get(a.file)
  if (!edited || JSON.stringify(edited) === JSON.stringify(actSaved.get(a.file))) { actEdits.delete(a.file); return }
  const out = structuredClone(edited)
  const baked = new Map<string, string>()
  for (const s of out.steps) {
    if (!s.clip.startsWith('pack:')) continue
    if (!baked.has(s.clip)) {
      state.dataset.held = '1'
      state.textContent = `baking ${s.clip.slice(5)} into ${a.body}'s rig…`
      const r = await post<{ clip: string; written: string[] }>(`/api/bake/${game.game}`, { body: a.body, clip: s.clip, name: clipName(s.clip) })
      r.written.forEach(w => wrote.add(w))
      baked.set(s.clip, r.clip)
      const rig = game.world.loader.assets[game.world.anim.kinds[a.body].rig].url as string
      for (const url of [rig, ...game.models.filter(m => r.written.includes(m.file)).map(m => m.url)]) {
        written(url, new Uint8Array(await (await fetch(url, { cache: 'no-store' })).arrayBuffer()))
      }
    }
    s.clip = baked.get(s.clip)!
  }
  actSaved.set(a.file, await post<Interaction>(`/api/interaction?file=${encodeURIComponent(a.file)}`, out))
  actEdits.delete(a.file)
  wrote.add(a.file)
  if (baked.size) build()
}

// ---------------------------------------------------------------- notes

async function refreshNotes() {
  const m = modelOf()
  notes = m ? await api<Note[]>(`/api/notes?file=${encodeURIComponent(m.file)}`) : []
  const list = $('#notes')
  if (sel.vehicle) list.innerHTML = '<div class="empty">A vehicle has no notes of its own: a note goes on a model (a vehicle\'s glb, when its look has one).</div>'
  else if (!m) list.innerHTML = '<div class="empty">Choose a model to see its notes.</div>'
  else if (!notes.length) list.innerHTML = '<div class="empty">No notes. Click the model to add one.</div>'
  else list.replaceChildren(...notes.map(n => {
    const card = document.createElement('div')
    card.className = 'card'
    card.innerHTML = `<div class="head"><span class="pin ${n.status}">${n.id}</span><span class="status ${n.status}">${n.status}</span><span></span></div><div class="text"></div>`
    card.querySelector('.head span:last-child')!.textContent = `${n.mesh}${n.material ? ' · ' + n.material : ''}`
    card.querySelector('.text')!.textContent = n.text
    if (n.reply) {
      const r = document.createElement('div')
      r.className = 'reply'
      r.textContent = n.reply
      card.append(r)
    }
    const toggle = document.createElement('button')
    toggle.textContent = n.status === 'open' ? 'Mark fixed' : 'Reopen'
    toggle.onclick = async e => {
      e.stopPropagation()
      await api(`/api/notes/${n.id}?file=${encodeURIComponent(m.file)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: n.status === 'open' ? 'fixed' : 'open' }) })
    }
    card.append(toggle)
    card.onclick = () => goTo(n)
    return card
  }))
  marks.redraw()
}
function goTo(n: Note) {
  if (!lab) return
  const camera = lab.P.render3d.camera as THREE.PerspectiveCamera
  camera.position.fromArray(n.camera.position)
  lab.controls.target.fromArray(n.camera.target)
  camera.fov = n.camera.fov
  camera.updateProjectionMatrix()
}

const ray = new THREE.Raycaster()
let down = { x: 0, y: 0 }, onGizmo = false
let pending: Omit<Note, 'id' | 'text' | 'status' | 'reply' | 'made'> | undefined
view.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; onGizmo = gizmo.busy })
view.addEventListener('pointerup', e => {
  const m = shown()
  // A vehicle has no notes of its own.
  if (!lab || !m || lab.car || onGizmo || e.target !== lab.canvas || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return
  const r = lab.canvas.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), lab.P.render3d.camera)
  // A solids model's own meshes alone, each its node and its paint; a glb's meshes, each its name and its material's.
  const own = lab.solid?.parts
  const hit = ray.intersectObject(m, true).find(h => (h.object as THREE.Mesh).isMesh && h.object.visible && !h.object.userData.workshop && (!own || own.has(h.object)))
  if (!hit) return
  const mesh = hit.object as THREE.Mesh
  const mat = Array.isArray(mesh.material) ? mesh.material[hit.face?.materialIndex ?? 0] : mesh.material
  const label = own?.get(mesh)
  const camera = lab.P.render3d.camera as THREE.PerspectiveCamera
  pending = {
    at: m.worldToLocal(hit.point.clone()).toArray().map(v => +v.toFixed(5)),
    mesh: label ? label.node : mesh.name, material: label ? label.paint : mat.name,
    camera: { position: camera.position.toArray(), target: lab.controls.target.toArray(), fov: camera.fov },
  }
  const ask = $('#ask'), vr = view.getBoundingClientRect()
  ask.style.left = Math.min(e.clientX - vr.left + 12, vr.width - 252) + 'px'
  ask.style.top = Math.min(e.clientY - vr.top + 12, vr.height - 130) + 'px'
  ask.style.display = 'block'
  ask.querySelector('.meta')!.textContent = `${pending.mesh || '(mesh)'} · ${pending.material || '(material)'}`
  const text = ask.querySelector('textarea')!
  text.value = ''
  text.focus()
})
async function saveNote() {
  const text = $('#ask').querySelector('textarea')!.value.trim(), m = modelOf()
  if (!text || !pending || !m) return
  await post(`/api/notes?file=${encodeURIComponent(m.file)}`, { ...pending, text })
  closeAsk()
}
function closeAsk() { $('#ask').style.display = 'none'; pending = undefined }
$('#ask').querySelector<HTMLButtonElement>('[data-act=save]')!.onclick = () => saveNote().catch(fail)
$('#ask').querySelector<HTMLButtonElement>('[data-act=cancel]')!.onclick = closeAsk
$('#ask').querySelector('textarea')!.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote().catch(fail)
  if (e.key === 'Escape') closeAsk()
})

// ---------------------------------------------------------------- toggles

function toggle(id: string, flip: () => boolean) {
  const b = $<HTMLButtonElement>('#' + id)
  b.onclick = () => { b.classList.toggle('on', flip()); marks.redraw() }
}
toggle('wire', () => (wire = !wire))
toggle('bounds', () => (showBounds = !showBounds))
toggle('empties', () => (showEmpties = !showEmpties))

// ---------------------------------------------------------------- bring a model from another game

const bring = (() => {
  const box = $('#bring')
  const sel$ = (k: string) => box.querySelector<HTMLSelectElement>(`[data-k=${k}]`)!
  const msg = box.querySelector<HTMLElement>('.msg')!
  let from: Game | undefined
  async function games() {
    const all = (await api<string[]>('/api/games')).filter(g => g !== game.game)
    sel$('from').replaceChildren(...all.map(g => new Option(g, g)))
    await pick()
  }
  async function pick() {
    const g = sel$('from').value
    from = g ? await api<Game>(`/api/game/${g}`) : undefined
    sel$('key').replaceChildren(...(from?.models ?? []).filter(m => m.type === 'glb').map(m => new Option(m.key, m.key)))
    sel$('body').replaceChildren(new Option('no body', ''), ...game.bodies.map(b => new Option(b.kind, b.kind)))
    likes()
  }
  function likes() {
    const key = sel$('key').value
    const holders = (from?.bodies ?? []).filter(b => b.props.some(p => p.model === key))
    sel$('like').replaceChildren(...(holders.length ? holders.map(b => new Option(b.kind, b.kind)) : [new Option('the right hand, unfitted', '')]))
  }
  sel$('from').onchange = () => pick().catch(fail)
  sel$('key').onchange = likes
  $('#bring-open').onclick = () => { box.style.display = 'block'; msg.textContent = ''; games().catch(fail) }
  box.querySelector<HTMLButtonElement>('[data-act=cancel]')!.onclick = () => { box.style.display = 'none' }
  box.querySelector<HTMLButtonElement>('[data-act=go]')!.onclick = async () => {
    try {
      const r = await post<{ written: string[] }>(`/api/bring/${game.game}`, { from: sel$('from').value, key: sel$('key').value, body: sel$('body').value || undefined, like: sel$('like').value || undefined })
      msg.textContent = r.written.length ? `wrote\n${r.written.join('\n')}` : 'it is here already'
      const key = sel$('key').value, body = sel$('body').value || undefined
      await reread()
      choose({ model: key, body })
    } catch (e) {
      msg.textContent = (e as Error).message
    }
  }
  return { games }
})()
void bring

// ---------------------------------------------------------------- the game, and reading it again

async function reread() {
  game = await api<Game>(`/api/game/${game.game}`)
  // A fit not changed here takes the game's numbers as they now are.
  for (const [k, f] of [...fits]) if (fitText(f) === f.base) fits.delete(k)
}

let pendingRead: ReturnType<typeof setTimeout> | undefined, fade: ReturnType<typeof setTimeout> | undefined
const staleActs = new Set<string>() // interactions' files written on disk since they were read
new EventSource('/api/events').onmessage = e => {
  const [what, file] = String(e.data).split(' ')
  if (what !== 'changed' || !game || !file.startsWith(`games/${game.game}/`)) return
  const m = modelOf()
  if (m && file === notesOf(m.file)) { refreshNotes().then(() => side()).catch(fail); return }
  if (file.endsWith('.notes.json')) return
  if (m && file === m.file) { savedPoints.delete(m.file); savedFrames.delete(m.file) }
  // A fitted module's model or an interaction written elsewhere is read again; what is changed here stays.
  for (const f of lab?.solid?.fitted ?? []) if (file === f.file) savedFrames.delete(f.file)
  // A scene file that gives a vehicle's look: its points are read again.
  for (const v of game.vehicles ?? []) if (v.files.includes(file)) savedFrames.delete(carKey(v.name))
  if (file.endsWith('.interaction.json')) staleActs.add(file)
  clearTimeout(pendingRead)
  pendingRead = setTimeout(async () => {
    try {
      await reread()
      // Dropped as the lab is made again, so nothing draws from an interaction not yet read.
      for (const f of staleActs) actSaved.delete(f)
      staleActs.clear()
      await build()
      const mark = $('#reloaded')
      mark.textContent = '● reloaded ' + new Date().toLocaleTimeString([], { hour12: false })
      mark.classList.add('show')
      clearTimeout(fade)
      fade = setTimeout(() => mark.classList.remove('show'), 4000)
    } catch (err) { fail(err) }
  }, 200)
}

let resizing: ReturnType<typeof setTimeout> | undefined
new ResizeObserver(() => {
  if (!lab) return
  clearTimeout(resizing)
  resizing = setTimeout(() => { if (lab && (lab.P.wire.scene.prefabs.engine.width !== view.clientWidth || lab.P.wire.scene.prefabs.engine.height !== view.clientHeight)) build() }, 200)
}).observe(view)

async function open(name: string) {
  game = await api<Game>(`/api/game/${name}`)
  fits.clear()
  const q = new URLSearchParams(location.search)
  const model = q.get('model') ?? undefined, body = q.get('body') ?? undefined, vehicle = q.get('vehicle') ?? undefined
  if (vehicle && carOf(vehicle)) return choose({ vehicle })
  const chosen = game.models.find(m => m.key === model)
  // A solids model is shown alone: no body holds one.
  choose({ model: chosen?.key, body: body && chosen?.type !== 'solids' && game.bodies.some(b => b.kind === body) ? body : undefined })
}

const picker = $<HTMLSelectElement>('#game')
const all = await api<string[]>('/api/games')
picker.replaceChildren(...all.map(g => new Option(g, g)))
const first = new URLSearchParams(location.search).get('game') ?? (all.includes('mech') ? 'mech' : all[0])
picker.value = first
picker.onchange = () => { history.replaceState(null, '', `?game=${picker.value}`); open(picker.value).catch(fail) }
await open(first)

// The view's pieces, for a test driving the page to read the camera, the model and the fit off.
Object.assign(window, { workshop: { get lab() { return lab }, get shown() { return shown() }, get fit() { return fitOf() }, get sel() { return sel }, get building() { return building } } })
