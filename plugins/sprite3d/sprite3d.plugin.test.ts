// Rows drawn as sprites. The test writes its own scene: an imp-like kind whose walk has Doom's eight
// rotations and whose death has one, a rocket-like kind hung on its middle, and a fighter drawn
// facing right and mirrored for left, and a corpse-like kind whose entry of `world.sprite3d` gives its
// whole look, with a stand-in loader that hands over each sheet, decoded as
// the loader decodes one for three.js, once the test says it has landed, and a camera it moves the
// way the seat's actor would.
import { expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { uv } from '#plugins/loader/loader.plugin.ts'
import { frameOf, pick, read, type Sheet } from '#plugins/loader/loader.sim.ts'
import { sprite3d } from './sprite3d.plugin.ts'

// An Aseprite JSON-Array: frames each whole on its page, `[id, x, y, w, h, anchor, ms?]`, and tags.
type Cell = [string, number, number, number, number, [number, number], number?]
const aseprite = (image: string, cells: Cell[], frameTags: object[], more: object = {}) => ({
  frames: cells.map(([filename, x, y, w, h, [ax, ay], duration]) => ({
    filename, frame: { x, y, w, h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w, h }, sourceSize: { w, h },
    pivot: { x: ax / w, y: ay / h }, ...(duration !== undefined && { duration }),
  })),
  meta: { app: 'test', image, frameTags, ...more },
})
// `cols` × `rows` cells of `w` × `h` from a page's top left, numbered from `from`.
const grid = (from: number, cols: number, rows: number, w: number, h: number, anchor: [number, number], ms?: number): Cell[] =>
  Array.from({ length: cols * rows }, (_, i) => [String(from + i), (i % cols) * w, Math.floor(i / cols) * h, w, h, anchor, ms])

// The imp: two packs, its walk's eight rotations a tag each on the first and its death on the second.
const impPacks: Record<string, object> = {
  '/imp.json': aseprite('imp-walk.png', grid(0, 4, 8, 59, 61, [29.5, 61]), Array.from({ length: 8 }, (_, k) => ({ name: `walk@${k}`, from: 4 * k, to: 4 * k + 3 })), { related_multi_packs: ['imp/die.json'] }),
  '/imp/die.json': aseprite('../imp-die.png', grid(32, 5, 1, 59, 61, [29.5, 61]), [{ name: 'die', from: 0, to: 4 }]),
}
const imp = read(impPacks['/imp.json'], '/imp.json', { facing: { first: 0.75, step: -0.125 } }, u => impPacks[u])
const rocket = read(aseprite('rocket.png', [['fly', 0, 0, 49, 14, [24.5, 7]]], [{ name: 'fly', from: 0, to: 0 }]), '/rocket.json')
const fighter = read(aseprite('fighter.png', [['stand', 10, 0, 40, 64, [10, 64]]], [{ name: 'idle', from: 0, to: 0 }]), '/fighter.json', { facing: { first: 0, mirror: true } })

const table = {
  ppm: 32,
  alphaTest: 0.5,
  kinds: {
    imp: { turn: 8 },
    rocket: { turn: 2 * Math.PI },
    fighter: { turn: 2 * Math.PI },
    // A kind whose every row looks one way: its entry gives the look, its rows carry none.
    corpse: { turn: 8, sheet: 'imp', clip: 'die', facing: 0 },
  },
}

// A sheet as the loader hands one over for three.js.
const decode = (data: Sheet, sizes: [number, number][]) => {
  const pages = sizes.map(([width, height]) => new THREE.Texture({ width, height }))
  return {
    data,
    pages,
    uv: (id: string) => {
      const f = data.frames[id], { width, height } = pages[f.page].image
      return uv(f, width, height)
    },
    pick: (clip: string, turns: number) => pick(data, clip, turns),
    frameOf: (clip: string, run: number, i: number) => frameOf(data, clip, run, i),
  }
}

// Doom's eight directions, east first, turning left: index 6 is due south, +z.
const SOUTH = 6

const page = (order = ['loader', 'sprite3d', 'render3d']) => {
  const sheets: Record<string, any> = {
    imp: decode(imp, [[236, 488], [295, 61]]),
    rocket: decode(rocket, [[49, 14]]),
    fighter: decode(fighter, [[60, 64]]),
  }
  const landed = new Set<string>()
  const asked: string[] = []
  const camera = new THREE.PerspectiveCamera()
  const plugins: any = {
    wire: { scene: { plugins: order, prefabs: {}, world: { sprite3d: table } }, rows: [] as any[] },
    render3d: { THREE, scene: new THREE.Scene(), camera },
    loader: { get: (name: string) => (landed.has(name) ? sheets[name] : undefined), load: (name: string) => asked.push(name) },
  }
  const land = (...names: string[]) => names.forEach(n => landed.add(n))
  return { plugins, land, asked, sheets, camera, me: sprite3d() }
}

// The box of its page a plane shows, in pixels, read off its UVs: left, top, right, bottom.
const shown = (mesh: any) => {
  const uv = mesh.geometry.attributes.uv, { width, height } = mesh.material.map.image
  return [uv.getX(0) * width, (1 - uv.getY(0)) * height, uv.getX(1) * width, (1 - uv.getY(2)) * height].map(Math.round)
}
// The plane's corners in the world.
const box = (mesh: any) => {
  mesh.updateMatrixWorld()
  mesh.geometry.computeBoundingBox()
  return mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)
}

