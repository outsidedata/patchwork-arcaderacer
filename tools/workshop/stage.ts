// The particle workshop's stage: an effects file played by core's own particle3d on a scene's render3d,
// with no game running. The particle workshop's page (`particles.ts`) tunes an effect on it, and the
// views page (`views.ts`) takes pictures of one.
//
// `stage(found, view)` builds it in the box `view` from one entry of the server's particles summary
// (`/api/particles`, `/api/particles/<game>`): the loader (its catalogue the scene's sheets), particle3d,
// lights3d and instances3d when the scene lists them, and render3d with the scene's own prefab (its tone,
// exposure and bloom), every mod the scene's world names loaded as a truth loads them. On it: a grid of
// 1 m squares on the ground, y 0; a stick of 1.8 m, a person, beside the middle; the stage's own sky and
// sun, for what a word draws lit; and the bomb box3d throws across it (`thrown.ts`), hidden until shown.
// particle3d is handed the stage's own copy of the effects file, every file it lists laid over it
// (`gather`), in place of the loader's, and told it
// was written each time `show` is handed the effects to play, so every particle in the air takes the
// new numbers from the next step, as it does when the file is written while the game runs.
//
// Two plugins can draw the effects: particle3d, every particle on the CPU, and gpuparticle3d, every particle
// on the GPU, which plays the same file. Both are made and both handed the stage's copy; `use(drawer)` picks
// the one that steps and draws, and closes the other, its particles gone. gpuparticle3d's world is the
// stage's particle3d world under its name: the same effects file, `hold` and `attach`, and its `behaviors`
// and `sources` mods those particle3d's names, since each plugin that hands particle3d words or sources
// hands gpuparticle3d them too (`instances3d.gpuparticle3d.ts`, `box3dvehicle.gpuparticle3d.ts`). What its
// particles bounce off is gpgpu3d's: where particle3d names `solids`, the stage has a gpgpu3d whose
// `things` and `behaviors` are those plugins (`shapes3d.gpgpu3d.ts`), holding what stands within REACH
// metres of the camera, and gpuparticle3d's `solids` is gpgpu3d (`gpgpu3d.gpuparticle3d.ts`).
//
// A scene that lists dither3d is drawn through it on the stage too, its `world.dither3d` the scene's: its
// pass after render3d's tone mapping and its ratio, from the stage's first tick, as in the game. It is on
// `plugins.dither3d`, whose `on` a page turns it off and on with.
//
// Handed a look of the summary's `ui3d` (`stage(found, view, ui)`), the stage is that scene's ui3d too: its
// `world.ui3d` and the catalogue entries of its looks file and models laid over the stage's world, ui3d
// listed ahead of particle3d, and `shipped` listed when the scene ships plugins of the game's own, so the
// game's words for ui3d (a `<a>.ui3d.ts` of a plugin `world.shipped.plugins` names) are loaded and named as
// the scene names them; the game's plugins themselves are not run on the stage. `ui3d` is then the
// stage's ui3d, which the page shows a look with every frame, between `tick` and `step`, and `ui()` runs
// its `afterTick`, its words handed the drawer in use as `particle3d`.
//
// It hands back:
//   plugins   the page's plugins, as a look is handed them: `loader`, `particle3d`, `gpuparticle3d`, `render3d`, ...
//   fx        the drawer in use, whose `emit` throws an effect; `drawer` its name.
//   use(drawer)  `particle3d` or `gpuparticle3d` steps and draws from now on.
//   loader    the loader itself, whose sheets a page may ask for.
//   three, camera, canvas, grid, stick, bomb, toss   the scene, its camera, the canvas it is drawn on,
//             the grid, the stick, the bomb's mesh and the thrown source.
//   sky, sun  the stage's own lights, a hemisphere and a directional, which a page may turn up or down.
//   show(effects, { drivers, forceGenerators })   the effects particle3d plays from now on, by name, in
//             place of the file's; and, when they are handed, the drivers and the force generators it
//             plays them by, in place of the file's.
//   ui3d      the stage's ui3d, when it was handed a look's scene; `ui()` its `afterTick`, once a frame
//             after the page's `show` and before any step.
//   tick()    every plugin's `tick`, the loader's first: once a frame, before any step.
//   step(dt)  particle3d moved one step of `dt` seconds.
//   draw()    the frame drawn: render3d's `afterTick`.
//   fit()     the canvas fitted to its box as the box is now.
import * as THREE from 'three'
import { loader } from '#plugins/loader/loader.plugin.ts'
import { particle3d, type Effects, type Layer } from '#plugins/particle3d/particle3d.plugin.ts'
import { gpuparticle3d } from '#plugins/gpuparticle3d/gpuparticle3d.plugin.ts'
import { gpgpu3d } from '#plugins/gpgpu3d/gpgpu3d.plugin.ts'
import { lights3d } from '#plugins/lights3d/lights3d.plugin.ts'
import { instances3d } from '#plugins/instances3d/instances3d.plugin.ts'
import { ui3d } from '#plugins/ui3d/ui3d.plugin.ts'
import { dither3d } from '#plugins/dither3d/dither3d.plugin.ts'
import { prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { thrown, type Thrown } from './thrown.ts'

type Json = any
// Metres round the camera the stage's gpgpu3d holds things within: the stage's camera turns about its
// middle, and its far plane is this far.
const REACH = 2000
// One entry of the server's particles summary: the effects file, and `listed`, each file it lists
// (`files`), its path as `file` is written and the file as it is on disk.
export type Found = { file: string; key: string; scenes: string[]; effects: Effects; world: Json; plugins: string[]; render3d: Json; dt: number; thrown: Thrown; listed: { file: string; effects: Effects }[]; ui3d: Ui3dScene[] }
// A scene's looks file, as the summary names it: the scene, the file's repo path, the file as it is on disk,
// and the world the stage lays over its own to show its looks.
export type Ui3dScene = { scene: string; file: string; looks: Record<string, Json>; world: Json }

// The effects file with every file it lists laid over it, as particle3d lays them when it reads it, listing
// none; and `owner`, the file each effect, force generator and driver is in, by its name, as the summary
// names the files: the last that has it, as particle3d lays them.
export type Owner = { effects: Record<string, string>; forceGenerators: Record<string, string>; drivers: Record<string, string> }
export function gather(found: Found): { whole: Effects; owner: Owner } {
  const { files: _, ...whole } = structuredClone(found.effects)
  const owner: Owner = { effects: {}, forceGenerators: {}, drivers: {} }
  const lay = (file: string, e: Effects) => {
    for (const n of Object.keys(e.effects ?? {})) owner.effects[n] = file
    for (const n of Object.keys(e.forceGenerators ?? {})) owner.forceGenerators[n] = file
    for (const n of Object.keys(e.drivers ?? {})) owner.drivers[n] = file
  }
  lay(found.file, found.effects)
  for (const l of found.listed) {
    lay(l.file, l.effects)
    Object.assign(whole.effects, structuredClone(l.effects.effects))
    if (l.effects.forceGenerators) whole.forceGenerators = { ...whole.forceGenerators, ...structuredClone(l.effects.forceGenerators) }
    if (l.effects.drivers) whole.drivers = { ...whole.drivers, ...structuredClone(l.effects.drivers) }
  }
  return { whole, owner }
}

// Whether an effect is a stream: any of its layers, its named effects' too, bursts again `every` so many
// seconds, so it is played without end, as the game plays it while it is on. Any other is one burst.
export const streams = (effects: Record<string, Layer[]>, name: string, seen: string[] = []): boolean =>
  (effects[name] ?? []).some(l => ('lamp' in l ? false : 'effect' in l ? !seen.includes(l.effect) && streams(effects, l.effect, [...seen, name]) : !!l.every))

export async function stage(found: Found, view: HTMLElement, ui?: Ui3dScene) {
  if (ui) {
    found.world.ui3d = ui.world.ui3d
    found.world.loader = { ...found.world.loader, assets: { ...found.world.loader?.assets, ...ui.world.loader.assets } }
  }
  // What particle3d reads: the file with the files it lists laid over it, with the effects `show` was last
  // handed.
  const shown: Effects = gather(found).whole
  const heard: (() => void)[] = []
  const show = (effects: Record<string, Layer[]>, more?: Pick<Effects, 'drivers' | 'forceGenerators'>) => {
    for (const k of Object.keys(shown.effects)) delete shown.effects[k]
    Object.assign(shown.effects, structuredClone(effects))
    if (more) {
      shown.drivers = structuredClone(more.drivers)
      shown.forceGenerators = structuredClone(more.forceGenerators)
    }
    for (const f of heard) f()
  }

  const cpuWorld = found.world.particle3d ?? {}
  const solid = cpuWorld.mods?.solids
  const order = ['loader', ...(ui && found.world.shipped ? ['shipped'] : []), ...found.plugins.flatMap(n => (n === 'particle3d' ? [...(ui ? ['ui3d'] : []), 'particle3d', ...(solid ? ['gpgpu3d'] : []), 'gpuparticle3d'] : [n]))]
  if (solid) found.world.gpgpu3d = { reach: REACH, mods: { things: solid, behaviors: solid } }
  found.world.gpuparticle3d = {
    ...(cpuWorld.effects !== undefined ? { effects: cpuWorld.effects } : {}),
    ...(cpuWorld.hold !== undefined ? { hold: cpuWorld.hold } : {}),
    ...(cpuWorld.attach !== undefined ? { attach: cpuWorld.attach } : {}),
    mods: {
      ...(solid ? { solids: 'gpgpu3d' } : {}),
      ...(cpuWorld.mods?.behaviors ? { behaviors: cpuWorld.mods.behaviors } : {}),
      ...(cpuWorld.mods?.sources ? { sources: cpuWorld.mods.sources } : {}),
    },
  }
  const scene = {
    plugins: order,
    world: found.world,
    prefabs: {
      engine: { width: view.clientWidth, height: view.clientHeight, dt: found.dt },
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
  // Every mod the stage's world names loaded, as a truth loads them: the words particle3d draws by
  // (instances3d's `mesh`) and what it bounces off; a game's own plugins' mods from the game's folder.
  const home = /^games\/([^/]+)\//.exec(found.file)?.[1]
  if (home) found.world.scenemanager = { ...found.world.scenemanager, home: new URL(`/games/${home}/`, location.href).href }
  await prepare({}, [], found.world)
  const drawers = { particle3d: particle3d(), gpuparticle3d: gpuparticle3d() }
  type Drawer = keyof typeof drawers
  let drawer: Drawer = 'particle3d'
  const P: Json = { wire: { n: 1, rows: [], scene, between: 1 }, loader: handed, ...drawers, render3d: render3d() }
  if (solid) P.gpgpu3d = gpgpu3d()
  if (found.plugins.includes('lights3d')) P.lights3d = lights3d()
  if (found.plugins.includes('instances3d')) P.instances3d = instances3d()
  if (ui) P.ui3d = ui3d()
  if (found.plugins.includes('dither3d')) P.dither3d = dither3d()
  const canvas = document.createElement('canvas')
  view.prepend(canvas)
  P.render3d.mount(canvas)
  real.tick(P)
  P.render3d.tick(P)
  P.render3d.ratio(devicePixelRatio)
  // dither3d takes render3d's frame from its first tick, as it does in the game: its pass and its ratio
  P.dither3d?.tick(P)
  const three = P.render3d.scene as THREE.Scene
  if (three.background === null) three.background = new THREE.Color(0x0b0b0e)
  const grid = new THREE.GridHelper(20, 20, 0x3a3d44, 0x24262b)
  three.add(grid)
  // the stage's own light, for what a word draws lit (instances3d's meshes): a sky over a dim ground, and a sun
  const sky = new THREE.HemisphereLight(0xdfe6f0, 0x4a4540, 1.2)
  three.add(sky)
  const sun = new THREE.DirectionalLight(0xfff2e0, 2)
  sun.position.set(5, 8, 4)
  three.add(sun)
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 12), new THREE.MeshBasicMaterial({ color: 0xdddddd }))
  stick.position.set(1.5, 0.9, 0)
  three.add(stick)
  const camera = P.render3d.camera as THREE.PerspectiveCamera
  P.render3d.claim('workshop')

  // The bomb the thrown source throws: a capsule the size of the stage file's body.
  const toss = thrown(found.thrown)
  const radius = Math.max(...found.thrown.body.shapes.map((s: Json) => s.sphere?.radius ?? s.capsule?.radius ?? Math.max(...(s.box ?? [0.1]))))
  const length = Math.max(...found.thrown.body.shapes.map((s: Json) => (s.capsule ? Math.hypot(...s.capsule.center2.map((v: number, i: number) => v - s.capsule.center1[i])) : 0)))
  const bomb = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), new THREE.MeshBasicMaterial({ color: 0x2a2d33 }))
  bomb.visible = false
  three.add(bomb)

  const engine = scene.prefabs.engine
  return {
    plugins: P, loader: real, three, camera, canvas, grid, stick, bomb, toss, show, sky, sun,
    get fx() { return drawers[drawer] },
    get drawer() { return drawer },
    use(next: Drawer) {
      if (next === drawer) return
      drawers[drawer].close(P)
      drawer = next
    },
    get ui3d() { return P.ui3d as ReturnType<typeof ui3d> | undefined },
    tick() {
      real.tick(P)
      for (const n of order) if (n !== 'loader' && n !== 'shipped' && !(n in drawers && n !== drawer)) P[n].tick?.(P)
    },
    ui() {
      P.ui3d.afterTick({ ...P, particle3d: drawers[drawer] })
    },
    step(dt: number) {
      engine.dt = dt
      if (drawer === 'gpuparticle3d') P.gpgpu3d?.afterTick(P)
      drawers[drawer].afterTick(P)
    },
    draw() {
      bomb.position.fromArray(toss.pos)
      bomb.quaternion.fromArray(toss.rot)
      P.render3d.afterTick()
    },
    fit() {
      const w = view.clientWidth, h = view.clientHeight
      if (!w || !h) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      P.render3d.renderer.setSize(w, h)
      P.render3d.composer?.setSize(w, h)
    },
  }
}
