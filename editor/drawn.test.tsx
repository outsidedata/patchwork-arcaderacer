// Drawings are tagged with the row whose actor put them on the stage, or the row a plugin's hook
// worked on last, and the tags answer which row a thing is drawn for.
import * as PIXI from 'pixi.js'
import * as THREE from 'three'
import { afterEach, expect, test } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import { drawn, owner, tagOf, watch } from './drawn.ts'

// Runs `f` as the actor of row `id` runs, from a module named `<kind>.client.ts?row=<id>`.
const asActor = (id: number, f: () => void) =>
  new Function('f', `f()\n//# sourceURL=http://localhost/games/fake/pad.client.ts?row=${id}`)(f)

let undo = () => {}
afterEach(() => undo())

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('what an actor puts on a stage is its row\'s, and so is everything under it; the rest is nobody\'s', () => {
  undo = drawn()
  const stage = new PIXI.Container()
  const kid = new PIXI.Container()
  const group = new PIXI.Container()
  asActor(3, () => stage.addChild(group))
  group.addChild(kid)
  const loose = new PIXI.Container()
  stage.addChild(loose)
  expect([tagOf(group), tagOf(kid), owner(kid), owner(loose)]).toEqual([3, undefined, 3, undefined])
  const scene = new THREE.Scene()
  const mesh = new THREE.Mesh()
  asActor(5, () => scene.add(mesh))
  const part = new THREE.Object3D()
  mesh.add(part)
  expect([tagOf(mesh), owner(part), owner(scene)]).toEqual([5, 5, undefined])
})

// A painter drawing a box per row, as sprite2d does, from a plugin's hook.
const box = () => new PIXI.Graphics().rect(0, 0, 10, 10).fill(0xffffff)
const client = (rows: { id: number; kind: string; data: Record<string, unknown> }[], hook: (p: Plugins, layer: PIXI.Container) => void) => {
  const layer = new PIXI.Container()
  const painter = { afterTick(p: Plugins) { hook(p, layer) } }
  const plugins = { painter, wire: { rows: [], scene: { plugins: ['painter', 'audio'] } } } as unknown as Plugins
  watch(plugins)
  plugins.wire.rows = rows
  plugins.painter.afterTick(plugins)
  return layer.children
}

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a hook\'s drawing is the row whose data it read last, and a search that passes rows takes none', () => {
  undo = drawn()
  const rows = [{ id: 8, kind: 'pad', data: {} }, { id: 9, kind: 'pad', data: {} }, { id: 10, kind: 'loader', data: {} }]
  const [a, b] = client(rows, (p, layer) => {
    for (const r of p.wire.rows) if (r.kind === 'pad') { void r.data; layer.addChild(box()) }
    // One drawing for row 8 after a search that runs past every row by its kind.
    void p.wire.rows.find(r => r.id === 8)!.data
    void p.wire.rows.find(r => r.kind === 'nothing')
    layer.addChild(box())
  })
  expect(tagOf(a)).toBe(8)
  expect(tagOf(b)).toBe(9)
  expect(tagOf(client(rows, (p, layer) => {
    void p.wire.rows.find(r => r.id === 8)!.data
    void p.wire.rows.find(r => r.kind === 'nothing')
    layer.addChild(box())
  })[0])).toBe(8)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('two fields of a row read make it the row worked on, one does not', () => {
  undo = drawn()
  const rows = [{ id: 4, kind: 'pad', data: {} }, { id: 5, kind: 'pad', data: {} }]
  const [one] = client(rows, (p, layer) => {
    for (const r of p.wire.rows) if (r.kind === 'pad' && r.id === 4) layer.addChild(box())
  })
  expect(tagOf(one)).toBe(4)
  const [none] = client(rows, (p, layer) => {
    for (const r of p.wire.rows) void r.kind
    layer.addChild(box())
  })
  expect(tagOf(none)).toBeUndefined()
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a plugin\'s own row read after the game\'s row does not take the drawing, before it does', () => {
  undo = drawn()
  const rows = [{ id: 2, kind: 'hero', data: {} }, { id: 3, kind: 'audio', data: {} }]
  const [model] = client(rows, (p, layer) => {
    const hero = p.wire.rows.find(r => r.kind === 'hero')!
    void hero.data
    void p.wire.rows.find(r => r.kind === 'audio')!.data
    layer.addChild(box())
  })
  expect(tagOf(model)).toBe(2)
  const [own] = client(rows, (p, layer) => {
    void p.wire.rows.find(r => r.kind === 'audio')!.data
    layer.addChild(box())
  })
  expect(tagOf(own)).toBe(3)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('nothing read outside a hook, or in the hook before, counts in the next', () => {
  undo = drawn()
  const layer = new PIXI.Container()
  let draw = false
  const painter = {
    tick(p: Plugins) { void p.wire.rows[0].data },
    afterTick() { if (draw) layer.addChild(box()) },
  }
  const plugins = { painter, wire: { rows: [], scene: { plugins: ['painter'] } } } as unknown as Plugins
  watch(plugins)
  plugins.wire.rows = [{ id: 1, kind: 'pad', data: {} }]
  plugins.painter.tick(plugins)
  void plugins.wire.rows[0].data
  draw = true
  plugins.painter.afterTick(plugins)
  void plugins.wire.rows[0].data
  layer.addChild(box())
  expect(layer.children.map(tagOf)).toEqual([undefined, undefined])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a watched row is a plain row to whatever copies it, by structuredClone, JSON or a spread, and writes reach the row', () => {
  undo = drawn()
  const rows = [{ id: 6, kind: 'pad', data: { at: [1, 2] } }]
  const [copied] = client(rows, (p, layer) => {
    expect(structuredClone(p.wire.rows)).toEqual(rows)
    expect(JSON.parse(JSON.stringify(p.wire.rows))).toEqual(rows)
    expect({ ...p.wire.rows[0] }).toEqual(rows[0])
    void p.wire.rows[0].data
    layer.addChild(box())
  })
  expect(tagOf(copied)).toBe(6)
  const plugins = { wire: { rows: [], scene: { plugins: [] } } } as unknown as Plugins
  watch(plugins)
  plugins.wire.rows = rows
  plugins.wire.rows[0].data = { at: [3, 4] }
  expect(rows[0].data).toEqual({ at: [3, 4] })
})
