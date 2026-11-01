// The cutscene's panel: a scene's cutscene edited on the game itself, from the game's dev page, and
// saved into the game. A dev page hands it the game and the scene and it takes the page over:
//
//   import { edit } from '#plugins/cutscene/cutscene.panel.ts'
//   if (query.get('cutscene') !== null) await edit({ file, sim, base: import.meta.url, scene: query.get('cutscene') || file.prefabs.scenemanager.entry })
//
// `file` and `sim` the manager scene and its sim the page imports, `base` the page's url, `scene` the
// scene whose cutscene is edited. The cue logic is `cutscene.cues.ts`, the timeline
// `cutscene.timeline.ts`, both lifted from the editor's Cutscene panel; what a page cannot do, a save
// and the cue file's own check, is the dev server's (`cutscene.serve.ts`).
//
// The game. The game's manager scene is booted behind core's recorder (`addons/recorder`), its `entry`
// the scene, as a dev page enters any scene, so the page's one seat enters it; the scenemanager's `view`
// draws the seat's scene on that recorder's link with the game's own plugins and looks, its render3d
// canvas and its ui canvas over it, at the scene's own shape, as large as the window holds it over the
// panel. Nothing of the game is stood in for: the scene's own rule starts the cutscene, as it does in
// the game (mech's curtain, `curtain.sim.ts`, once its look has every model and texture in and the land
// shown, `curtain.client.ts`), and the recording keeps the envelope that started it, so every replay
// starts it on the same step. The page's clock steps the recorder while it plays, as many steps as the
// time since the last frame owes; paused, it draws the step it is at. A `skip` sent to the cutscene row
// is held off on the link and never reaches the truth (the curtain's look sends one on any key or press
// of the pointer while the intro runs, and every press here is editing), and the bar counts each one.
//
// Elapsed time. The cutscene's elapsed time `e` is step `start + e/dt`, `start` the step `e` counts
// from, read off the cutscene row the first step it runs (`n − e/dt`). Scrubbing the ruler shows the
// playhead and leaves the step where it is; letting go seeks the recorder there, forward by stepping,
// on past the recording's end when it has to, and back by booting again and replaying (`rec.seek`), as
// the editor's Cutscene panel does; so the scene plays as it does, bodies, bars, veil and line. Before
// the cutscene starts there is no elapsed time: the bar says the scene waits for its start, and the
// clock plays on until it comes.
//
// The cue file, the scene's `world.cutscene.script`. It is read from the game's file once, `saved`, and
// every change makes a new file, `current`, made by `cutscene.cues.ts` (the editor's edits) and
// refused, with why in the bar, by its `refusal`; each change is put in the loader's copy of the file
// (`written`), which the truth reads, and the recorder rebuilds the step it is at with it
// (`rec.rerun`), so the scene starts over and plays the file as changed. Undo (the button, ⌘Z) puts back
// the file before the last change; Revert puts back the file as saved; Save writes the file into the
// game (`/@cutscene/save`), once the dev server has held it to the same refusal.
//
// The measure pass (`cutscene.cues.ts`'s `pass`) replays the recording again, headless, once the scene
// has started and again for every version of the file, for when each cue fired, how long each wait held,
// each walk's end and each cast member's path. The check: the cue file's own, the script beside it of
// its name (mech's `assets/intro.ts`), run by the dev server on the file as it stands here a second after
// the last change (`/@cutscene/check`); each failing frame it hands back is a red mark on the camera lane,
// its shot outlined and listed among the problems with what is wrong. The bar says while it runs, how
// many frames failed, that the cue file has no check beside it, or why it could not run.
//
// The panel floats across the bottom of the page: the bar (⏮ Start and End ⏭ go to the cutscene's start
// and its end, ◀ Frame and Frame ▶ a step either way, ▶ Play plays from the playhead, ⏸ Pause holds the
// step, ⏹ Stop pauses at the start; Space, Home, End, `,` and `.` do the same; end selects the end, the playhead, the problems, Help, which shows a guide to the panel in
// place of the form until it is pressed again, Undo, Revert, Save), what the panel says
// under it, and the timeline (`cutscene.timeline.ts`) beside the form. The timeline, in elapsed seconds:
// a lane per cast member, then camera, say, sound and screen, each with `+`, which makes a cue there at
// the playhead; the camera lane's Look shows the cutscene's own camera, the real shot, with the scene's
// ui over it (its bars, veil and line, and the curtain); with Look off the view is the panel's orbit, the
// ui is not drawn, and the stage is drawn over the scene: each mark as a ring of 1 m, each shot as its
// camera's frustum where it stands on the rows as they are now, named, with the path a dolly takes from
// the shot before it, and each cast member's measured path. A press on a frustum's apex selects its
// shot; the selected shot's camera is moved with the gizmo, in all three axes, which writes its `pos`
// when it is let go (`standEdits`): a point over the ground for a shot that follows nobody, else its
// offset from the member it follows. Chips are dragged in time and onto another member's lane, resized,
// nudged with ← and →, taken out with Delete, copied with ⌘C and pasted at the playhead with ⌘V,
// duplicated with ⌘D; the end bracket is dragged.
//
// The form: the selected cue's fields by its kind, cutscene's own forms as the editor has them, and for
// a kind the editor has no form for (`prepare`) or a step a game brings (mech's `land`), a field for each
// of its fields by the rule `check` holds it to; `do` makes it a cue of another kind; take the view (a
// shot: the orbit's camera taken into it), pick in the view (a walk or a face: the next press on the
// scene picks its target); with the end selected, the file's `end`, `go` and `arrive`; and the problems.
//
// Keys and presses on the panel stop at it, so the game's player plugin, which listens on the window,
// takes none of them; the releases and the moves go on, so a drag let go over it ends. `window.cutscene`
// is what the panel holds, for a script driving the page.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Client } from '#engine/browser.ts'
import type { Scene, Sim, Truth } from '#engine/engine.ts'
import { recorder, type Recorder } from '#addons/recorder/recorder.addon.ts'
import { manager, scenes, view, type Link, type Up } from '#addons/scenemanager/scenemanager.addon.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Rig } from '#plugins/anim/anim.sim.ts'
import { heightOf } from './cutscene.plugin.ts'
import { placed, sorted, stepsOf, view as shotPose, type Cue, type Pose, type Script } from './cutscene.sim.ts'
import * as cues from './cutscene.cues.ts'
import { END, timeline, type Lane, type Move, type Props } from './cutscene.timeline.ts'

// How long after the last change the check is asked for, in milliseconds.
const CHECKED = 1000
const POINT = '(a point)'
const NOTHING = '(nothing)'
const fmt = (t: number) => String(Math.round(t * 1000) / 1000)
const text = (v: unknown) => JSON.stringify(v)
const COLOURS = { accent: 0xe0a33a, dim: 0x8a8f98, warn: 0xe0573a }
// The share of the window's height the panel takes across the bottom.
const PANEL = 0.4

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', words = '') => Object.assign(document.createElement(tag), { className: cls, textContent: words })

// The dev server's answer to a post, or what it said is wrong, thrown.
async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const got = await r.json().catch(() => ({ error: `${url}: ${r.status}` }))
  if (!r.ok) throw Object.assign(new Error(got.error ?? `${url}: ${r.status}`), { status: r.status })
  return got as T
}