test('the run drawn is the one the camera sees: rotation 1 from in front, and the next for each eighth of a turn the camera stands further round to its left', () => {
  const { plugins, land, camera, me } = page()
  land('imp')
  const row = { id: 7, kind: 'imp', data: { sheet: 'imp', pos: [4, 0, -31], clip: 'walk', frame: 2, facing: SOUTH } }
  plugins.wire.rows = [row]
  camera.position.set(4, 1.28, -26)
  const runs: number[] = []
  for (let turn = 0; turn < 8; turn++) {
    row.data.facing = (SOUTH + turn) % 8
    me.afterTick(plugins)
    const mesh = plugins.render3d.scene.children[0]
    const [left, top] = shown(mesh)
    runs.push(top / 61)
    expect(left).toBe(2 * 59)
    // Its face points at the camera, which is due south of it.
    expect(mesh.rotation.y).toBe(0)
  }
  // The imp turning left shows the viewer its right side: the camera is that much further round to
  // its right, which is the rotations counted the other way.
  expect(runs).toEqual([0, 7, 6, 5, 4, 3, 2, 1])
})

test('the plane faces the camera the seat\'s actor moved this frame, not the last one', () => {
  const { plugins, land, camera, me } = page()
  land('imp')
  plugins.wire.rows = [{ id: 7, kind: 'imp', data: { sheet: 'imp', pos: [0, 0, 0], clip: 'walk', frame: 0, facing: 0 } }]
  camera.position.set(0, 1, 5)
  me.afterTick(plugins)
  // The actor moves the camera during the actors' ticks, before this plugin's afterTick.
  camera.position.set(5, 1, 0)
  me.afterTick(plugins)
  expect(plugins.render3d.scene.children[0].rotation.y).toBeCloseTo(Math.PI / 2, 12)
})

test('the frame is cut from its page, ppm pixels to the metre, its anchor on pos: a monster on its feet, a rocket on its middle', () => {
  const { plugins, land, sheets, camera, me } = page()
  land('imp', 'rocket')
  plugins.wire.rows = [
    { id: 7, kind: 'imp', data: { sheet: 'imp', pos: [1, 2, 3], clip: 'die', frame: 4, facing: 3 } },
    { id: 8, kind: 'rocket', data: { sheet: 'rocket', pos: [0, 1, -4], clip: 'fly', frame: 0, facing: 0 } },
  ]
  camera.position.set(1, 1, 10)
  me.afterTick(plugins)
  const [a, b] = plugins.render3d.scene.children
  expect(a.material.map).toBe(sheets.imp.pages[1])
  expect(shown(a)).toEqual([4 * 59, 0, 5 * 59, 61])
  const feet = box(a)
  expect(feet.min.y).toBeCloseTo(2, 12)
  expect(feet.max.y - feet.min.y).toBeCloseTo(61 / 32, 12)
  expect(b.material.map).toBe(sheets.rocket.pages[0])
  expect(box(b).getCenter(new THREE.Vector3()).y).toBeCloseTo(1, 12)
})

