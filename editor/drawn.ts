// Which row each drawing is, found without the renderers knowing. `drawn` wraps PixiJS's `addChild`
// and three.js's `add` once, before any game is opened, and tags whatever is put on a stage with a
// row, and everything under it is that row's too. The row is found one of two ways:
//   - The client imports every row's actor as `<kind>.client.ts?row=<id>&client=<c>`, so while an actor's code
//     runs, itself or through a plugin it calls, that id is in the call stack.
//   - A plugin that draws for rows, as sprite2d does, walks `wire.rows` in its own hooks and reads
//     each row before it draws it. `watch`, handed a client's plugins, hands out every row of
//     `wire.rows` as a plain object whose fields note what a hook reads of the row, so a plugin
//     that clones the rows clones plain rows, and wraps each plugin's hooks so that nothing read
//     outside a hook, or before it began, counts in it. A drawing a plugin adds
//     is tagged with the row the hook worked on last: one whose `data` it read, or two of whose
//     fields it read running, one straight after the other (a loop on that row reading its `kind`
//     and then its `id`). A search that passes a row reads only its `kind`, so it works on none of
//     the rows it passes and the order of the rows does not matter. A plugin's own row, one whose
//     kind the scene names in `plugins`, worked on after a row of the game's in the same hook does
//     not take the drawing: a plugin that reads its settings between a row and the model it draws
//     for that row tags the model with the row.
//
// What the tags answer, and nothing else: `owner` is the row a thing is drawn for, its own tag or the
// nearest tagged thing above it, and `tagOf` its own tag. Picking, boxing and the ground under a
// canvas point are asked of the stage, which the renderer's extension makes (`Editor.stage`), so the
// editor names no renderer.
import * as PIXI from 'pixi.js'
import * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'

export type Thing = PIXI.Container | THREE.Object3D

const tags = new WeakMap<Thing, number>()
const actor = /\.client\.ts\?(?:[^:\s]*&)?row=(\d+)/
// While a plugin's hook runs: the row it worked on last, whether that row is one of the game's, and
// the last field it read, of which row.
let running = false
let read: number | undefined
let games = false
let last: { id: number; key: string } | undefined

const begin = () => {
  running = true
  read = undefined
  games = false
  last = undefined
}
const end = () => {
  running = false
  read = undefined
  games = false
  last = undefined
}

function tag(things: Thing[]) {
  if (things.every(t => tags.has(t))) return
  const found = actor.exec(new Error().stack ?? '')?.[1]
  const id = found === undefined ? read : Number(found)
  if (id === undefined) return
  for (const t of things) if (!tags.has(t)) tags.set(t, id)
}

const hooks = ['tick', 'afterTick'] as const

export function watch(plugins: Plugins) {
  const wire = plugins.wire
  const own = new Set<string>(wire.scene?.plugins ?? [])
  const note = (row: { id: number; kind: string }, key: PropertyKey) => {
    if (!running || typeof key !== 'string') return
    const twice = last?.id === row.id && last.key !== key
    last = { id: row.id, key }
    if (key !== 'data' && !twice) return
    const plugin = own.has(row.kind)
    if (plugin && games) return
    read = row.id
    games = !plugin
  }
  // Each row as a plain object whose fields read and write the row's own, so a plugin that copies
  // the rows, by structuredClone, JSON or a spread, copies plain rows.
  const noted = (rows: typeof wire.rows) => rows.map(r => {
    const o = {} as typeof r
    for (const k of Object.keys(r) as (keyof typeof r)[])
      Object.defineProperty(o, k, { enumerable: true, configurable: true, get() { note(r, k); return r[k] }, set(v) { (r as Record<string, unknown>)[k] = v } })
    return o
  })
  let seen = noted(wire.rows)
  Object.defineProperty(wire, 'rows', { configurable: true, enumerable: true, get: () => seen, set: to => { seen = noted(to) } })
  for (const [name, p] of Object.entries(plugins)) {
    if (name === 'wire' || !p || typeof p !== 'object') continue
    for (const h of hooks) {
      const f = p[h]
      if (typeof f !== 'function') continue
      // A hook that returns a promise is done when it settles; one that does not, when it returns.
      p[h] = function (this: unknown, ...args: unknown[]) {
        begin()
        let out: unknown
        try {
          out = f.apply(this, args)
        } finally {
          if (!(out instanceof Promise)) end()
        }
        return out instanceof Promise ? out.finally(end) : out
      }
    }
  }
}

export function drawn() {
  const addChild = PIXI.Container.prototype.addChild
  const addChildAt = PIXI.Container.prototype.addChildAt
  const add = THREE.Object3D.prototype.add
  PIXI.Container.prototype.addChild = function (this: PIXI.Container, ...kids: PIXI.Container[]) {
    tag(kids)
    return addChild.apply(this, kids as never) as never
  } as typeof addChild
  PIXI.Container.prototype.addChildAt = function (this: PIXI.Container, kid: PIXI.Container, i: number) {
    tag([kid])
    return addChildAt.call(this, kid, i) as never
  } as typeof addChildAt
  THREE.Object3D.prototype.add = function (this: THREE.Object3D, ...kids: THREE.Object3D[]) {
    tag(kids)
    return add.apply(this, kids)
  }
  return () => {
    PIXI.Container.prototype.addChild = addChild
    PIXI.Container.prototype.addChildAt = addChildAt
    THREE.Object3D.prototype.add = add
  }
}

// The row a thing was tagged with when it was put on a stage, or undefined.
export const tagOf = (t: Thing): number | undefined => tags.get(t)

// The row a thing is drawn for: its own tag, or the nearest tagged thing above it.
export function owner(t: Thing | null): number | undefined {
  for (let at: Thing | null = t; at; at = at.parent as Thing | null) {
    const id = tags.get(at)
    if (id !== undefined) return id
  }
  return undefined
}