export async function edit({ file, sim, base, scene: name }: { file: Scene; sim: Sim; base: string; scene: string }) {
  const table = file.prefabs.scenemanager?.scenes as Record<string, unknown> | undefined
  if (!table?.[name]) throw new Error(`the manager names no scene ${name}: its scenes are ${Object.keys(table ?? {}).join(', ')}`)
  const game = new URL(base).pathname.split('/').filter(Boolean).at(-2)!
  file.prefabs.scenemanager.entry = name
  const { stage, form, bar, said, tlBox, readout } = layout()
  readout.textContent = `${name}: booting the game behind the recorder…`

  const rec: Recorder = await recorder(file, sim, base)
  const dt = rec.dt
  const truthOf = (): Truth | undefined => scenes(manager(rec.truth)).get(name)
  const rowOf = () => truthOf()?.rows.find(r => r.kind === 'cutscene')
  const world = truthOf()!.world
  if (!rowOf()) throw new Error(`${name} has no cutscene row`)
  const key = world.cutscene?.script as string
  const url: string = world.loader?.assets?.[key]?.url ?? ''
  if (!url) throw new Error(`${name}'s world.cutscene.script names no entry of its catalogue`)
  const where = `/@cutscene/%s?game=${encodeURIComponent(game)}&scene=${encodeURIComponent(name)}`
  const route = (r: string) => where.replace('%s', r)
  let saved = await (await fetch(url, { cache: 'no-store' })).json() as Script
  let current: Script = structuredClone(saved)
  const undo: Script[] = []
  written(url, JSON.stringify(current))

  // ---------------------------------------------------------------- the panel's state

  let selected: string[] = []
  let error: string | undefined
  let picking: { cue: number; field: string } | undefined
  let problemsOn = false
  let helping = false
  let scrub: number | undefined
  let looking = false
  let clipboard: Cue[] = []
  let nudging: { ids: string[]; by: number; timer: ReturnType<typeof setTimeout> } | undefined
  let state = ''
  // Bumped by every change of what the panel shows, which draws its parts again.
  let version = 0
  const changed = () => { version++ }
  const fail = (e: unknown) => {
    error = e instanceof Error ? e.message : String(e)
    console.error(e)
    changed()
  }

  // ---------------------------------------------------------------- the link, the view and the clock

  // Every `skip` sent to the cutscene row held off: counted, and never sent on.
  let held = 0
  const wire: Link = {
    ...rec.link,
    send(up: Up) {
      if ('msg' in up && up.msg.action === 'skip' && scenes(manager(rec.truth)).get(up.scene)?.rows.find(r => r.id === up.msg.id)?.kind === 'cutscene') {
        held++
        changed()
        return
      }
      rec.link.send(up)
    },
  }
  let client: Client | undefined
  let canvases: HTMLCanvasElement[] = []
  let gameSize = [16, 9]
  const labels = new CSS2DRenderer()
  labels.domElement.className = 'cutscene-labels'
  stage.append(labels.domElement)
  // The stage at the shape of the scene's own canvas, as large as the window holds it over the panel.
  const fit = () => {
    const w = innerWidth, h = innerHeight * (1 - PANEL)
    const k = Math.min(w / gameSize[0], h / gameSize[1])
    Object.assign(stage.style, { width: `${gameSize[0] * k}px`, height: `${gameSize[1] * k}px`, left: `${(w - gameSize[0] * k) / 2}px`, top: `${(h - gameSize[1] * k) / 2}px` })
    labels.setSize(gameSize[0] * k, gameSize[1] * k)
  }
  addEventListener('resize', fit)
  let orbit: OrbitControls | undefined
  let gizmo: TransformControls | undefined
  const page = view(wire, file, base, (me, scene) => {
    for (const c of canvases) c.remove()
    canvases = []
    for (const surface of [me.plugins.render3d ?? me.plugins.render2d, me.plugins.ui]) {
      if (!surface) continue
      const canvas = document.createElement('canvas')
      canvas.width = scene.prefabs.engine.width
      canvas.height = scene.prefabs.engine.height
      stage.insertBefore(canvas, labels.domElement)
      surface.mount(canvas)
      canvases.push(canvas)
    }
    client = me
    gameSize = [scene.prefabs.engine.width, scene.prefabs.engine.height]
    fit()
    orbit?.dispose()
    orbit = undefined
    gizmo?.detach()
    gizmo?.dispose()
    gizmo = undefined
  })

  let playing = true
  let owed = 0
  let last = performance.now()
  // A seek or a rebuild in hand, which the clock waits for; and a frame being drawn.
  let busy: Promise<void> | undefined
  let drawing = false
  let start: number | undefined
  let measured: cues.Measured | undefined
  const startOf = () => measured?.start ?? start
  const headOf = () => { const s = startOf(); return s === undefined ? 0 : cues.round3(Math.max(0, (rec.n - s) * dt)) }
  const headNow = () => scrub ?? headOf()

  // The session put at step k: forward by stepping, which plays on past the recording's end, and back
  // by seeking.
  async function goTo(k: number) {
    if (k < rec.n) await rec.seek(k)
    while (rec.n < k) {
      const n = rec.n
      const stopped = rec.step()
      if (stopped) await stopped
      if (rec.n === n) break
    }
  }
  // Something done with the clock held, one after another: a seek, a rebuild.
  function hold(f: () => Promise<void>) {
    const going: Promise<void> = (busy ?? Promise.resolve()).then(f).catch(fail).finally(() => { if (busy === going) busy = undefined; changed() })
    busy = going
    changed()
    return going
  }
  // The session at elapsed time `e`, and played from there with `play`.
  const seekTo = (e: number, play: boolean) => hold(async () => {
    const s = startOf()
    if (s === undefined) return
    playing = false
    await goTo(s + Math.round(e / dt))
    playing = play
    owed = 0
    last = performance.now()
  })

  // ---------------------------------------------------------------- the model

  // Each cast kind's rig, read once.
  const rigs = new Map<string, Rig | undefined>()
  const readRigs = async () => {
    const w = truthOf()?.world ?? {}
    for (const m of Object.values(current.cast)) {
      if (rigs.has(m.kind)) continue
      const rig = w.anim?.kinds?.[m.kind]?.rig
      const at = rig && w.loader?.assets?.[rig]?.url
      rigs.set(m.kind, at ? await (await fetch(at, { cache: 'no-store' })).json() : undefined)
    }
  }
  await readRigs()
  const eye = (): cues.Eye | undefined => {
    const c = client?.plugins.render3d?.camera as THREE.PerspectiveCamera | undefined
    if (!c) return undefined
    c.updateMatrixWorld()
    return { pos: c.getWorldPosition(new THREE.Vector3()).toArray(), dir: c.getWorldDirection(new THREE.Vector3()).toArray(), fov: c.fov }
  }
  const heightNow = () => (client ? heightOf(client.plugins) : undefined)
  const context = (): cues.Context => {
    const t = truthOf()
    return {
      scene: name, name: key,
      marks: (t?.scene.actors ?? []).filter(a => a.is === 'mark').map(a => ({ name: String(a.name ?? ''), at: (a.at as number[]) ?? [0, 0] })),
      sounds: Object.keys(t?.world.audio?.cues ?? {}),
      rig: kind => rigs.get(kind),
      steps: t ? stepsOf(t.world) : {},
      scenes: Object.keys(table),
      eye, height: heightNow, rows: () => truthOf()?.rows ?? [],
    }
  }
  let failed: cues.Failed[] = []
  let model = cues.build(context(), current)
  const remodel = () => {
    model = cues.build(context(), current, measured, failed)
    changed()
  }

  // ---------------------------------------------------------------- changes

  // A change of the file: the edits `makeEdits` makes from the model, refused with why, else made, the
  // selection after it `select`'s. The scene then plays it.
  function change(makeEdits: (m: cues.Model) => cues.Edit[], select?: (m: cues.Model) => string[]) {
    flushNudge()
    try {
      const edits = makeEdits(model)
      if (!edits.length) return
      const next = cues.edited(model.file, edits)
      const refused = cues.refusal(model, next)
      if (refused) {
        error = refused
        console.error(`cutscene: refused: ${refused}`)
        changed()
        return
      }
      error = undefined
      if (select) selected = select(model)
      undo.push(current)
      play(next)
    } catch (e) {
      error = (e as Error).message
      changed()
    }
  }
  // `next` made the file the scene plays: the loader's copy written, the step rebuilt with it, measured
  // again and checked again.
  function play(next: Script) {
    current = next
    state = ''
    written(url, JSON.stringify(current))
    remodel()
    void hold(async () => {
      await readRigs()
      await rec.rerun()
      remodel()
    })
    measure()
    asks()
  }
  function flushNudge() {
    const n = nudging
    if (!n) return
    clearTimeout(n.timer)
    nudging = undefined
    change(m => cues.nudged(m, n.ids, n.by))
  }

  // The measure pass, once the scene has started, for the file as it is now.
  let measuring: string | undefined
  function measure() {
    if (startOf() === undefined) return
    const of = text(current)
    if (measured?.key === of || measuring === of) return
    measuring = of
    changed()
    const going = (async () => {
      const again = await recorder(file, sim, base, [...rec.journal], rec.end)
      const got = await cues.pass(again, name, current, of, () => measuring === of)
      if (got && measuring === of) {
        measured = got
        remodel()
      }
    })()
    going.catch(e => { error = `the measure pass: ${(e as Error).message}`; console.error(e) }).finally(() => { if (measuring === of) measuring = undefined; changed() })
  }

  // The cue file's own check, a second after the last change, on the file as it is then.
  let checkTimer: ReturnType<typeof setTimeout> | undefined
  let checking: string | undefined
  let checkedKey: string | undefined
  let checkError: string | undefined
  let noCheck: string | undefined
  function asks() {
    if (noCheck) return
    clearTimeout(checkTimer)
    checkTimer = setTimeout(() => {
      const of = text(current)
      checking = of
      changed()
      post<{ failed: cues.Failed[] }>(route('check'), current).then(r => {
        if (of !== text(current)) return
        failed = r.failed
        checkedKey = of
        checkError = undefined
        remodel()
      }, e => {
        if ((e as { status?: number }).status === 404) noCheck = (e as Error).message
        else if (of === text(current)) checkError = (e as Error).message
      }).finally(() => { if (checking === of) checking = undefined; changed() })
    }, CHECKED)
  }
  asks()

  // ---------------------------------------------------------------- the camera: the orbit, the gizmo, Look

  const proxy = new THREE.Object3D()
  proxy.userData.cutscene = true
  let dragging: { cue: number; to?: number[] } | undefined
  const r3 = () => client?.plugins.render3d
  const shotSelected = () => {
    const one = selected.length === 1 ? Number(selected[0]) : NaN
    return model.file.cues[one]?.do === 'shot' ? one : undefined
  }
  const OWNER = 'cutscene panel'
  // The orbit holds render3d's camera while Look is off, and the cutscene's own places it while it is
  // on; the ui canvas, the scene's bars, veil and line and the curtain, is drawn with Look alone.
  function camera() {
    const r = r3()
    const cam = r?.camera as THREE.PerspectiveCamera | undefined
    if (!r || !cam || !canvases.length) return
    if (canvases[1]) canvases[1].style.display = looking ? '' : 'none'
    if (looking) {
      if (r.claimed() === OWNER) r.release(OWNER)
      if (orbit) orbit.enabled = false
      if (gizmo) gizmo.getHelper().visible = false
      return
    }
    const holder = r.claimed()
    if (holder !== undefined && holder !== OWNER) r.release(holder)
    r.claim(OWNER)
    if (!orbit) {
      orbit = new OrbitControls(cam, canvases[0])
      orbit.target.copy(cam.position).add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(30))
      orbit.enableDamping = true
    }
    if (!gizmo) {
      gizmo = new TransformControls(cam, canvases[0])
      gizmo.setSize(0.7)
      gizmo.addEventListener('dragging-changed', e => {
        if (orbit) orbit.enabled = !e.value
        if (e.value) return
        const d = dragging
        dragging = undefined
        if (d?.to) change(m => cues.standEdits(m, d.cue, d.to!, heightNow()))
      })
      gizmo.addEventListener('objectChange', () => {
        const one = shotSelected()
        if (one !== undefined) dragging = { cue: one, to: proxy.position.toArray() }
      })
      const helper = gizmo.getHelper()
      helper.userData.cutscene = true
      r.scene.add(helper, proxy)
    }
    orbit.enabled = !gizmo.dragging
    orbit.update()
  }

  // ---------------------------------------------------------------- the stage

  const stageGroup = new THREE.Group()
  stageGroup.name = 'cutscene panel stage'
  stageGroup.userData.cutscene = true
  // Each shot's name over its camera, by its cue, kept from frame to frame.
  const names = new Map<number, CSS2DObject>()
  const nameGroup = new THREE.Group()
  nameGroup.userData.cutscene = true
  const lines = (label: string, points: number[][], colour: number, strip = true) => {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(points.flat()), 3))
    const mat = new THREE.LineBasicMaterial({ color: colour, depthTest: false })
    const line = strip ? new THREE.Line(g, mat) : new THREE.LineSegments(g, mat)
    line.name = label
    line.renderOrder = 10
    line.userData.cutscene = true
    stageGroup.add(line)
  }
  const ring = (label: string, at: number[], r: number, colour: number) =>
    lines(label, Array.from({ length: 49 }, (_, s) => [at[0] + r * Math.cos((s / 48) * 2 * Math.PI), at[1] + 0.05, at[2] + r * Math.sin((s / 48) * 2 * Math.PI)]), colour)
  const frustum = (label: string, p: Pose, colour: number) => {
    const q = new THREE.Quaternion(...p.quat)
    const h = cues.DEPTH * Math.tan((p.fov * Math.PI) / 360), w = h * cues.ASPECT
    const at = (x: number, y: number) => new THREE.Vector3(x, y, -cues.DEPTH).applyQuaternion(q).add(new THREE.Vector3(...p.pos)).toArray()
    const k = [at(-w, -h), at(w, -h), at(w, h), at(-w, h)]
    lines(label, [p.pos, k[0], p.pos, k[1], p.pos, k[2], p.pos, k[3], k[0], k[1], k[1], k[2], k[2], k[3], k[3], k[0]], colour, false)
  }
  const clearStage = () => {
    for (const o of stageGroup.children as THREE.Line[]) {
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
    stageGroup.clear()
  }
  // Each shot's cue and its pose on the rows as they stand, with a dragged camera where it is dragged.
  const poses = () => {
    const rows = truthOf()?.rows ?? []
    const cast = cues.castIds(model, rows)
    const height = heightNow()
    if (!height) return []
    return sorted(model.file.cues).filter(i => model.file.cues[i].do === 'shot').flatMap(i => {
      const p = shotPose(cues.shotView(model, model.file.cues[i]), cast, rows, height)
      if (!p) return []
      if (dragging?.cue === i && dragging.to) p.pos = dragging.to
      return [{ cue: i, pose: p }]
    })
  }
  let pointed: number[] | undefined
  // The stage drawn again from the rows as they stand, the model, the selection and a drag.
  function drawStage() {
    clearStage()
    const r = r3()
    if (!r?.scene) return
    if (stageGroup.parent !== r.scene) r.scene.add(stageGroup, nameGroup)
    stageGroup.visible = nameGroup.visible = !looking
    const all = looking ? [] : poses()
    const height = heightNow()
    if (!looking && height) for (const m of (truthOf()?.rows ?? []).filter(r => r.kind === 'mark')) ring(`mark ${m.data.name}`, placed(m.data.at, height), cues.NEAR, COLOURS.dim)
    let before: Pose | undefined
    for (const { cue, pose } of all) {
      const on = selected.includes(String(cue))
      frustum(`shot ${cue}`, pose, on ? COLOURS.accent : COLOURS.dim)
      if (before && model.file.cues[cue].over > 0) lines(`dolly ${cue}`, [before.pos, pose.pos], on ? COLOURS.accent : COLOURS.dim)
      before = pose
    }
    for (const [cue, label] of names) if (!all.some(p => p.cue === cue)) { label.element.remove(); label.removeFromParent(); names.delete(cue) }
    for (const { cue, pose } of all) {
      let label = names.get(cue)
      if (!label) {
        label = new CSS2DObject(make('div', 'cutscene-label'))
        nameGroup.add(label)
        names.set(cue, label)
      }
      label.element.textContent = model.file.cues[cue].name
      label.element.classList.toggle('on', selected.includes(String(cue)))
      label.position.fromArray(pose.pos)
    }
    if (!looking) for (const [who, path] of Object.entries(measured?.paths ?? {})) if (path.length > 1) lines(`path ${who}`, path.map(p => [p[0], p[1] + 0.1, p[2]]), COLOURS.warn)
    if (!looking && pointed && picking) ring('pick', pointed, cues.NEAR, COLOURS.accent)
    // The gizmo on the selected shot's camera, where it stands now unless it is being dragged.
    if (gizmo && !looking) {
      const one = shotSelected()
      const at = one === undefined ? undefined : all.find(p => p.cue === one)?.pose.pos
      if (at && !gizmo.dragging) proxy.position.fromArray(at)
      if (at && gizmo.object !== proxy) gizmo.attach(proxy)
      if (!at && gizmo.object) gizmo.detach()
      gizmo.getHelper().visible = !!at
    }
    labels.domElement.style.display = looking ? 'none' : ''
    if (!looking && r.camera) labels.render(r.scene, r.camera)
  }

  // The world point drawn under a press: the first surface of render3d's scene.
  const ray = new THREE.Raycaster()
  const under = (cx: number, cy: number): number[] | undefined => {
    const r = r3(), cam = r?.camera as THREE.Camera | undefined
    if (!r?.scene || !cam || !canvases[0]) return undefined
    const b = canvases[0].getBoundingClientRect()
    ray.setFromCamera(new THREE.Vector2(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1), cam)
    for (const h of ray.intersectObject(r.scene as THREE.Scene, true)) {
      let ours = false
      for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (o.userData.cutscene) ours = true
      if (ours) continue
      const mat = (h.object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      const one = Array.isArray(mat) ? mat[0] : mat
      if (h.object.visible && one?.visible !== false && one?.depthWrite) return h.point.toArray()
    }
    return undefined
  }
  // The point on the page a world point is drawn at.
  const onCanvas = (at: number[]) => {
    const cam = r3()?.camera as THREE.Camera | undefined
    if (!cam || !canvases[0]) return undefined
    cam.updateMatrixWorld()
    const v = new THREE.Vector3(...at).project(cam)
    const b = canvases[0].getBoundingClientRect()
    return v.z > 1 ? undefined : [b.left + ((v.x + 1) / 2) * b.width, b.top + ((1 - v.y) / 2) * b.height]
  }
  let pressed: { x: number; y: number } | undefined
  stage.addEventListener('pointerdown', e => {
    if (looking || e.button !== 0 || gizmo?.axis) return
    pressed = { x: e.clientX, y: e.clientY }
    if (picking) return
    const hit = poses().map(s => ({ ...s, px: onCanvas(s.pose.pos) })).filter(s => s.px && Math.hypot(s.px[0] - e.clientX, s.px[1] - e.clientY) <= cues.GRAB)
    if (!hit.length) return
    e.stopPropagation()
    act.select([String(hit[0].cue)])
  }, true)
  stage.addEventListener('pointerup', e => {
    const p = pressed
    pressed = undefined
    if (!p || !picking || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) return
    const { cue, field } = picking
    picking = undefined
    pointed = undefined
    const at = under(e.clientX, e.clientY)
    if (at) change(m => cues.pickEdits(m, cue, field, at))
    else changed()
  })
  stage.addEventListener('pointermove', e => { if (picking) pointed = under(e.clientX, e.clientY) })

  // ---------------------------------------------------------------- what the buttons and the timeline do

  const act = {
    here() { flushNudge(); void seekTo(headNow(), true) },
    pause() { playing = false; changed() },
    // The transport: to the cutscene's start, a step back, a step on, to its end, and stop, which is
    // paused at the start.
    start() { void seekTo(0, false) },
    back() { void seekTo(Math.max(0, headNow() - dt), false) },
    ahead() { void seekTo(headNow() + dt, false) },
    toEnd() { void seekTo(model.end, false) },
    stop() { playing = false; void seekTo(0, false) },
    seek(e: number, done: boolean) {
      if (!done) { scrub = e; return }
      scrub = undefined
      void seekTo(e, false)
    },
    move(moves: Move[], done: boolean) {
      if (!done) return
      change(m => cues.moveEdits(m, moves.filter(mv => m.file.cues[Number(mv.id)]).map(mv => ({ cue: Number(mv.id), at: mv.at, lane: mv.lane }))))
    },
    resize(id: string, length: number, done: boolean) {
      if (!done) return
      change(m => (m.file.cues[Number(id)] ? cues.moveEdits(m, [{ cue: Number(id), len: length }]) : []))
    },
    end(e: number, done: boolean) { if (done) change(m => cues.fileEdits(m, { end: m.toCue(e) })) },
    select(ids: string[]) {
      if (nudging && text(nudging.ids) !== text(ids)) flushNudge()
      selected = ids
      changed()
    },
    key(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      const ids = selected.filter(id => model.file.cues[Number(id)])
      if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length) {
        e.preventDefault()
        // The selection goes at once, so a press again before this is written takes nothing more.
        const at = ids.map(Number)
        selected = []
        change(m => cues.removeEdits(m, at))
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && ids.length) {
        e.preventDefault()
        const by = e.key === 'ArrowRight' ? cues.GRAIN : -cues.GRAIN
        if (nudging && text(nudging.ids) === text(ids)) {
          clearTimeout(nudging.timer)
          nudging.by = cues.round3(nudging.by + by)
        } else {
          flushNudge()
          nudging = { ids, by, timer: 0 as unknown as ReturnType<typeof setTimeout> }
        }
        nudging.timer = setTimeout(flushNudge, cues.NUDGED)
        changed()
      } else if (mod && e.key.toLowerCase() === 'c' && ids.length) {
        e.preventDefault()
        clipboard = ids.map(id => structuredClone(model.file.cues[Number(id)]))
      } else if (mod && e.key.toLowerCase() === 'v' && clipboard.length) {
        e.preventDefault()
        const copies = clipboard, head = headNow()
        change(m => cues.pasteEdits(m, copies, m.toCue(head)), m => copies.map((_, k) => String(m.file.cues.length + k)))
      } else if (mod && e.key.toLowerCase() === 'd' && ids.length) {
        e.preventDefault()
        const some = (m: cues.Model) => ids.map(Number).filter(i => m.file.cues[i])
        change(m => cues.pasteEdits(m, some(m).map(i => m.file.cues[i]), cues.after(m, some(m))), m => some(m).map((_, k) => String(m.file.cues.length + k)))
      }
    },
    add(lane: string) {
      const head = headNow()
      change(m => cues.addEdits(m, lane, head), m => [String(m.file.cues.length)])
    },
    look(on: boolean) {
      looking = on
      if (on) picking = undefined
      changed()
    },
    undo() {
      flushNudge()
      const was = undo.pop()
      if (!was) return
      error = undefined
      play(was)
    },
    revert() {
      flushNudge()
      if (text(current) === text(saved)) return
      undo.push(current)
      error = undefined
      play(structuredClone(saved))
    },
    async save() {
      flushNudge()
      try {
        const r = await post<{ written: string[] }>(route('save'), current)
        saved = structuredClone(current)
        state = r.written.length ? `saved to ${r.written.join(', ')}` : 'nothing changed'
        error = undefined
      } catch (e) {
        error = (e as Error).message
      }
      changed()
    },
  }

  // ---------------------------------------------------------------- the timeline

  const tl = timeline(tlBox)
  const button = (words: string, does: () => void, on = false, cls = '') => {
    const b = make('button', `${on ? 'on' : ''} ${cls}`.trim(), words)
    b.onclick = e => { e.stopPropagation(); does() }
    return b
  }
  // The lanes' heads: `+` on every lane (off on sound in a scene with no sound cues), and the camera
  // lane's Look.
  const laneExtras = (m: cues.Model, lane: string) => {
    const plus = button('+', () => act.add(lane))
    plus.disabled = lane === 'sound' && !!cues.soundless(m)
    return lane === 'camera' ? [plus, button('Look', () => act.look(!looking), looking)] : [plus]
  }
  const handlers = { label: 'cues', grain: cues.GRAIN, format: fmt, onSeek: act.seek, onSelect: act.select, onMove: act.move, onResize: act.resize, onEnd: act.end, onKey: act.key }
  let drawn: { version: number; props: Props } | undefined
  function drawTimeline() {
    if (drawn?.version !== version) {
      const m = model, nudge = nudging
      drawn = {
        version,
        props: {
          ...handlers,
          lanes: m.lanes.map((id): Lane => ({ id, label: id, extra: laneExtras(m, id), ...(id === 'camera' ? { marks: m.failed.map(f => ({ at: f.e })), tone: 'fail' } : {}) })),
          chips: m.chips.map(c => (nudge?.ids.includes(c.id) ? { ...c, at: Math.min(m.end, Math.max(0, c.at + nudge.by)) } : c)),
          marks: m.holdMarks, head: headNow(), span: m.span, fit: url, end: m.end, selected,
        },
      }
    } else drawn.props = { ...drawn.props, head: headNow() }
    tl.set(drawn.props)
  }

  // ---------------------------------------------------------------- the bar

  // The bar's buttons, made again when what they show changes; the playhead's readout every frame.
  let barVersion = -1
  function drawBar() {
    const s = startOf()
    readout.textContent = `${name} · step ${rec.n} · ${busy ? 'seeking' : playing ? 'playing' : 'paused'} · ${s === undefined ? 'waiting for the scene to start its cutscene' : `${fmt(headNow())} / ${fmt(model.end)} s`}`
    if (barVersion === version) return
    barVersion = version
    const dirty = text(current) !== text(saved)
    const u = button('Undo', act.undo)
    u.disabled = !undo.length
    const rv = button('Revert', act.revert)
    rv.disabled = !dirty
    bar.replaceChildren(
      button('⏮ Start', act.start), button('◀ Frame', act.back), button('▶ Play', act.here, playing), button('⏸ Pause', act.pause, !playing),
      button('Frame ▶', act.ahead), button('End ⏭', act.toEnd), button('⏹ Stop', act.stop),
      button('end', () => act.select([END]), selected.includes(END)),
      readout,
      button(`${model.problems.length} problems`, () => { problemsOn = !problemsOn; changed() }, problemsOn, model.problems.length ? 'bad' : ''),
      make('span', 'sp'),
      button('Help', () => { helping = !helping; changed() }, helping),
      u, rv, button('Save', () => void act.save(), dirty),
    )
    const line = (words: string, cls = '') => make('div', cls, words)
    const out = [line(dirty ? `not saved: ${url}` : state || `saved: ${url}`)]
    if (busy) out.push(line('seeking: the recorder boots the game again and replays it to the step'))
    if (measuring) out.push(line('measuring: the recording played again for when each cue fires'))
    if (noCheck) out.push(line(`${noCheck}, so no frame is checked`))
    else if (checking) out.push(line(`checking every frame with ${url.replace(/\.json$/, '.ts')}…`))
    else if (checkError) out.push(line(`the check could not run: ${checkError}`, 'bad'))
    else if (checkedKey === text(current)) out.push(failed.length ? line(`${failed.length} frames fail ${url.replace(/\.json$/, '.ts')}: red on the camera lane`, 'bad') : line(`every frame passes ${url.replace(/\.json$/, '.ts')}`, 'ok'))
    if (held) out.push(line(`${held} skip${held === 1 ? '' : 's'} of the cutscene held off`))
    if (picking) out.push(line('picking: press the scene where the cue goes'))
    if (error) out.push(line(error, 'bad'))
    said.replaceChildren(...out)
  }

  // ---------------------------------------------------------------- the form

  let formVersion = -1
  function drawForm() {
    if (formVersion === version) return
    formVersion = version
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.field
    const one = selected.length === 1 ? selected[0] : undefined
    const out: HTMLElement[] = []
    if (helping) {
      form.replaceChildren(guide())
      return
    }
    if (problemsOn) {
      const sec = make('div', 'sec')
      sec.append(make('div', 'head', 'Problems'))
      if (!model.problems.length) sec.append(make('div', 'note', 'No problems.'))
      for (const p of model.problems) {
        const r = make('div', 'problem')
        r.append(button(`cue ${p.cue}`, () => act.select([String(p.cue)])), make('span', '', p.text))
        sec.append(r)
      }
      out.push(sec)
    }
    if (one === END) out.push(endForm())
    else if (one !== undefined && model.file.cues[Number(one)]) out.push(cueForm(Number(one)))
    else out.push(make('div', 'note', 'Select a cue, or the end.'))
    form.replaceChildren(...out)
    if (focused) form.querySelector<HTMLElement>(`[data-field="${focused}"]`)?.focus()
  }

  // The guide Help shows in place of the form: how to watch the cutscene, move its shots, change its
  // cues and save them.
  function guide() {
    const sec = make('div', 'sec guide')
    const part = (title: string, ...lines: string[]) => {
      sec.append(make('div', 'head', title))
      for (const l of lines) sec.append(make('div', 'line', l))
    }
    part('Watching it',
      'Look, on the camera lane, shows the cutscene\'s own camera, with its bars and fades: what the player sees. Press it again for the free camera.',
      '▶ Play plays from the playhead, ⏸ Pause holds it (Space does both). ⏮ Start and End ⏭ jump to the cutscene\'s start and end (Home, End). ◀ Frame and Frame ▶ step one frame (, and .). ⏹ Stop pauses at the start.',
      'Drag along the ruler at the top of the timeline to move the playhead. Going back replays the game from its start, so it takes a moment.')
    part('Moving a shot',
      'With Look off: drag to turn the view, scroll to zoom, right-drag to slide.',
      'Each shot\'s camera is drawn in the scene with its name. Click one to choose its shot, then drag the arrows to move it.',
      'Or move the view where you want the shot and press take the view in its form.')
    part('Changing cues',
      '+ on a lane adds a cue there at the playhead.',
      'Click a cue to change it here. Drag it to move it in time, or onto another cast member\'s lane. Drag its right end to make it longer or shorter.',
      'Delete takes the chosen cues out. ← and → move them a little. ⌘C copies, ⌘V pastes at the playhead, ⌘D makes a copy after them.',
      'The bracket at the end of the timeline is where the cutscene ends: drag it, or click it to set end, go and arrive.')
    part('Problems',
      'Red marks on the camera lane are frames the game\'s own check fails. The problems button lists them, and every other problem, with the cue each is on.')
    part('Saving',
      'Every change plays at once. Undo (⌘Z) takes back the last one, Revert takes back everything not saved, Save writes the cue file into the game.',
      'A click or a key here never skips the cutscene.')
    return sec
  }

  // A form's row: its label and what sets it.
  const row = (label: string, ...what: HTMLElement[]) => {
    const r = make('div', 'row')
    r.append(make('span', 'lab', label), ...what)
    return r
  }
  const numField = (field: string, value: number | undefined, done: (v: number | undefined) => void, optional = false) => {
    const i = make('input')
    i.type = 'number'
    i.step = 'any'
    i.dataset.field = field
    i.value = value === undefined ? '' : String(value)
    i.onchange = () => {
      if (i.value === '') { if (optional) done(undefined) } else if (Number.isFinite(Number(i.value))) done(Number(i.value))
    }
    return i
  }
  const textField = (field: string, value: string, done: (v: string) => void) => {
    const i = make('input')
    i.dataset.field = field
    i.value = value
    i.onchange = () => done(i.value)
    return i
  }
  const selectField = (field: string, value: string, options: { value: string; off?: string }[], done: (v: string) => void) => {
    const s = make('select')
    s.dataset.field = field
    for (const o of options) {
      const opt = new Option(o.off ? `${o.value}: ${o.off}` : o.value, o.value)
      opt.disabled = !!o.off
      s.append(opt)
    }
    s.value = value
    s.onchange = () => done(s.value)
    return s
  }
  const checkField = (field: string, value: boolean, done: (v: boolean) => void) => {
    const i = make('input')
    i.type = 'checkbox'
    i.dataset.field = field
    i.checked = !!value
    i.onchange = () => done(i.checked)
    return i
  }
  const sliderField = (field: string, min: number, max: number, step: number, value: number, done: (v: number) => void) => {
    const box = make('span', 'slider')
    const i = make('input')
    i.type = 'range'
    Object.assign(i, { min: String(min), max: String(max), step: String(step) })
    i.dataset.field = field
    i.value = String(value)
    const at = make('span', 'at', fmt(value))
    i.oninput = () => { at.textContent = fmt(Number(i.value)) }
    i.onchange = () => done(Number(i.value))
    box.append(i, at)
    return box
  }
  const vecField = (field: string, value: number[], done: (v: number[]) => void) => {
    const box = make('span', 'vec')
    const fields = [0, 1, 2].map(k => {
      const i = make('input')
      i.type = 'number'
      i.step = 'any'
      i.dataset.field = `${field}.${k}`
      i.value = String(value?.[k] ?? 0)
      i.onchange = () => { const v = fields.map(f => Number(f.value)); if (v.every(Number.isFinite)) done(v) }
      return i
    })
    box.append(...fields)
    return box
  }
  const jsonField = (field: string, value: unknown, done: (v: unknown) => void) => {
    const i = make('input')
    i.dataset.field = field
    i.value = JSON.stringify(value)
    i.onchange = () => {
      try { done(JSON.parse(i.value)) } catch { error = `${JSON.stringify(i.value)} is not JSON`; changed() }
    }
    return i
  }
  // A target: a cast member, a mark, or a point typed as its numbers.
  const targetField = (field: string, value: unknown, done: (v: unknown) => void, nothing = false) => {
    const box = make('span', 'target')
    const named = [...new Set([...model.cast, ...model.marks.map(k => k.name)])]
    const point = Array.isArray(value)
    const chosen = value === null || value === undefined ? NOTHING : point ? POINT : String(value)
    const options = [...(nothing ? [NOTHING] : []), ...named, ...(named.includes(chosen) || chosen === NOTHING || chosen === POINT ? [] : [chosen]), POINT].map(v => ({ value: v }))
    box.append(selectField(field, chosen, options, v => {
      if (v === NOTHING) done(null)
      else if (v === POINT) done(point ? value : [0, 0])
      else done(v)
    }))
    if (point) box.append(textField(`${field} point`, (value as number[]).join(', '), v => {
      try { done(cues.typed(model, v)) } catch (e) { error = (e as Error).message; changed() }
    }))
    return box
  }

  function endForm() {
    const sec = make('div', 'sec')
    sec.append(make('div', 'head', 'End'))
    sec.append(row('end', numField('end', model.file.end, v => { if (v !== undefined) change(m => cues.fileEdits(m, { end: v })) })))
    sec.append(row('go', textField('go', model.file.go ?? '', v => change(m => cues.fileEdits(m, { go: v === '' ? undefined : v })))))
    sec.append(row('arrive', jsonField('arrive', model.file.arrive ?? [], v => change(m => cues.fileEdits(m, { arrive: v })))))
    return sec
  }

  function cueForm(i: number) {
    const c = model.file.cues[i]
    const set = (field: string) => (v: unknown) => change(m => (m.file.cues[i] ? cues.patched(m, i, { [field]: v }) : []))
    const num = (field: string, fallback?: number) => row(field, numField(field, c[field] ?? fallback ?? 0, v => set(field)(v)))
    const who = (line = false) => row('who', selectField('who', c.who, [...model.cast, ...(line ? ['line'] : [])].map(v => ({ value: v })), set('who')))
    const target = (field: string, nothing = false) => row(field, targetField(field, c[field], set(field), nothing))
    const clip = (options: string[], field = 'clip', none = false) => {
      const all = [...(none ? [NOTHING] : []), ...options, ...(c[field] === null || options.includes(c[field]) ? [] : [c[field]])]
      return row(field, selectField(field, c[field] ?? NOTHING, all.map(v => ({ value: v })), v => set(field)(v === NOTHING ? null : v)))
    }
    const pick = () => button(picking?.cue === i ? 'picking: press the scene' : 'pick in the view', () => { picking = { cue: i, field: 'to' }; looking = false; changed() }, picking?.cue === i)
    const steps = model.context.steps
    // What a wait may wait for: a cast member's walk, the line, or a delivered step that holds.
    const holding = Object.keys(steps).filter(k => steps[k].wait)
    const own: Record<string, () => HTMLElement[]> = {
      play: () => [who(), clip(model.clips(c.who)), row('holds', checkField('holds', c.holds, set('holds'))), num('rate')],
      gesture: () => [who(), clip(model.clips(c.who))],
      walk: () => [who(), target('to'), clip(model.gears(c.who), 'gear', true), num('limit', model.file.limit), pick()],
      face: () => [who(), target('to', true), pick()],
      say: () => [
        who(),
        row('text', textField('text', c.text, set('text'))),
        num('for'),
        row('voice', textField('voice', c.voice ?? '', v => set('voice')(v === '' ? undefined : v))),
      ],
      wait: () => {
        const choices = [...model.cast, 'line', ...holding.map(k => `on ${k}`)]
        const now = c.on !== undefined ? `on ${c.on}` : c.who
        return [row('for', selectField('for', now, choices.map(v => ({ value: v })), v => change(m => cues.patched(m, i, v.startsWith('on ') ? { on: v.slice(3) } : { who: v }))))]
      },
      shot: () => [
        row('name', textField('name', c.name, set('name'))),
        row('follows', selectField('follows', c.follows ?? NOTHING, [NOTHING, ...model.cast].map(v => ({ value: v })), v => set('follows')(v === NOTHING ? undefined : v))),
        ...(c.follows !== undefined ? [row('frame', selectField('frame', c.frame ?? 'world', [{ value: 'world' }, { value: 'body' }], set('frame')))] : []),
        c.follows !== undefined ? row('offset', vecField('offset', c.pos, set('pos'))) : target('pos'),
        target('look'),
        row('fov', sliderField('fov', 10, 120, 1, c.fov ?? model.file.fov, set('fov'))),
        num('over'),
        button('take the view', () => {
          const e = eye()
          if (e) change(m => cues.takeEdits(m, i, e, heightNow()))
        }),
      ],
      fade: () => [row('to', sliderField('to', 0, 1, 0.01, c.to, set('to'))), num('over')],
      bars: () => [row('on', checkField('on', c.on, set('on'))), num('over')],
      shake: () => [num('over'), num('amp')],
      sound: () => [
        row('cue', selectField('cue', c.cue, [...new Set([...model.sounds, c.cue])].map(v => ({ value: v })), set('cue'))),
        row('who', selectField('who', c.who ?? NOTHING, [NOTHING, ...model.cast].map(v => ({ value: v })), v => set('who')(v === NOTHING ? undefined : v))),
        ...(c.who === undefined ? [row('where', targetField('where', c.where ?? null, v => set('where')(v === null ? undefined : v), true))] : []),
      ],
      music: () => [row('name', textField('name', c.name, set('name')))],
    }
    // A field of a kind the editor has no form for, a delivered step's among them, by its rule.
    const byRule = (field: string, spec: string): HTMLElement => {
      const rule = spec.replace(/\?$/, ''), optional = spec.endsWith('?')
      const v = c[field]
      const or = (x: unknown) => (optional && (x === '' || x === null) ? undefined : x)
      switch (rule) {
        case 'who': return row(field, selectField(field, v ?? NOTHING, [...(optional ? [NOTHING] : []), ...model.cast].map(x => ({ value: x })), x => set(field)(x === NOTHING ? undefined : x)))
        case 'waited': return row(field, selectField(field, v ?? NOTHING, [...(optional ? [NOTHING] : []), ...model.cast, 'line'].map(x => ({ value: x })), x => set(field)(x === NOTHING ? undefined : x)))
        case 'target': return row(field, targetField(field, v, x => set(field)(or(x)), optional))
        case 'facing': return row(field, targetField(field, v, set(field), true))
        case 'flag': return row(field, checkField(field, v, set(field)))
        case 'frame': return row(field, selectField(field, v ?? 'world', [{ value: 'world' }, { value: 'body' }], set(field)))
        case 'args': return row(field, jsonField(field, v ?? [], set(field)))
        case 'text': return row(field, textField(field, v ?? '', x => set(field)(or(x))))
        case 'clip': return row(field, textField(field, v ?? '', x => set(field)(x === '' ? (optional ? undefined : null) : x)))
        default: return row(field, numField(field, v, x => set(field)(x), optional))
      }
    }
    const isOwn = !cues.delivered(steps, c.do) && Object.hasOwn(own, c.do)
    const fields = isOwn ? own[c.do]() : Object.entries(cues.rulesOf(steps, c.do) ?? {}).map(([f, spec]) => byRule(f, spec))
    const sec = make('div', 'sec')
    sec.append(make('div', 'head', `Cue ${i}${cues.delivered(steps, c.do) ? ` · ${c.do}, the game's own` : ''}`))
    sec.append(row('at', numField('at', c.at, v => { if (v !== undefined) set('at')(v) })))
    sec.append(row('do', selectField('do', c.do, model.dos.map(v => ({ value: v, off: v === 'sound' && c.do !== 'sound' ? cues.soundless(model) : undefined })), v => change(m => (m.file.cues[i] ? cues.patched(m, i, { do: v }) : [])))))
    sec.append(...fields)
    for (const line of model.note(i)) sec.append(make('div', 'note', line))
    return sec
  }

  // ---------------------------------------------------------------- keys and the clock

  // ⌘Z undoes; Space plays or pauses, `,` and `.` step a frame back and on, Home and End go to the
  // cutscene's start and its end; none of them while a field is typed in. Heard on the way down, before
  // the panel stops a key at itself, so they work with the timeline in focus too.
  addEventListener('keydown', e => {
    if ((e.target as HTMLElement).closest('input, textarea, select')) return
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); act.undo(); return }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const keys: Record<string, () => void> = { ' ': () => (playing ? act.pause() : act.here()), ',': act.back, '.': act.ahead, Home: act.start, End: act.toEnd }
    if (!keys[e.key]) return
    e.preventDefault()
    keys[e.key]()
  }, true)
  addEventListener('error', e => fail(e.error ?? e.message))
  addEventListener('unhandledrejection', e => fail(e.reason))

  // One frame: the clock's steps, the view drawn, the camera, the stage, the timeline, the bar and the
  // form.
  async function frame(now: number) {
    if (drawing) return
    drawing = true
    try {
      if (!busy) {
        if (playing) {
          page.input()
          owed += Math.min((now - last) / 1000, 0.25)
          while (playing && owed >= dt) {
            owed -= dt
            const stopped = rec.step()
            if (stopped) {
              playing = false
              await stopped
              error = `step ${rec.failure?.at}: ${rec.failure?.message}`
              changed()
            }
          }
        } else rec.refresh()
        last = now
        await page.frame(playing ? owed / dt : undefined)
        // The step the cutscene's elapsed time counts from: the first step it runs.
        const d = rowOf()?.data
        if (start === undefined && d?.running) {
          start = rec.n - Math.round(d.e / dt)
          changed()
          measure()
        }
      }
      camera()
      drawStage()
      drawTimeline()
      drawBar()
      drawForm()
    } catch (e) {
      fail(e)
    } finally {
      drawing = false
    }
  }
  const loop = (now: number) => { void frame(now).then(() => requestAnimationFrame(loop)) }
  requestAnimationFrame(loop)

  const me = {
    get model() { return model },
    get rec() { return rec },
    get client() { return client },
    get current() { return current },
    get saved() { return saved },
    get held() { return held },
    get failed() { return failed },
    get measured() { return measured },
    get start() { return startOf() },
    get looking() { return looking },
    get selected() { return selected },
    get error() { return error },
    act,
  }
  Object.assign(window, { cutscene: me })
  return me

  // The page: the stage the game's canvases go in, and the panel across the bottom, its bar, what it
  // says, the timeline and the form, with its own styles. Keys and presses on the panel stop at it.
  function layout() {
    const style = make('style')
    style.textContent = CSS
    document.head.append(style)
    const stage = make('div', 'cutscene-stage')
    const panel = make('div', 'cutscene-panel')
    const bar = make('div', 'bar'), said = make('div', 'said'), body = make('div', 'body')
    const tlBox = make('div', 'timeline'), form = make('div', 'form'), readout = make('span', 'readout')
    body.append(tlBox, form)
    panel.append(bar, said, body)
    bar.append(readout)
    document.body.append(stage, panel)
    for (const type of ['keydown', 'keyup', 'click', 'mousedown', 'contextmenu', 'wheel']) panel.addEventListener(type, e => e.stopPropagation())
    return { stage, panel, form, bar, said, tlBox, readout }
  }
}