test('a run the sheet mirrors is its picture read right to left, still standing on its anchor', () => {
  const { plugins, land, camera, me } = page()
  land('fighter')
  const row = { id: 5, kind: 'fighter', data: { sheet: 'fighter', pos: [0, 0, 0], clip: 'idle', frame: 0, facing: 0 } }
  plugins.wire.rows = [row]
  // Heading +x, seen from its right: it faces right on the screen, as drawn.
  camera.position.set(0, 1, 10)
  me.afterTick(plugins)
  const mesh = plugins.render3d.scene.children[0]
  expect(shown(mesh)).toEqual([10, 0, 50, 64])
  // Heading −x, seen from its left: it faces left, the picture flipped.
  row.data.facing = Math.PI
  me.afterTick(plugins)
  expect(shown(mesh)).toEqual([50, 0, 10, 64])
})

test('a clip of one run on a sheet that mirrors nothing looks the same from every side', () => {
  const { plugins, land, camera, me } = page()
  land('imp')
  plugins.wire.rows = [{ id: 7, kind: 'imp', data: { sheet: 'imp', pos: [0, 0, 0], clip: 'die', frame: 1, facing: 0 } }]
  const seen = new Set<string>()
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4
    camera.position.set(5 * Math.cos(a), 1, 5 * Math.sin(a))
    me.afterTick(plugins)
    seen.add(shown(plugins.render3d.scene.children[0]).join())
  }
  expect([...seen]).toEqual([[59, 0, 118, 61].join()])
})

test('a sprite is hidden, its sheet asked for, until the sheet lands; a row that ends takes it away; close frees the rest', () => {
  const { plugins, land, asked, me } = page()
  const one = { id: 7, kind: 'imp', data: { sheet: 'imp', pos: [0, 0, 0], clip: 'walk', frame: 0, facing: 0 } }
  const other = { id: 9, kind: 'imp', data: { sheet: 'imp', pos: [2, 0, 0], clip: 'walk', frame: 0, facing: 0 } }
  plugins.wire.rows = [one, other, { id: 3, kind: 'wall', data: {} }]
  me.afterTick(plugins)
  expect(asked).toContain('imp')
  expect(plugins.render3d.scene.children.every((m: any) => !m.visible)).toBe(true)
  land('imp')
  me.afterTick(plugins)
  expect(plugins.render3d.scene.children.map((m: any) => m.visible)).toEqual([true, true])
  const gone = vi.spyOn(plugins.render3d.scene.children[0].geometry, 'dispose')
  plugins.wire.rows = [other]
  me.afterTick(plugins)
  expect(plugins.render3d.scene.children).toHaveLength(1)
  expect(gone).toHaveBeenCalledOnce()
  const rest = vi.spyOn(plugins.render3d.scene.children[0].geometry, 'dispose')
  const material = vi.spyOn(plugins.render3d.scene.children[0].material, 'dispose')
  me.close(plugins)
  expect(plugins.render3d.scene.children).toHaveLength(0)
  expect(rest).toHaveBeenCalledOnce()
  expect(material).toHaveBeenCalledOnce()
})

test('a row with no clip yet is hidden, and shows its clip once it has one', () => {
  const { plugins, land, me } = page()
  land('imp')
  const row = { id: 7, kind: 'imp', data: { sheet: 'imp', pos: [0, 0, 0], clip: null as string | null, frame: 0, facing: 0 } }
  plugins.wire.rows = [row]
  me.afterTick(plugins)
  expect(plugins.render3d.scene.children.map((m: any) => m.visible)).toEqual([false])
  row.data.clip = 'walk'
  me.afterTick(plugins)
  expect(plugins.render3d.scene.children.map((m: any) => m.visible)).toEqual([true])
})

