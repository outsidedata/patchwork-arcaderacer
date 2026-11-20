// instances3d's mod for particle3d, named by the scene's `world.particle3d.mods.behaviors`: a layer that
// gives `mesh` is drawn as instanced meshes, one a particle. The test hands particle3d a page of its own
// whose instances3d hands back an Instances that writes down what it is handed.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { particle3d, type Effects } from '#plugins/particle3d/particle3d.plugin.ts'

const DT = 1 / 60
const look = { shape: { detail: 1, lumpy: [0.8, 0.35], squash: 0.75 }, colour: '#2f2a26', lods: [0], shadow: 0, leaf: 0 }
const world = { particle3d: { effects: 'effects', hold: 0.1, mods: { behaviors: ['instances3d'] } } }

const page = async (effects: Effects) => {
  await prepare({}, [], world)
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(0, 0, 10)
  const asked: any[] = [], frames: any[][] = []
  let disposed = 0
  const plugins: any = {
    wire: { scene: { plugins: ['loader', 'particle3d', 'instances3d', 'render3d'], world, prefabs: { engine: { dt: DT } } }, rows: [] },
    render3d: { THREE, scene: new THREE.Scene(), camera },
    loader: { on: (_: string, f: (it: Effects) => void) => f(effects), onWritten: () => {}, get: () => undefined, load: () => {} },
    instances3d: {
      instances(_: any, spec: any) {
        asked.push(spec)
        let now: any[] = []
        return {
          show() {}, clear() { now = [] }, add(list: any[]) { now.push(...list) }, frame() { frames.push(now) }, dispose() { disposed++ },
        }
      },
    },
  }
  const me = particle3d()
  return { plugins, me, asked, frames, disposed: () => disposed, frame: () => me.afterTick(plugins) }
}

test('a layer that gives mesh is drawn as one instance a particle, of a row it picks, where it is, turned by its spin and at its size; no quad is drawn for it', async () => {
  const p = await page({ cap: 50, effects: { rocks: [{ n: [6, 6], life: [1, 1], dir: [1, 0, 0], spread: 0, speed: [3, 3], spin: 4, size: [0.5, 0.5], grow: 2, mesh: { rows: ['a', 'b', 'c'], seed: 3, look } }] } })
  p.me.emit('rocks', [0, 2, 0])
  for (let f = 0; f < 31; f++) p.frame()
  expect(p.asked).toEqual([{ name: "particle3d's mesh of rocks", rows: ['a', 'b', 'c'], seed: 3, shells: [Infinity], look }])
  const last = p.frames.at(-1)!
  expect(last.length).toBe(6)
  // 30 steps along +x at 3 m/s, halfway through its life, so 1.5 of its size of 0.5 to 1
  for (const it of last) {
    expect(it.at[0]).toBeCloseTo(1.5, 6)
    expect(it.at[1]).toBeCloseTo(2, 6)
    expect(it.size).toBeCloseTo(0.75, 6)
    expect(['a', 'b', 'c']).toContain(it.row)
    expect(Math.hypot(...it.rot)).toBeCloseTo(1, 9)
  }
  expect(p.plugins.render3d.scene.children.filter((o: any) => o.isMesh).every((m: any) => m.geometry.drawRange.count === 0)).toBe(true)
  // the particles gone, it is handed none; close lets go of it
  for (let f = 0; f < 40; f++) p.frame()
  expect(p.frames.at(-1)).toEqual([])
  p.me.close(p.plugins)
  expect(p.disposed()).toBe(1)
})

test('a mesh of the wrong numbers throws, naming the layer; a word no plugin delivers throws, naming world.particle3d.mods.behaviors', async () => {
  const cases: [Effects, string][] = [
    [{ cap: 5, effects: { r: [{ life: [1, 1], mesh: { rows: [], look } }] } }, 'particle3d effect r layer 0 mesh rows [] are not a list of the look\'s rows'],
    [{ cap: 5, effects: { r: [{ life: [1, 1], mesh: { rows: ['a'], look: { ...look, lods: [] } } }] } }, 'particle3d effect r layer 0 mesh look lods [] are not a LOD for each of up to 1 shells'],
    [{ cap: 5, effects: { r: [{ life: [1, 1], mesh: { rows: ['a'], look, size: 2 } }] } }, 'particle3d effect r layer 0 mesh has size, and a mesh is { rows, look, seed? }'],
    [{ cap: 5, effects: { r: [{ life: [1, 1], blob: {} }] } } as any, 'particle3d effect r layer 0 has blob, which particle3d does not know, and no plugin world.particle3d.mods.behaviors names delivers it'],
  ]
  for (const [effects, message] of cases) {
    const p = await page(effects)
    expect(() => p.frame()).toThrow(message)
  }
})