// The panel's styles, and the timeline's as the editor draws it (`editor/ui/ui.css`), in its colours.
const CSS = `
.cutscene-stage { position: fixed; background: #000 }
.cutscene-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block }
.cutscene-labels { position: absolute; inset: 0; pointer-events: none; z-index: 1 }
.cutscene-label { font: 11px ui-monospace, monospace; color: #5bbf7a; text-shadow: 0 1px 2px #000; pointer-events: none }
.cutscene-label.on { color: #e0a33a }
.cutscene-panel { --bg: #16171a; --panel: #1e2024; --line: #2c2f35; --text: #d6d8dc; --dim: #8a8f98; --accent: #e0a33a; --ok: #5bbf7a; --pin: #e0573a;
  position: fixed; left: 8px; right: 8px; bottom: 8px; height: calc(${PANEL * 100}vh - 16px); display: flex; flex-direction: column; z-index: 10;
  background: #1e2024f0; color: var(--text); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 6px 24px #0008; overflow: hidden;
  font: 12px/1.4 -apple-system, system-ui, sans-serif }
.cutscene-panel button, .cutscene-panel select, .cutscene-panel input { font: inherit; font-size: 12px; color: var(--text) }
.cutscene-panel button { padding: 3px 9px; border: 1px solid var(--line); border-radius: 4px; background: #25282d; cursor: pointer }
.cutscene-panel button.on { background: var(--accent); color: #111; border-color: var(--accent) }
.cutscene-panel button.bad { border-color: var(--pin); color: var(--pin) }
.cutscene-panel button:disabled { opacity: .4; cursor: default }
.cutscene-panel select, .cutscene-panel input { background: #15161a; border: 1px solid var(--line); border-radius: 4px; padding: 2px 5px }
.cutscene-panel .bar { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--line) }
.cutscene-panel .sp { flex: 1 }
.cutscene-panel .readout, .cutscene-panel .at { font: 11px ui-monospace, monospace; color: var(--dim) }
.cutscene-panel .said { padding: 3px 10px; font-size: 11px; color: var(--dim); max-height: 52px; overflow: auto }
.cutscene-panel .said .bad { color: var(--pin) }
.cutscene-panel .said .ok { color: var(--ok) }
.cutscene-panel .body { flex: 1; min-height: 0; display: flex }
.cutscene-panel .timeline { flex: 1; min-width: 0; display: flex }
.cutscene-panel .form { flex: 0 0 340px; overflow: auto; border-left: 1px solid var(--line) }
.cutscene-panel .sec { padding: 4px 12px }
.cutscene-panel .head { font-size: 12px; color: var(--accent); margin: 6px 0 4px }
.cutscene-panel .row { display: flex; align-items: center; gap: 6px; margin: 4px 0 }
.cutscene-panel .lab { flex: 0 0 56px; color: var(--dim); font-size: 11px }
.cutscene-panel .row input:not([type]), .cutscene-panel .row input[type=number], .cutscene-panel .row select { flex: 1; min-width: 0 }
.cutscene-panel .target, .cutscene-panel .vec, .cutscene-panel .slider { flex: 1; min-width: 0; display: flex; gap: 4px; align-items: center }
.cutscene-panel .target > *, .cutscene-panel .vec input { flex: 1; min-width: 0 }
.cutscene-panel .slider input { flex: 1; accent-color: var(--accent); padding: 0; border: 0; background: none }
.cutscene-panel .note { color: var(--dim); font-size: 11px; margin: 3px 0 }
.cutscene-panel .guide .line { margin: 3px 0 6px; font-size: 12px; line-height: 1.45 }
.cutscene-panel .problem { display: flex; gap: 6px; align-items: baseline; margin: 3px 0; font-size: 11px }
.cutscene-panel .problem button { flex: none; padding: 1px 6px; font-size: 11px }
.cutscene-panel .sec > button { margin: 4px 6px 0 0 }
.ui-timeline { --row: 22px; --tl-head: 120px; --border: var(--line); --selected: #3a3d44; --hover: #2c2f35; --fg: var(--text); --accent-fg: #111; --warn: var(--pin); --shadow: #0009; --radius: 3px; --mono: 10px ui-monospace, monospace;
  flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--bg); user-select: none }
.ui-tl-row { display: flex; min-height: var(--row); border-bottom: 1px solid var(--border) }
.ui-tl-head { flex: 0 0 var(--tl-head); display: flex; align-items: center; gap: 4px; min-width: 0; padding: 0 6px; border-right: 1px solid var(--border); background: var(--panel) }
.ui-tl-head button { padding: 0 6px; font-size: 11px }
.ui-tl-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px }
.ui-tl-ruler { position: relative; flex: 1; min-width: 0; height: var(--row); overflow: hidden; background: var(--panel); cursor: text; outline: none }
.ui-tl-ruler:focus-visible { box-shadow: inset 0 0 0 1px var(--accent) }
.ui-tl-tick { position: absolute; top: 0; bottom: 0; padding: 1px 3px; border-left: 1px solid var(--border); color: var(--dim); font: var(--mono); white-space: nowrap; pointer-events: none }
.ui-tl-mark { position: absolute; bottom: 2px; width: 2px; height: 6px; margin-left: -1px; border-radius: 1px; background: var(--accent); pointer-events: none }
.ui-tl-hold { position: absolute; bottom: 0; height: 8px; background: repeating-linear-gradient(135deg, var(--dim) 0 2px, transparent 2px 5px); opacity: 0.7; pointer-events: none }
.ui-tl-head-mark { position: absolute; bottom: 0; width: 0; height: 0; margin-left: -5px; border: 5px solid transparent; border-bottom-color: var(--accent); pointer-events: none }
.ui-tl-past { position: absolute; top: 0; bottom: 0; right: 0; background: repeating-linear-gradient(135deg, var(--shadow) 0 2px, transparent 2px 6px); pointer-events: none }
.ui-tl-body { position: relative; flex: 1; min-height: 0; overflow: auto; outline: none }
.ui-tl-body:focus-visible { box-shadow: inset 0 0 0 1px var(--accent) }
.ui-tl-track { position: relative; flex: 1; min-width: 0; overflow: hidden }
.ui-tl-over { position: absolute; top: 0; bottom: 0; left: calc(var(--tl-head) + 1px); right: 0; overflow: hidden; pointer-events: none }
.ui-tl-playhead { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--accent) }
.ui-tl-end { position: absolute; top: 0; bottom: 0; width: 7px; margin-left: -1px; border-left: 2px solid var(--fg); border-top: 2px solid var(--fg); border-bottom: 2px solid var(--fg); cursor: ew-resize; pointer-events: auto }
.ui-tl-end.ui-selected { border-color: var(--accent) }
.ui-tl-lane-mark { position: absolute; top: 8px; bottom: 8px; min-width: 2px; border-radius: 1px; background: var(--dim); cursor: pointer }
.ui-tl-lane-mark.fail { background: var(--pin); top: 5px; bottom: 5px; opacity: 0.85 }
.ui-tl-box { position: absolute; border: 1px solid var(--accent); background: var(--selected); opacity: 0.5; pointer-events: none }
.ui-chip { position: absolute; top: 3px; bottom: 3px; display: flex; align-items: center; min-width: 0; padding: 0 4px; overflow: hidden; border-radius: var(--radius); background: var(--selected); color: var(--fg); font: var(--mono); white-space: nowrap; cursor: grab }
.ui-chip.ui-selected { background: var(--accent); color: var(--accent-fg) }
.ui-chip-label { overflow: hidden; text-overflow: ellipsis; pointer-events: none }
.ui-chip-point { width: 10px; margin-left: -5px; padding: 0; top: 7px; bottom: 7px; border-radius: 2px; background: var(--dim); transform: rotate(45deg) scale(0.8) }
.ui-chip-point.ui-selected { background: var(--accent) }
.ui-chip-stripe { background: repeating-linear-gradient(135deg, var(--selected) 0 6px, var(--hover) 6px 10px) }
.ui-chip-stripe.ui-selected { background: repeating-linear-gradient(135deg, var(--accent) 0 6px, var(--selected) 6px 10px) }
.ui-chip-ramp { clip-path: polygon(0 100%, 100% 0, 100% 100%); border-radius: 0 }
.ui-chip-loop { border-radius: 9px }
.ui-chip-open { border-top-right-radius: 0; border-bottom-right-radius: 0; -webkit-mask-image: linear-gradient(to right, #000 70%, transparent); mask-image: linear-gradient(to right, #000 70%, transparent) }
.ui-chip-warn { box-shadow: inset 0 0 0 2px var(--warn) }
.ui-chip-edge { position: absolute; top: 0; bottom: 0; right: 0; width: 6px; cursor: ew-resize }
`