test('a kind whose entry gives its look is drawn from the entry, and a row carrying a field its entry gives throws, naming both', () => {
  const { plugins, land, asked, sheets, camera, me } = page()
  plugins.wire.rows = [{ id: 4, kind: 'corpse', data: { pos: [0, 0, 0], frame: 4 } }]
  camera.position.set(0, 1, 10)
  me.afterTick(plugins)
  expect(asked).toEqual(['imp'])
  land('imp')
  me.afterTick(plugins)
  const mesh = plugins.render3d.scene.children[0]
  expect(mesh.visible).toBe(true)
  expect(mesh.material.map).toBe(sheets.imp.pages[1])
  expect(shown(mesh)).toEqual([4 * 59, 0, 5 * 59, 61])
  plugins.wire.rows = [{ id: 4, kind: 'corpse', data: { pos: [0, 0, 0], frame: 4, sheet: 'imp' } }]
  expect(() => me.afterTick(plugins)).toThrow('corpse 4 carries sheet, which world.sprite3d gives for every corpse')
  plugins.wire.rows = [{ id: 4, kind: 'corpse', data: { pos: [0, 0, 0], frame: 4, facing: 2 } }]
  expect(() => me.afterTick(plugins)).toThrow('corpse 4 carries facing, which world.sprite3d gives for every corpse')
})

test('a scene with no world.sprite3d throws', () => {
  const { plugins, me } = page()
  plugins.wire.scene = { plugins: ['loader', 'sprite3d', 'render3d'], prefabs: {}, world: {} }
  expect(() => me.afterTick(plugins)).toThrow('the scene names sprite3d but gives no world.sprite3d')
})

test('listed after render3d, it throws; a clip the sheet does not have throws', () => {
  const late = page(['loader', 'render3d', 'sprite3d'])
  expect(() => late.me.afterTick(late.plugins)).toThrow('sprite3d is listed after render3d, which would draw every sprite before it is turned')
  const { plugins, land, me } = page()
  land('imp')
  plugins.wire.rows = [{ id: 7, kind: 'imp', data: { sheet: 'imp', pos: [0, 0, 0], clip: 'fly', frame: 0, facing: 0 } }]
  expect(() => me.afterTick(plugins)).toThrow('the sheet has no clip fly')
})

test('a trimmed frame\'s plane spans the pixels its sheet kept, where they were in the whole frame, so it stands where it would untrimmed', () => {
  const { plugins, land, sheets, camera, me } = page()
  // A frame 32 pixels square with only 16 by 24 of it kept, from 8 across and 4 down; its pivot the
  // middle of its bottom edge.
  const trimmed = read({
    frames: [{ filename: 'lamp', frame: { x: 0, y: 0, w: 16, h: 24 }, rotated: false, trimmed: true, spriteSourceSize: { x: 8, y: 4, w: 16, h: 24 }, sourceSize: { w: 32, h: 32 }, pivot: { x: 0.5, y: 1 } }],
    meta: { image: 'lamp.png', frameTags: [{ name: 'lit', from: 0, to: 0, direction: 'forward' }] },
  }, '/lamp.json')
  sheets.lamp = decode(trimmed, [[16, 24]])
  land('lamp')
  plugins.wire.rows = [{ id: 9, kind: 'fighter', data: { sheet: 'lamp', pos: [0, 1, 0], clip: 'lit', frame: 0, facing: 0 } }]
  camera.position.set(0, 1, 10)
  me.afterTick(plugins)
  const mesh = plugins.render3d.scene.children[0]
  expect(shown(mesh)).toEqual([0, 0, 16, 24])
  const b = box(mesh)
  expect([b.min.x, b.max.x, b.min.y, b.max.y].map(v => +v.toFixed(12))).toEqual([-0.25, 0.25, 1 + 4 / 32, 1 + 28 / 32])
})
