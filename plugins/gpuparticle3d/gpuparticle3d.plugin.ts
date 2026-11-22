// The browser half of gpuparticle3d: particle3d (`plugins/particle3d/particle3d.plugin.ts`) with every particle
// on the GPU. It plays the same effects files, every field meaning what particle3d's header says it means,
// spawned the same two ways (a rule's `emit` through `gpuparticle3d.sim.ts`, and this half's `emit`), followed,
// driven, carried, landed and lit the same. What differs is where a particle is: no particle is on the CPU.
// Its place, speed, age, life, size, turn and seed are texels of five float textures on the GPU, moved each
// frame by a pass, and drawn by a vertex shader that builds each quad where the particle is.
//
// The CPU keeps the ledger of effects, their clocks and bursts, and which slot each particle has. It rolls no
// particle but for its life and its skip, which it rolls as the GPU does (`hash.ts`), so it knows the frame
// each particle dies without reading anything back: the free slots, how many particles each effect has, and
// when a carried effect stops. Each frame it hands the GPU the numbers of every layer played (`pack.ts`), of
// every running effect, and of the particles thrown this frame, and runs:
//
//   step    every particle moved one step of the scene's `dt` (particle3d's `move`: its own forces and its
//           force generators' entries, its pace, its bounce off the solids and the floor, its swirl), its
//           slot freed the step it dies
//   carry   every effect's live point, line, speed and `to`: the CPU's for one it places, the particle's for
//           one a particle carries, as many times as effects are carried deep
//   spawn   one point a particle thrown, into its slot: particle3d's `burst` for one particle, rolled from its
//           seed, aged to its effect's age
//   keys    each slot's distance behind the camera; then a bitonic sort of them, so the draw lays the farthest
//           first. Once a frame drawn, not once a step: run when the first batch is drawn after a step, for the
//           camera it is drawn by, so a page that takes several steps a frame sorts once
//   look    each particle's quad worked out once for that camera: its place, axes, edges, frame, flips and
//           colour, run with the keys
//   draw    one mesh a batch (a page of a sheet, gpuparticle3d's own shapes, or flat squares), each instance a
//           sorted slot, its corner read off the look
//
// The slots are handed out the lowest free first, so the particles held sit low: the step, the keys, the sort
// and the look run over the slots up to the highest held alone, and each batch draws as many instances as
// particles are held, not as many as the cap.
//
// The passes draw through render3d's renderer, in this half's `afterTick`, so it is listed before render3d,
// which draws the scene in its own; listed after, it throws, as particle3d does.
//
// `world.gpuparticle3d`:
//   effects  the name in the scene's `loader` catalogue of the effects file, particle3d's file
//   hold     the seconds the server half keeps an entry on the ledger row (`gpuparticle3d.sim.ts`)
//   attach   particle3d's Attachments: a list, each `{ on, effect, of?, when? }`, the effect kept running on every
//            source of that word the `sources` mods hand back, checked and played as particle3d plays them
//   mods     sources    plugins whose `sources(plugins)` hand back, once a frame, the sources `attach` throws
//                       from, particle3d's `Source`s (box3dvehicle's wheels and tailpipes,
//                       `box3dvehicle.gpuparticle3d.ts`)
//            solids     one plugin, whose `solids(plugins)` hands back what a particle that bounces bounces
//                       off, as the GPU meets it: `{ glsl, uniforms }`, `glsl` defining `meet` (`glsl.ts`,
//                       MOVE), where a line first meets a solid, and `uniforms` what it reads, written by
//                       that plugin each frame, which is listed before gpuparticle3d (gpgpu3d's,
//                       `gpgpu3d.gpuparticle3d.ts`: the things it holds, shapes3d's shapes and terrain3d's
//                       land among them). Asked once, when the passes are made. With none named a
//                       particle bounces off its effect's floor alone.
//            behaviors  plugins whose `behaviors()` deliver words (`words.ts`)
//            light      one plugin, whose `light(plugins)` hands back, once a frame after it has drawn, the share
//                       of its own colour each channel of a particle is drawn in, `[r, g, b]`, as particle3d's
//                       does (its header, The sky's light; skydome3d's, `skydome3d.gpuparticle3d.ts`): every
//                       particle's colour is times it. Listed before gpuparticle3d. With none named, or none
//                       yet, a particle is drawn in its own colour.
//
// The file's `cap` is the most particles this page holds at once: a particle thrown with every slot taken is
// dropped, as particle3d drops it. It sizes the state textures, S × S texels, S the least power of two whose
// square holds `cap`.
//
// What it hands out is particle3d's: `emit(effect, at, spawn)` the effect, whose `at`, `dir`, `to`, `floor` and
// `life` may be written and its own `drivers` written into (`age` too, at the spawn, so a stream opens full);
// `has(effect)`; `drive(name, value)`; `drivers`; `effects`, the ledger; and `count`, the particles held now.
// An effect driven by drivers of its own plays from layers of its own (particle3d's Drivers), each a record of
// the table at a slot of its own: a layer's slot is kept while any effect running plays from it or has
// particles of it, so the offset each particle holds on the GPU stays its layer's, and is handed to another
// layer only after.
//
// `close` frees every target, texture, mesh and light it made.
//
// The effects file is particle3d's: every field the same, read and checked by the same rules, under
// gpuparticle3d's name. `check` throws for the first field of the file, of an effect's layer or of
// `world.gpuparticle3d` that gpuparticle3d does not read, and for every value particle3d's header says throws.
//
// Words. A layer's field that is none of particle3d's own is a word, and its particles are drawn by the Drawer
// a mod delivers for it (`world.gpuparticle3d.mods.behaviors`, each plugin it names exporting `behaviors()` →
// `{ <word>: Drawer }`), in place of quads. A word no plugin delivers throws as an unknown field does, naming
// `world.gpuparticle3d.mods.behaviors`. Every particle is on the GPU, so a Drawing is handed where they are
// there, not a list:
//
//   Drawer.check(data, what, world)        throws a sentence naming `what` for numbers it cannot draw by
//   Drawer.draw(data, { plugins, name })   a Drawing of those numbers, or undefined while what it draws loads
//   Drawing.frame(view)                    once a frame, after the particles have moved
//   Drawing.dispose()                      lets go of everything it made
//
// `view` is the particles as the shaders hold them (`glsl.ts`): `S`, the side of the state textures, and
// `slots`, how many of their texels are slots; `state`, the five textures A, B, C, D and R; `table`, `effects`
// and `live`, the textures the prelude reads; `particles`, each particle of the layers drawn by this word's
// numbers, its slot and its pick, a number from 0 to 1 rolled at its birth for the drawer to choose by (the
// CPU knows both from each burst and each death, so nothing is read back), the same list as the last frame's
// while none of them has been thrown or has died; and `prelude`, the GLSL that reads
// the textures, with `load(slot)`, `used(q)`, `alive(q)`, `place(q)` and `sized(q)`, so a Drawing's shader
// finds a particle in its slot, where it is, its turn and its size now. One Drawing is made for each word's
// numbers the first frame a layer of them bursts, and kept until `close`. A word's particles' tint and fade
// are the word's own to draw.
import type { Plugins } from '#engine/browser.ts'
import { ahead, mod, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Anchor, Attach, Channels, Driven, Effects, Emitter, Force, Lamp, Layer, Lit, Sources } from '#plugins/particle3d/particle3d.plugin.ts'
import { CELL, SHAPES, corners, strip } from './shapes.ts'
import { driven, plan, type Compiled, type Values } from './drivers.ts'
import { flight, type Entry, type Land, type Spawn } from './gpuparticle3d.sim.ts'
import { E, NONE, ROLL } from './layout.ts'
import { roll } from './hash.ts'
import { pack, type Framed, type In, type Visual } from './pack.ts'
import { CARRY, KEYS, LOOK, NOTHING, PRELUDE, QUAD, QUAD_AFTER, QUAD_MAIN, QUAD_PARS, SORT, SPAWN, SPAWN_VERTEX, STEP, TW } from './glsl.ts'

export type View = {
  S: number; slots: number
  state: { A: any; B: any; C: any; D: any; R: any }
  table: any; effects: any; live: any
  particles: { slot: number; pick: number }[]
  prelude: string
}
export type Drawing = { frame(view: View): void; dispose(): void }
export type Drawer = {
  check(data: any, what: string, world: Record<string, any>): void
  draw(data: any, made: { plugins: Plugins; name: string }): Drawing | undefined
}

// The fields of the file, particle3d's, in its header's order.
export const FIELDS = [
  'n', 'every', 'after', 'life', 'lasts', 'skip', 'start', 'blend', 'channels', 'erode', 'sheet', 'clip', 'play', 'shape', 'size', 'grow', 'grows', 'dir', 'spread', 'speed', 'outward', 'jitter', 'box',
  'g', 'drag', 'pull', 'swirl', 'axis', 'pace', 'bounce', 'follow', 'flips', 'tint', 'tint1', 'tints', 'gain', 'a0', 'a1', 'fade', 'alphas', 'spin', 'origin', 'add', 'stretch', 'face', 'beam', 'carry', 'inherit', 'forces',
] as const satisfies readonly (keyof Emitter)[]
export const CHANNELS = ['value', 'alpha', 'hot'] as const satisfies readonly (keyof Channels)[]
export const REF = ['effect', 'at'] as const
export const LAMP = ['at', 'tint', 'intensity', 'distance', 'decay', 'shadow', 'flicker', 'spot'] as const satisfies readonly (keyof Lamp)[]
export const FORCE = [
  'g', 'drag', 'pull', 'swirl', 'axis', 'at', 'direction', 'anchor', 'falloff', 'range', 'noiseFrequency', 'noiseAmplitude',
  'turbulence', 'noiseScroll', 'wind', 'dragBySpeed', 'shell', 'toAxis', 'overLife', 'overAge',
] as const satisfies readonly (keyof Force)[]
export const ANCHORS = ['particle', 'effect'] as const satisfies readonly Anchor[]
export const STOPS = ['grows', 'tints', 'alphas', 'erode'] as const satisfies readonly (keyof Emitter)[]
export const FILE = ['cap', 'alphaTest', 'ppm', 'files', 'forceGenerators', 'drivers', 'flipbooks', 'effects'] as const satisfies readonly (keyof Effects)[]
export const WORLD = ['effects', 'hold', 'attach', 'mods'] as const
export const ATTACH = ['on', 'effect', 'of', 'when'] as const satisfies readonly (keyof Attach)[]
export const NAMES = ['sheet', 'clip', 'shape', 'carry'] as const satisfies readonly (keyof Emitter)[]
export const SWITCHES = ['lasts', 'play', 'blend', 'follow', 'add', 'stretch', 'face', 'beam'] as const satisfies readonly (keyof Emitter)[]
const INSTEAD: Record<(typeof STOPS)[number], (keyof Emitter)[]> = { grows: ['grow'], tints: ['tint', 'tint1'], alphas: ['a0', 'a1', 'fade'], erode: [] }
// What a number driven is kept within, by its field: [least, most].
const LIMITS: Record<string, [number, number]> = {
  every: [0, Infinity], bounce: [0, 1], intensity: [0, Infinity], distance: [0, Infinity], decay: [0, Infinity], flicker: [0, 1],
  angle: [0, Math.PI / 2], penumbra: [0, 1],
  falloff: [0, Infinity], range: [0, Infinity], noiseFrequency: [0, Infinity], noiseAmplitude: [0, Infinity],
  dragBySpeed: [0, Infinity], shell: [0, Infinity],
}
const COUNTS: Record<string, number> = { dir: 3, axis: 3, jitter: 3, box: 6, at: 3, direction: 3, wind: 3, noiseScroll: 3 }

// The words a scene's mods deliver: each plugin `world.gpuparticle3d.mods.behaviors` names, laid over the last.
export const drawers = (world: Record<string, any>): Record<string, Drawer> =>
  Object.assign({}, ...modsOf<() => Record<string, Drawer>>(world, 'gpuparticle3d', 'behaviors').map(f => f()))
// The words of an emitter: its fields that are none of particle3d's own.
export const wordsOf = (l: Emitter) => Object.keys(l).filter(k => !(FIELDS as readonly string[]).includes(k))

export function check(file: Effects, own: Record<string, unknown>, words: Record<string, Drawer> = {}, world: Record<string, any> = {}) {
  for (const k of Object.keys(own)) if (!(WORLD as readonly string[]).includes(k)) throw new Error(`world.gpuparticle3d has ${k}, which gpuparticle3d does not know`)
  for (const k of Object.keys(file)) if (!(FILE as readonly string[]).includes(k)) throw new Error(`gpuparticle3d's effects file has ${k}, which gpuparticle3d does not know`)
  const names = plan(file.drivers).names
  if (own.attach !== undefined) {
    if (!Array.isArray(own.attach)) throw new Error(`world.gpuparticle3d.attach is ${JSON.stringify(own.attach)}, and it is a list, each { ${ATTACH.join(', ')} }`)
    if (!modsOf(world, 'gpuparticle3d', 'sources').length) throw new Error('world.gpuparticle3d has an attach, and its mods name no sources')
    own.attach.forEach((a: unknown, i: number) => {
      const at = `world.gpuparticle3d.attach ${i}`
      if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error(`${at} is ${JSON.stringify(a)}, and an attachment is { ${ATTACH.join(', ')} }`)
      for (const k of Object.keys(a)) if (!(ATTACH as readonly string[]).includes(k)) throw new Error(`${at} has ${k}, and an attachment is { ${ATTACH.join(', ')} }`)
      const { on, effect, of, when } = a as Record<string, unknown>
      if (typeof on !== 'string') throw new Error(`${at} has an on of ${JSON.stringify(on)}, and on is the word of the sources it is thrown from`)
      if (of !== undefined && typeof of !== 'string') throw new Error(`${at} has an of of ${JSON.stringify(of)}, and of is what the sources it is thrown from are of`)
      if (typeof effect !== 'string' || !(effect in file.effects)) throw new Error(`${at} throws ${JSON.stringify(effect)}, which the effects file has no effect of`)
      if (when !== undefined) {
        if (typeof when !== 'string') throw new Error(`${at} has a when of ${JSON.stringify(when)}, and when is an expression of the drivers`)
        driven(when, names, `${at}'s when`)
      }
    })
  }
  const numbers = (v: unknown, what: string) => {
    if (typeof v === 'string') driven(v, names, what)
    else if (Array.isArray(v)) v.forEach(e => numbers(e, what))
    else if (v && typeof v === 'object') for (const [k, e] of Object.entries(v)) numbers(e, `${what}'s ${k}`)
  }
  const stops = (v: unknown, what: string, of: string, most: number) => {
    const said = `${what} of ${JSON.stringify(v)}, and they are [[<${of}>, <value>], ...] in order`
    if (!Array.isArray(v) || !v.length || !v.every(e => Array.isArray(e) && e.length === 2 && e.every(n => typeof n === 'number' || typeof n === 'string'))) throw new Error(said)
    v.forEach(([a], i) => {
      if (typeof a !== 'number') return
      const before = v[i - 1]?.[0]
      if (a < 0 || a > most || (typeof before === 'number' && a < before)) throw new Error(said)
    })
  }
  const generators = file.forceGenerators ?? {}
  for (const [name, entries] of Object.entries(generators)) {
    if (!Array.isArray(entries)) throw new Error(`gpuparticle3d force generator ${name} is ${JSON.stringify(entries)}, and a force generator is a list of entries, each any of ${FORCE.join(', ')}`)
    entries.forEach((f, i) => {
      const at = `gpuparticle3d force generator ${name} entry ${i}`
      if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error(`${at} is ${JSON.stringify(f)}, and an entry is any of ${FORCE.join(', ')}`)
      for (const [k, v] of Object.entries(f)) {
        if (!(FORCE as readonly string[]).includes(k)) throw new Error(`${at} has ${k}, and an entry is any of ${FORCE.join(', ')}`)
        if (k === 'anchor') {
          if (!(ANCHORS as readonly unknown[]).includes(v)) throw new Error(`${at} has an anchor ${JSON.stringify(v)}, and an anchor is ${ANCHORS.join(' or ')}`)
          continue
        }
        if (k === 'toAxis') {
          if (typeof v !== 'boolean') throw new Error(`${at} has a toAxis of ${JSON.stringify(v)}, and toAxis is on or off`)
          continue
        }
        if (k === 'overLife') stops(v, `${at} has overLife`, 'part of a particle\'s life, 0 to 1', 1)
        if (k === 'overAge') stops(v, `${at} has overAge`, 'seconds of the effect\'s age', Infinity)
        if (k in COUNTS && (!Array.isArray(v) || v.length !== COUNTS[k])) throw new Error(`${at} has a ${k} of ${JSON.stringify(v)}, and gpuparticle3d reads ${COUNTS[k]} numbers`)
        if (k === 'axis' && (v as unknown[]).every(n => typeof n === 'number') && Math.hypot(...(v as number[])) === 0) throw new Error(`${at} has an axis of no length, and gpuparticle3d swirls about a line`)
        const [least] = LIMITS[k] ?? [-Infinity]
        if (typeof v === 'number' && v < least) throw new Error(`${at} has a ${k} of ${v}, and it is ${least} or more`)
        numbers(v, `${at}'s ${k}`)
      }
      if (f.falloff !== undefined && f.range === undefined) throw new Error(`${at} has a falloff and no range, and a force falls off over its range`)
      if (f.wind !== undefined && f.drag === undefined && f.dragBySpeed === undefined) throw new Error(`${at} has a wind and no drag, and a wind is the air its drag is in`)
    })
  }
  for (const [name, layers] of Object.entries(file.effects)) {
    layers.forEach((l, i) => {
      const at = `gpuparticle3d effect ${name} layer ${i}`
      if ('lamp' in l) return lamped(name, i, l, numbers)
      const known: readonly string[] = 'effect' in l ? REF : FIELDS
      if (!('effect' in l) && !l.life === !l.lasts) throw new Error(`${at} ${l.life ? 'has a life and lasts' : 'has no life and does not last'}, and it has one or the other`)
      for (const [k, v] of Object.entries(l)) {
        if (!known.includes(k)) {
          if ('effect' in l || !words[k]) throw new Error(`${at} has ${k}, which gpuparticle3d does not know${'effect' in l ? '' : ', and no plugin world.gpuparticle3d.mods.behaviors names delivers it'}`)
          words[k].check(v, `${at} ${k}`, world)
          continue
        }
        if (k in COUNTS && (!Array.isArray(v) || v.length !== COUNTS[k])) throw new Error(`${at} has a ${k} of ${JSON.stringify(v)}, and gpuparticle3d reads ${COUNTS[k]} numbers`)
        if (k === 'axis' && (v as unknown[]).every(n => typeof n === 'number') && Math.hypot(...(v as number[])) === 0) throw new Error(`${at} has an axis of no length, and gpuparticle3d swirls about a line`)
        if (k === 'shape' && !(SHAPES as readonly unknown[]).includes(v)) throw new Error(`${at} has a shape ${JSON.stringify(v)}, and gpuparticle3d draws ${SHAPES.join(', ')}`)
        if (k === 'shape' && 'sheet' in l) throw new Error(`${at} has a shape and a sheet, and it is drawn as one or the other`)
        if (k === 'bounce' && typeof v !== 'string' && !(typeof v === 'number' && v >= 0 && v <= 1)) throw new Error(`${at} has a bounce of ${JSON.stringify(v)}, and a bounce is from 0 to 1`)
        if (k === 'carry' && !(typeof v === 'string' && v in file.effects)) throw new Error(`${at} carries ${JSON.stringify(v)}, which there is none of`)
        if ((SWITCHES as readonly string[]).includes(k) && typeof v === 'string') throw new Error(`${at} has a ${k} of ${JSON.stringify(v)}, and ${k} is on or off, which no driver drives`)
        if (k === 'forces') {
          if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${at} has forces of ${JSON.stringify(v)}, and its forces are { <force generator>: strength }`)
          for (const g of Object.keys(v)) if (!(g in generators)) throw new Error(`${at} is in the force generator ${g}, which there is none of${Object.keys(generators).length ? `: the file's are ${Object.keys(generators).join(', ')}` : ''}`)
          const one = (s: unknown) => typeof s === 'number' || typeof s === 'string'
          for (const [g, s] of Object.entries(v)) if (!one(s) && !(Array.isArray(s) && s.length === 2 && s.every(one))) throw new Error(`${at} is in the force generator ${g} by ${JSON.stringify(s)}, and its strength is a number, or [min, max]`)
        }
        if ((k === 'start' || k === 'blend' || k === 'channels') && !('sheet' in l)) throw new Error(`${at} has ${k} and no sheet, and ${k} is how a sheet's frames are drawn`)
        if (k === 'blend' && 'play' in l) throw new Error(`${at} has blend and play, and blend lays its frames into each other evenly over its life`)
        if (k === 'channels') {
          const c = v as Record<string, unknown>
          if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error(`${at} has channels of ${JSON.stringify(v)}, and its channels are { ${CHANNELS.join(', ')} }`)
          for (const w of CHANNELS) {
            const ws = c[w]
            if (!Array.isArray(ws) || ws.length !== 4 || !ws.every(n => typeof n === 'number')) throw new Error(`${at} has channels whose ${w} is ${JSON.stringify(ws)}, and it is four weights, red, green, blue and alpha`)
          }
          for (const w of Object.keys(c)) if (!(CHANNELS as readonly string[]).includes(w)) throw new Error(`${at} has channels with ${w}, and its channels are { ${CHANNELS.join(', ')} }`)
          continue
        }
        if ((STOPS as readonly string[]).includes(k)) {
          stops(v, `${at} has ${k}`, 'part of its life, 0 to 1', 1)
          for (const o of INSTEAD[k as (typeof STOPS)[number]]) if (o in l) throw new Error(`${at} has ${k} and ${o}, and ${k} are written in place of ${o}`)
        }
        if (k === 'effect' || (NAMES as readonly string[]).includes(k)) continue
        numbers(v, `${at}'s ${k}`)
      }
    })
  }
  carrying(file.effects)
}

// Throws for an effect that comes back to itself by carrying.
function carrying(effects: Record<string, Layer[]>) {
  const next = (name: string) =>
    (effects[name] ?? []).flatMap(l => ('lamp' in l ? [] : 'effect' in l ? [{ to: l.effect, carried: false }] : l.carry ? [{ to: l.carry, carried: true }] : []))
  const walk = (name: string, path: string[], carried: boolean[]) => {
    for (const { to, carried: c } of next(name)) {
      const at = path.indexOf(to)
      if (at >= 0) {
        if ([...carried.slice(at), c].some(Boolean)) throw new Error(`gpuparticle3d effect ${to} carries itself: ${[...path.slice(at), to].join(' > ')}`)
        continue
      }
      walk(to, [...path, to], [...carried, c])
    }
  }
  for (const name of Object.keys(effects)) walk(name, [name], [])
}

// Throws for a lamp layer that is anything but `{ lamp }`, for a field of its lamp gpuparticle3d does not read,
// and for a lamp missing a number it needs or holding one it cannot light by.
function lamped(name: string, i: number, l: Driven<Lit>, numbers: (v: unknown, what: string) => void) {
  const at = `gpuparticle3d effect ${name} layer ${i}`
  for (const k of Object.keys(l)) if (k !== 'lamp') throw new Error(`${at} is a lamp and has ${k}, and a lamp layer is { lamp } alone`)
  const lamp = l.lamp
  if (!lamp || typeof lamp !== 'object') throw new Error(`${at} has a lamp of ${JSON.stringify(lamp)}, and gpuparticle3d reads { intensity, distance, decay, ... }`)
  for (const k of Object.keys(lamp)) if (!(LAMP as readonly string[]).includes(k)) throw new Error(`${at} has a lamp with ${k}, which gpuparticle3d does not know`)
  const said = (v: unknown) => typeof v === 'string'
  for (const k of ['intensity', 'distance', 'decay'] as const) if (!said(lamp[k]) && !(typeof lamp[k] === 'number' && lamp[k] >= 0)) throw new Error(`${at} has a lamp whose ${k} is ${lamp[k]}, and it is a number of 0 or more`)
  if (lamp.at !== undefined && !(Array.isArray(lamp.at) && lamp.at.length === 3)) throw new Error(`${at} has a lamp at ${JSON.stringify(lamp.at)}, and gpuparticle3d reads 3 numbers`)
  if (lamp.flicker !== undefined && !said(lamp.flicker) && !(lamp.flicker >= 0 && lamp.flicker <= 1)) throw new Error(`${at} has a lamp whose flicker is ${lamp.flicker}, and it is from 0 to 1`)
  if (said(lamp.shadow)) throw new Error(`${at} has a lamp whose shadow is ${JSON.stringify(lamp.shadow)}, and shadow is on or off, which no driver drives`)
  const s = lamp.spot
  if (s !== undefined && !(s && typeof s === 'object' && (said(s.angle) || (s.angle > 0 && s.angle <= Math.PI / 2)) && (said(s.penumbra) || (s.penumbra >= 0 && s.penumbra <= 1)) && Object.keys(s).length === 2))
    throw new Error(`${at} has a lamp whose spot is ${JSON.stringify(s)}, and gpuparticle3d reads { angle, penumbra }, an angle above 0 and no more than π/2 and a penumbra from 0 to 1`)
  numbers(lamp, `${at}'s lamp`)
}

// Every layer an effect stands for, its `{ effect }` layers opened out, in order, each thrown from its `at`
// off the point: an emitter's box moved by it, or a box of that one point for one with none; a lamp's `at`
// moved by it.
function flatten(effects: Record<string, Layer[]>, name: string, path: string[] = []): (Driven<Emitter> | Driven<Lit>)[] {
  if (path.includes(name)) throw new Error(`gpuparticle3d effect ${name} is made of itself: ${[...path, name].join(' > ')}`)
  const layers = effects[name]
  if (!layers) throw new Error(path.length ? `gpuparticle3d effect ${path[path.length - 1]} names ${name}, which there is none of` : `gpuparticle3d has no effect ${name}`)
  const plus = (a: number | string, b: number | string) => (typeof a === 'number' && typeof b === 'number' ? a + b : `(${a}) + (${b})`)
  return layers.flatMap(l => {
    if (!('effect' in l)) return [l]
    const inner = flatten(effects, l.effect, [...path, name])
    if (!l.at) return inner
    const [x, y, z] = l.at
    return inner.map(e => {
      if ('lamp' in e) {
        const [ax, ay, az] = e.lamp.at ?? [0, 0, 0]
        return { lamp: { ...e.lamp, at: [plus(ax, x), plus(ay, y), plus(az, z)] } }
      }
      const [x0, y0, z0, x1, y1, z1] = e.box ?? [0, 0, 0, 0, 0, 0]
      return { ...e, box: [plus(x0, x), plus(y0, y), plus(z0, z), plus(x1, x), plus(y1, y), plus(z1, z)] }
    })
  })
}
// An effect's layers opened out, its emitters and its lamps apart, as the file writes them.
function split(effects: Record<string, Layer[]>, name: string): { layers: Driven<Emitter>[]; lamps: Driven<Lamp>[] } {
  const all = flatten(effects, name)
  return { layers: all.filter((l): l is Driven<Emitter> => !('lamp' in l)), lamps: all.filter((l): l is Driven<Lit> => 'lamp' in l).map(l => l.lamp) }
}

// What the `solids` mod hands back: the GLSL the step is made with, which defines `meet` (`glsl.ts`,
// MOVE), and the uniforms it reads, whose values are the mod's plugin's to write.
export type Solids = (plugins: Plugins) => { glsl: string; uniforms: Record<string, { value: any }> }
// What a `light` mod hands back each frame: how much light each channel of a particle's colour takes, a
// share of its own, or undefined while there is none yet (particle3d's header, The sky's light).
export type SkyLight = (plugins: Plugins) => number[] | undefined

// What `emit` hands back. `at`, `dir`, `to`, `floor` and `life` may be written, and its `drivers` written
// into; `age` is read.
export type Effect = { readonly name: string; at: number[]; dir?: number[]; to?: number[]; floor?: number; life: number; readonly drivers: Record<string, number>; readonly age: number }

type Live = Effect & {
  age: number; tint?: number; scale: number
  from?: number; fly?: number; land?: Land[]; landed: boolean
  layers?: Emitter[]; bursts: number[]; lamps?: Lamp[]
  last: number[] // per layer, the seconds into the effect its last burst was thrown at
  held: boolean[] // per layer, whether it is a stream held at an `every` of 0
  play?: Play // what its layers are played from now: the page's, or its drivers' own
  uses: Set<Play> // every play its layers have been played from, which its particles may still be of
  parts: number; server?: number
  row: number // its row of the effects table
  root?: Live // the effect thrown that the chain of carrying began from
  carrier?: { slot: number; death: number; live: boolean } // the particle carrying it
  vel: number[]; was?: number[]
  lasting: Set<number> // the slots of its particles that last until its life is over
  holds: number // the carried effects running whose chain of carrying began from it
  depth: number // how deep it is carried: 0 for one thrown, 1 for one a particle of that carries, and on
}
// One particle thrown this frame: its slot, its burst and its seed.
type Birth = { slot: number; burst: number; seed: number }
// How a layer's picture is drawn beyond its colour and opacity (particle3d's How): its `channels`, whether it
// lays one frame into the next, whether it erodes; layers drawn alike share a batch, and `key` says which.
type How = { key: string; channels?: Channels; blend: boolean; erode: boolean }
// One batch: the particles drawn from one page of one sheet, from gpuparticle3d's own shapes, or as flat
// squares, one way, by one mesh.
type Batch = { id: number; sheet?: string; page: number; how: How; mesh?: any }
// One number of a played layer, lamp or force generator's entry that the file writes as an expression.
type Bind = { on: any; key: string | number; run: Compiled; what: string; text: string; least: number; most: number; axis?: number[] }
// The file played at one set of drivers' values (particle3d's Play): the page's, or one effect's own `drivers`
// (with every effect it carries) over the page's.
type Play = {
  values: Values; binds: Bind[]
  played: Map<string, { layers: Emitter[]; lamps: Lamp[] }>
  generators: Map<string, Force[]>
  streams: WeakSet<Emitter>
}

const OWN = '#shapes'
const unit = (a: number[]) => {
  const l = Math.hypot(a[0], a[1], a[2])
  return [a[0] / l, a[1] / l, a[2] / l]
}
const lerp = (r: number[] | undefined, u: number, fallback: number) => (r ? r[0] + (r[1] - r[0]) * u : fallback)

// A min-heap of slots by a number: the times slots are freed at, and the free slots, the lowest first.
class Deaths {
  private t: number[] = []
  private s: number[] = []
  get size() { return this.t.length }
  push(time: number, slot: number) {
    const t = this.t, s = this.s
    let i = t.length
    t.push(time)
    s.push(slot)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (t[p] <= t[i]) break
      ;[t[p], t[i]] = [t[i], t[p]]
      ;[s[p], s[i]] = [s[i], s[p]]
      i = p
    }
  }
  peek() { return this.t[0] }
  pop(): number {
    const t = this.t, s = this.s, slot = s[0]
    const lt = t.pop()!, ls = s.pop()!
    if (t.length) {
      t[0] = lt
      s[0] = ls
      let i = 0
      for (;;) {
        const a = 2 * i + 1, b = a + 1
        let m = i
        if (a < t.length && t[a] < t[m]) m = a
        if (b < t.length && t[b] < t[m]) m = b
        if (m === i) break
        ;[t[m], t[i]] = [t[i], t[m]]
        ;[s[m], s[i]] = [s[i], s[m]]
        i = m
      }
    }
    return slot
  }
  clear() { this.t.length = 0; this.s.length = 0 }
}

export function gpuparticle3d() {
  let ledger: Live[] = []
  let fresh = new Set<Live>()
  const seen = new Set<number>()
  const served = new Map<number, Live>() // each effect the server's ledger threw, by its entry's id
  let file: Effects | undefined
  let unchecked = true
  let asked = false
  let stale = false
  let checked = false
  // The light every particle's colour is times this frame, one uniform every mesh's material reads: white
  // while no `light` mod is named or it has nothing yet (particle3d's, The sky's light).
  const lit = { value: [1, 1, 1] }
  const lamps = new Map<Live, any[]>()

  // The file as it is played (particle3d's own way): drivers' plan, the page's time, the drivers held, the
  // page's play and each effect's own drivers' play, each with its Binds, every effect's layers and lamps and
  // every generator's entries, copied once a play.
  let solver: ReturnType<typeof plan> | undefined
  let time = 0
  // the time the effects' births are written from, moved up every EPOCH seconds so the GPU's float holds
  // them to well under a step
  let epoch = 0
  const EPOCH = 600
  const held: Values = {}
  const blank = (): Play => ({ values: { time: 0 }, binds: [], played: new Map(), generators: new Map(), streams: new WeakSet() })
  let page = blank()
  let plays = new Map<Record<string, number>, Play>()
  let ins = new WeakMap<Emitter, In[]>()
  let dirty = true // a number the table holds may have changed

  // The slots: those free, and when each held one is freed, by the time this half has run.
  let cap = 0
  let S = 0
  // the free slots, the lowest first, so the slots held stay low and the passes over them stop at the highest
  const free = new Deaths()
  const deaths = new Deaths()
  let steps = 0 // the steps run
  let ordered = -1 // the step the keys were last sorted after
  let top = 0 // one more than the highest slot held this step
  let sortN = 2 // the slots the keys are sorted over: the least power of two no less than top
  let wordsAt = 0 // counts each change to which particles words draw
  const owner = new Map<number, Live>() // the effect each held slot's particle is of
  const carried = new Map<number, Live>() // the effect each held slot's particle carries
  const worded = new Map<Emitter, Map<number, number>>() // a layer drawn by words: its particles' slots and picks
  const wordOf = new Map<number, Emitter>() // the layer drawn by words each held slot's particle is of
  let births: Birth[] = []
  let bursts: number[] = [] // four numbers a burst: effect row, layer offset, its time, seconds since
  let seeds = 1

  // The effects table's rows.
  let rows = 0
  let freeRows: number[] = []
  let depth = 0 // how deep effects are carried now

  let words_: Record<string, Drawer> = {}
  const drawings = new Map<string, { drawing?: Drawing; layers: Set<Emitter>; particles: View['particles']; at: number }>()

  // A driven number written: whether it changed.
  const write = (b: Bind, values: Values) => {
    const v = b.run(values)
    const changed = b.on[b.key] !== v
    if (!(Number.isFinite(v) && v >= b.least && v <= b.most))
      throw new Error(`${b.what} is ${JSON.stringify(b.text)}, which is ${v} now, and it is a ${b.least === -Infinity ? 'finite number' : b.most === Infinity ? `number of ${b.least} or more` : `number from ${b.least} to ${b.most}`}`)
    b.on[b.key] = v
    if (b.axis && Math.hypot(...b.axis) === 0) throw new Error(`${b.what} is ${JSON.stringify(b.text)}, which leaves an axis of no length now, and gpuparticle3d swirls about a line`)
    return changed
  }
  const live = (play: Play, raw: Record<string, unknown>, what: string, kept: readonly string[] = []): any => {
    const names = solver!.names
    const copy = (v: unknown, on: any, key: string | number, what: string, field: string, axis?: number[]) => {
      if (typeof v === 'string') {
        const [least, most] = LIMITS[field] ?? [-Infinity, Infinity]
        const b: Bind = { on, key, run: driven(v, names, what), what, text: v, least, most, axis }
        play.binds.push(b)
        write(b, play.values)
      } else if (Array.isArray(v)) {
        const list: any[] = (on[key] = v.map(() => NaN))
        v.forEach((e, i) => copy(e, list, i, what, field, field === 'axis' ? list : undefined))
      } else if (v && typeof v === 'object') {
        const o: any = (on[key] = {})
        for (const [k, e] of Object.entries(v)) copy(e, o, k, `${what}'s ${k}`, field === 'forces' ? '' : k)
      } else on[key] = v
    }
    const out: any = {}
    for (const [k, v] of Object.entries(raw)) {
      if (kept.includes(k)) out[k] = v
      else copy(v, out, k, `${what}'s ${k}`, k)
    }
    return out
  }
  const generator = (play: Play, name: string): Force[] => {
    let g = play.generators.get(name)
    if (!g) play.generators.set(name, (g = (file!.forceGenerators?.[name] ?? []).map((f, i) => live(play, f, `gpuparticle3d force generator ${name} entry ${i}`, ['anchor']) as Force)))
    return g
  }
  const playing = (play: Play, name: string) => {
    let p = play.played.get(name)
    if (p) return p
    const raw = split(file!.effects, name)
    const layers = raw.layers.map(l => {
      const e: Emitter = live(play, l, `gpuparticle3d effect ${name}`, [...NAMES, 'channels', ...Object.keys(l).filter(k => !(FIELDS as readonly string[]).includes(k))])
      // each entry of each generator it is in, at a strength (a range rolled once a generator)
      ins.set(e, Object.keys(e.forces ?? {}).flatMap((g, i) => {
        const s = e.forces![g]
        const [least, most] = typeof s === 'number' ? [s, s] : s
        return generator(play, g).map(force => ({ force, least, most, roll: i }))
      }))
      if (typeof l.every === 'string') play.streams.add(e)
      return e
    })
    const lamps = raw.lamps.map(l => live(play, l, `gpuparticle3d effect ${name}'s lamp`) as Lamp)
    play.played.set(name, (p = { layers, lamps }))
    dirty = true
    return p
  }
  // The page's drivers this frame, its own over the ledger row's over the file's.
  let over: Values = {}
  // The play an effect plays from now: its drivers' own when it has any, else the page's.
  const playOf = (fx: Live): Play => {
    if (!Object.keys(fx.drivers).length) return page
    let p = plays.get(fx.drivers)
    if (!p) {
      plays.set(fx.drivers, (p = blank()))
      p.values = solver!.run({ ...over, ...fx.drivers }, time)
    }
    return p
  }
  const reread = () => {
    solver = plan(file!.drivers, 'gpuparticle3d\'s effects file')
    page = blank()
    plays = new Map()
    ins = new WeakMap()
    dirty = true
    whens = new Map()
  }

  // Attachments (particle3d's header): each source's effect of each attachment, by the attachment's place in
  // the list and the source's key, and each attachment's `when` read, by its text.
  const attached = new Map<string, Live>()
  let whens = new Map<string, Compiled>()
  const attach = (plugins: Plugins, list: Attach[]) => {
    const { world } = plugins.wire.scene
    const sources = modsOf<Sources>(world!, 'gpuparticle3d', 'sources').flatMap(f => f(plugins))
    const kept = new Set<string>()
    list.forEach((a, i) => {
      for (const s of sources) {
        if (s.on !== a.on || (a.of !== undefined && s.of !== a.of)) continue
        for (const [n, v] of Object.entries(s.drivers)) {
          if (!solver!.names.includes(n)) throw new Error(unknown(n, `gpuparticle3d's ${s.on} source ${s.key}`))
          if (!Number.isFinite(v)) throw new Error(`gpuparticle3d's ${s.on} source ${s.key} has its driver ${n} at ${v}, and a driver is a finite number`)
        }
        if (a.when !== undefined) {
          let run = whens.get(a.when)
          if (!run) whens.set(a.when, (run = driven(a.when, solver!.names, `world.gpuparticle3d.attach ${i}'s when`)))
          if (run(solver!.run({ ...over, ...s.drivers }, time)) === 0) continue
        }
        const key = `${i}:${s.key}`
        kept.add(key)
        let fx = attached.get(key)
        if (!fx) attached.set(key, (fx = spawn(a.effect, s.at, { dir: s.dir, floor: s.floor, life: Infinity, drivers: s.drivers })))
        fx.at = [...s.at]
        fx.dir = s.dir && [...s.dir]
        fx.floor = s.floor
        for (const n of Object.keys(fx.drivers)) if (!(n in s.drivers)) delete fx.drivers[n]
        Object.assign(fx.drivers, s.drivers)
      }
    })
    for (const [key, fx] of attached) {
      if (kept.has(key)) continue
      fx.life = fx.age
      attached.delete(key)
    }
  }
  const unknown = (n: string, by: string) =>
    `${by} is driven by ${n}, which its effects file has no driver of${solver!.names.length ? `: its drivers are ${solver!.names.join(', ')}` : ''}`
  // Every driver's value this frame, the page's and each effect's own, as particle3d solves them; a play no
  // effect running plays from or has particles of is let go, and the table packed again only when a driven
  // number of it is not what it was.
  const solve = (plugins: Plugins) => {
    const row = plugins.wire.rows.find(r => r.kind === 'gpuparticle3d')
    over = { ...(row?.data.drivers ?? {}), ...held }
    for (const n of Object.keys(over)) if (!solver!.names.includes(n)) throw new Error(unknown(n, 'gpuparticle3d'))
    page.values = solver!.run(over, time)
    for (const b of page.binds) if (write(b, page.values)) dirty = true
    const driving = new Map<Record<string, number>, Live>()
    for (const fx of ledger) if (Object.keys(fx.drivers).length && !driving.has(fx.drivers)) driving.set(fx.drivers, fx)
    for (const [drivers, fx] of driving)
      for (const [n, v] of Object.entries(drivers)) {
        if (!solver!.names.includes(n)) throw new Error(unknown(n, `gpuparticle3d effect ${fx.name}`))
        if (!Number.isFinite(v)) throw new Error(`gpuparticle3d effect ${fx.name} has its driver ${n} at ${v}, and a driver is a finite number`)
      }
    const kept = new Set(ledger.flatMap(fx => [...fx.uses]))
    for (const [drivers, p] of plays) if (!kept.has(p) && !driving.has(drivers)) {
      plays.delete(drivers)
      dirty = true
    }
    for (const [drivers, p] of plays) {
      p.values = solver!.run({ ...over, ...drivers }, time)
      for (const b of p.binds) if (write(b, p.values)) dirty = true
    }
  }

  // A row of the effects table, its texture grown when every row is taken.
  const takeRow = () => {
    if (!freeRows.length) {
      const was = rows
      rows = Math.max(256, rows * 2)
      for (let r = rows - 1; r >= was; r--) freeRows.push(r)
    }
    return freeRows.pop()!
  }

  const spawn = (name: string, at: number[], s: Spawn, drivers?: Record<string, number>): Live => {
    const fx: Live = {
      name, at: [...at], dir: s.dir ? [...s.dir] : undefined, to: s.to ? [...s.to] : undefined, life: s.life ?? 0, drivers: drivers ?? { ...s.drivers }, age: 0,
      tint: s.tint, scale: s.scale ?? 1, floor: s.floor, bursts: [], last: [], held: [], uses: new Set(), parts: 0,
      from: s.from, fly: s.fly, land: s.land && structuredClone(s.land), landed: false, vel: [0, 0, 0], row: takeRow(), lasting: new Set(), holds: 0, depth: 0,
    }
    if (fx.from !== undefined) fx.life = Infinity
    if (fx.fly !== undefined) fx.life = flight(name, fx.at, fx.to, fx.fly)
    ledger.push(fx)
    fresh.add(fx)
    return fx
  }
  const end = (fx: Live) => {
    fx.from = undefined
    fx.life = fx.age
    if (!fx.layers) gone(fx)
  }
  const gone = (fx: Live) => {
    ledger.splice(ledger.indexOf(fx), 1)
    if (fx.server !== undefined && served.get(fx.server) === fx) served.delete(fx.server)
    freeRows.push(fx.row)
  }
  // Where an effect's point is: its `at`, or for one that flies, carried toward its `to`.
  const point = (fx: Live): number[] => {
    if (fx.fly === undefined) return fx.at
    const k = fx.life > 0 ? Math.min(1, fx.age / fx.life) : 1
    return [0, 1, 2].map(i => (fx.at[i] ?? 0) + ((fx.to![i] ?? 0) - (fx.at[i] ?? 0)) * k)
  }
  const land = (fx: Live) => {
    if (!fx.land || fx.landed || fx.age < fx.life - 1e-9) return
    fx.landed = true
    const at = fx.to ?? point(fx)
    for (const { effect, ...s } of fx.land) fresh.delete(spawn(effect, at, { ...s, drivers: s.drivers ?? fx.drivers }))
  }

  // A slot freed: its particle's effect has one fewer, and an effect it carried stops.
  const release = (slot: number) => {
    const fx = owner.get(slot)
    if (!fx) return
    owner.delete(slot)
    fx.parts--
    const l = wordOf.get(slot)
    if (l) {
      wordOf.delete(slot)
      worded.get(l)?.delete(slot)
      wordsAt++
    }
    fx.lasting.delete(slot)
    const c = carried.get(slot)
    if (c) {
      carried.delete(slot)
      c.life = c.age + dtNow
      c.carrier!.live = false
    }
    free.push(slot, slot)
  }
  let dtNow = 0

  // One burst of a layer, thrown at `t` seconds into the effect: its particles' slots and seeds, each life and
  // skip rolled as the GPU rolls them, so the CPU knows when each dies.
  const burst = (fx: Live, l: Emitter, layer: number, t: number, dt: number) => {
    const n = Math.round(lerp(l.n, Math.random(), 1))
    if (!n) return
    if (l.spread !== undefined && !l.dir && !fx.dir && !fx.carrier) throw new Error(`a gpuparticle3d layer of ${fx.name} has a spread and no dir, and neither has its spawn`)
    if (l.beam && !fx.to && !fx.carrier) throw new Error(`gpuparticle3d effect ${fx.name} has a beam and was spawned with no to`)
    const b = bursts.length / 4
    const ahead = fx.age - t
    bursts.push(fx.row, layer, t, ahead)
    for (let i = 0; i < n; i++) {
      const seed = seeds
      seeds = (seeds + 1) % 16777216 || 1
      if (!free.size) continue
      const life = lerp(l.life, roll(seed, ROLL.life), 0)
      const skip = (l.skip ?? 0) * roll(seed, ROLL.skip)
      // its age once aged to the effect's: as many steps as the GPU takes, the last cut short
      let age = skip
      for (let left = ahead; left > 1e-9; left -= dt) {
        if (!l.lasts && age >= life - 1e-9) break
        age += Math.min(dt, left)
      }
      if (l.lasts ? fx.age >= fx.life - 1e-9 : age >= life - 1e-9) continue
      const slot = free.pop()
      births.push({ slot, burst: b, seed })
      owner.set(slot, fx)
      fx.parts++
      if (l.lasts) fx.lasting.add(slot)
      else deaths.push(time + (life - age), slot)
      if (wordsOf(l).length) {
        let of = worded.get(l)
        if (!of) worded.set(l, (of = new Map()))
        of.set(slot, roll(seed, ROLL.pick))
        wordOf.set(slot, l)
        wordsAt++
      }
      if (!l.carry) continue
      // driven by the drivers of the effect that throws it, the one object
      const c = spawn(l.carry, point(fx), { tint: fx.tint, scale: fx.scale, floor: fx.floor, life: Infinity }, fx.drivers)
      fresh.delete(c)
      c.age = age - skip
      c.root = fx.root ?? fx
      c.root.holds++
      c.depth = fx.depth + 1
      c.carrier = { slot, death: l.lasts ? Infinity : time + (life - age), live: true }
      carried.set(slot, c)
    }
  }

  // particle3d's pacing: a layer's next burst, its first at its `after` (or when a stream held before it is let
  // go, whichever is later), then `every` on from its last at the `every` of now; a stream held, a layer whose
  // `every` is driven, at 0 now, which throws nothing while it is held and bursts at once the frame it is let go.
  const next = (fx: Live, l: Emitter, i: number) => (fx.bursts[i] === 0 ? Math.max(l.after ?? 0, fx.last[i]) : fx.last[i] + (l.every ?? 0))
  const paused = (fx: Live, l: Emitter) => !l.every && fx.play!.streams.has(l)
  const fire = (fx: Live, dt: number, offsets: Map<Emitter, number>) => {
    const due: [number, number][] = []
    fx.layers!.forEach((l, i) => {
      if (paused(fx, l)) {
        fx.held[i] = true
        return
      }
      // let go this frame: its next burst is now
      if (fx.held[i]) {
        fx.held[i] = false
        fx.last[i] = fx.bursts[i] > 0 ? fx.age - l.every! : fx.age
      }
      for (;;) {
        const t = next(fx, l, i)
        if (fx.bursts[i] > 0 && !l.every) break
        if (fx.bursts[i] > 0 && t >= fx.life) break
        if (t > fx.age + 1e-9) break
        due.push([t, i])
        fx.bursts[i]++
        fx.last[i] = t
      }
    })
    due.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    for (const [t, i] of due) {
      const l = fx.layers![i]
      if (wordsOf(l).length) word(l)
      burst(fx, l, offsets.get(l)!, t, dt)
    }
  }
  // An effect's layers read again from the play it plays from now: the effects file written again, or its
  // drivers' play another than the one it played from.
  const relayer = (fx: Live) => {
    const play = playOf(fx)
    const { layers: next, lamps } = playing(play, fx.name)
    fx.bursts = next.map((_, i) => fx.bursts[i] ?? 0)
    fx.last = next.map((_, i) => fx.last[i] ?? 0)
    fx.held = next.map((_, i) => fx.held[i] ?? false)
    fx.layers = next
    fx.lamps = lamps
    fx.play = play
    fx.uses.add(play)
  }
  const more = (fx: Live) => fx.layers!.some((l, i) =>
    paused(fx, l) ? fx.age < fx.life - 1e-9 : fx.bursts[i] === 0 || (!!l.every && next(fx, l, i) < fx.life))

  // The word drawings: one for each word's numbers, made the first time a layer of them bursts.
  const word = (l: Emitter) => {
    for (const w of wordsOf(l)) {
      const key = `${w} ${JSON.stringify((l as any)[w])}`
      let d = drawings.get(key)
      if (!d) drawings.set(key, (d = { layers: new Set(), particles: [], at: -1 }))
      if (!d.layers.has(l)) {
        d.layers.add(l)
        wordsAt++
      }
    }
  }

  // ------------------------------------------------------------ the GPU side
  let gpu: {
    three: any; renderer: any
    state: any[]; ping: number
    keys: any[]
    look: any
    live: any[]; liveRows: number
    quad: any; scene: any; camera: any
    passes: { step: any; spawn: any; carry: any; keys: any; sort: any; look: any; clear: any }
    points: any; pointScene: any; room: number
    tableTex?: any; effectsTex?: any; burstsTex?: any
    effects: Float32Array; sent: Float32Array // the effects table, and as it was last uploaded
  } | undefined
  let packed: ReturnType<typeof pack> | undefined
  // Every played layer's slot in the table, and each slot's layer, undefined for a free one. A layer keeps its
  // slot while it is played, so its particles' offsets stay its own.
  const slotOf = new Map<Emitter, number>()
  const slotted: (Emitter | undefined)[] = []
  // A layer read again from the file written again takes the slot of the layer it stands for, so the
  // particles of that one follow its numbers, as particle3d's do.
  const inherit = (was: Emitter, now: Emitter) => {
    const s = slotOf.get(was)
    if (s === undefined || slotOf.has(now)) return
    slotOf.delete(was)
    slotOf.set(now, s)
    slotted[s] = now
  }
  const batches = new Map<string, Batch>()
  let own: any

  const floatTarget = (three: any, w: number, h: number, count = 1) =>
    new three.WebGLRenderTarget(w, h, { count, type: three.FloatType, format: three.RGBAFormat, depthBuffer: false, minFilter: three.NearestFilter, magFilter: three.NearestFilter, generateMipmaps: false })
  // A float texture of `data`, TW texels wide, made again when it no longer holds it.
  const dataTexture = (three: any, had: any, data: Float32Array) => {
    const texels = Math.max(1, Math.ceil(data.length / 4))
    const h = Math.ceil(texels / TW)
    if (!had || had.image.height < h) {
      had?.dispose()
      had = new three.DataTexture(new Float32Array(TW * Math.max(h, had ? had.image.height * 2 : 1) * 4), TW, Math.max(h, had ? had.image.height * 2 : 1), three.RGBAFormat, three.FloatType)
      had.minFilter = had.magFilter = three.NearestFilter
    }
    had.image.data.fill(0)
    had.image.data.set(data)
    had.needsUpdate = true
    return had
  }

  const setupGpu = (plugins: Plugins) => {
    const { THREE: three, renderer } = plugins.render3d
    if (!renderer) return undefined
    if (gpu && cap === file!.cap) return gpu
    disposeGpu(plugins)
    cap = file!.cap
    S = 1
    while (S * S < cap) S *= 2
    free.clear()
    for (let s = 0; s < cap; s++) free.push(s, s)
    deaths.clear()
    top = 0
    wordsAt++
    owner.clear()
    carried.clear()
    worded.clear()
    wordOf.clear()
    for (const fx of ledger) { fx.parts = 0; fx.lasting.clear() }
    const raw = (fragmentShader: string, uniforms: Record<string, any>, vertexShader = QUAD) =>
      new three.RawShaderMaterial({ glslVersion: three.GLSL3, vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false, blending: three.NoBlending })
    // what a particle bounces off: the `solids` mod's GLSL and the uniforms it reads, each the mod's own
    // object in every pass, so the pass reads it as its plugin last wrote it
    const solid = mod<Solids>(plugins.wire.scene.world!, 'gpuparticle3d', 'solids')?.(plugins)
    const meet = solid?.glsl ?? NOTHING
    const common = () => ({
      ...solid?.uniforms,
      tableTex: { value: null }, effectsTex: { value: null }, liveTex: { value: null },
      sA: { value: null }, sB: { value: null }, sC: { value: null }, sD: { value: null }, sR: { value: null },
      S: { value: S }, dt: { value: 0 }, now: { value: 0 },
    })
    const quad = new three.Mesh(new three.PlaneGeometry(2, 2))
    quad.frustumCulled = false
    const scene = new three.Scene()
    scene.add(quad)
    const points = new three.Points(new three.BufferGeometry())
    points.frustumCulled = false
    const pointScene = new three.Scene()
    pointScene.add(points)
    const clearFrag = `${PRELUDE}
layout(location = 0) out vec4 oA; layout(location = 1) out vec4 oB; layout(location = 2) out vec4 oC; layout(location = 3) out vec4 oD; layout(location = 4) out vec4 oR;
void main() { oA = vec4(0.0); oB = vec4(0.0); oC = vec4(0.0); oD = vec4(0.0, 0.0, 0.0, -1.0); oR = vec4(0.0); }`
    gpu = {
      three, renderer,
      state: [floatTarget(three, S, S, 5), floatTarget(three, S, S, 5)], ping: 0,
      keys: [floatTarget(three, S, S), floatTarget(three, S, S)],
      look: floatTarget(three, S, S, 6),
      live: [], liveRows: 0,
      quad, scene, camera: new three.OrthographicCamera(-1, 1, 1, -1, 0, 1),
      passes: {
        step: raw(STEP(meet), common()),
        spawn: raw(SPAWN(meet), { ...common(), burstsTex: { value: null } }, SPAWN_VERTEX),
        carry: raw(CARRY, common()),
        keys: raw(KEYS, { ...common(), eye: { value: new three.Vector3() }, back: { value: new three.Vector3() }, top: { value: 0 } }),
        sort: raw(SORT, { keys: { value: null }, S: { value: S }, stage: { value: 0 }, span: { value: 0 } }),
        look: raw(LOOK, { ...common(), camR: { value: new three.Vector3() }, camU: { value: new three.Vector3() }, camB: { value: new three.Vector3() } }),
        clear: raw(clearFrag, common()),
      },
      points, pointScene, room: 0,
      effects: new Float32Array(0), sent: new Float32Array(0),
    }
    for (const t of gpu.state) run(gpu.passes.clear, t)
    dirty = true
    return gpu
  }
  const run = (material: any, target: any) => {
    const g = gpu!
    g.quad.material = material
    g.renderer.setRenderTarget(target)
    g.renderer.render(g.scene, g.camera)
  }
  const bindCommon = (m: any, state: any) => {
    const g = gpu!, u = m.uniforms
    u.tableTex.value = g.tableTex
    u.effectsTex.value = g.effectsTex
    u.liveTex.value = g.live[0]?.texture
    u.sA.value = state.textures[0]
    u.sB.value = state.textures[1]
    u.sC.value = state.textures[2]
    u.sD.value = state.textures[3]
    u.sR.value = state.textures[4]
    u.S.value = S
    u.dt.value = dtNow
    u.now.value = time - epoch
  }
  const disposeGpu = (plugins: Plugins) => {
    if (!gpu) return
    for (const t of [...gpu.state, ...gpu.keys, gpu.look, ...gpu.live]) t.dispose()
    for (const m of Object.values(gpu.passes)) m.dispose()
    gpu.quad.geometry.dispose()
    gpu.points.geometry.dispose()
    gpu.tableTex?.dispose()
    gpu.effectsTex?.dispose()
    gpu.burstsTex?.dispose()
    for (const b of batches.values()) if (b.mesh) {
      plugins.render3d.scene.remove(b.mesh)
      b.mesh.geometry.dispose()
      b.mesh.material.dispose()
    }
    batches.clear()
    gpu = undefined
  }

  // particle3d's own shapes as one texture.
  const shapes = (three: any) => {
    if (own) return own
    own = new three.DataTexture(strip(), CELL * SHAPES.length, CELL, three.RGBAFormat)
    own.colorSpace = three.SRGBColorSpace
    own.magFilter = three.LinearFilter
    own.minFilter = three.LinearMipmapLinearFilter
    own.generateMipmaps = true
    own.needsUpdate = true
    return own
  }
  const howOf = (l: Emitter): How =>
    ({ key: JSON.stringify([l.channels ?? null, !!l.blend, !!l.erode]), channels: l.channels, blend: !!l.blend, erode: !!l.erode })
  const batchOf = (sheet: string | undefined, page: number, how: How) => {
    const key = `${sheet ?? ''}|${page}|${how.key}`
    let b = batches.get(key)
    if (!b) batches.set(key, (b = { id: batches.size, sheet, page, how }))
    return b
  }
  // How a layer is drawn, off the loader's sheet when it has one.
  const visual = (plugins: Plugins) => (l: Emitter): Visual => {
    const plain: Visual = { word: false, frames: [], play: false, loop: false, timed: false, durations: [], ppm: 1, ready: true }
    if (wordsOf(l).length) return { ...plain, word: true, ready: false }
    const how = howOf(l)
    if (l.shape) return { ...plain, frames: [{ batch: batchOf(OWN, 0, how).id, uv: corners(l.shape) }] }
    if (!l.sheet) return { ...plain, frames: [{ batch: batchOf(undefined, 0, how).id, uv: [0, 1, 1, 1, 0, 0, 1, 0] }] }
    const sheet = plugins.loader.get(l.sheet)
    if (!sheet) {
      plugins.loader.load(l.sheet)
      return { ...plain, ready: false }
    }
    const clip = sheet.data.clips[l.clip!]
    const run = clip?.runs[0]
    if (!run) throw new Error(`gpuparticle3d draws clip ${l.clip} of ${l.sheet}, which it does not have`)
    if (!file!.ppm) throw new Error('gpuparticle3d draws an effect from a sheet, and its effects file gives no ppm')
    const frames: Framed[] = run.map((_: string, i: number) => {
      const f = sheet.frameOf(l.clip, 0, i)
      return { batch: batchOf(l.sheet, f.page, how).id, uv: sheet.uv(f.id), sheet: { size: f.size, anchor: f.anchor, trim: f.trim } }
    })
    const timed = !(run.length === 1 && !clip.durations)
    if (l.play && timed && !clip.durations) throw new Error(`clip ${l.clip} is not timed: its frames have no duration`)
    return { ...plain, frames, play: !!l.play, loop: !!clip.loop, timed, durations: l.play && timed ? clip.durations : [], ppm: file!.ppm }
  }

  // A batch's mesh: each instance a sorted slot, its quad built in the vertex shader.
  const meshOf = (plugins: Plugins, b: Batch) => {
    const g = gpu!, three = g.three
    const map = b.sheet === OWN ? shapes(three) : b.sheet ? plugins.loader.get(b.sheet)?.pages[b.page] ?? null : null
    if (b.mesh && b.mesh.material.map === map && b.mesh.material.alphaTest === (file!.alphaTest ?? 0) && b.mesh.userData.S === S) return b.mesh
    if (b.mesh) {
      plugins.render3d.scene.remove(b.mesh)
      b.mesh.geometry.dispose()
      b.mesh.material.dispose()
    }
    const geometry = new three.InstancedBufferGeometry()
    geometry.setAttribute('position', new three.BufferAttribute(new Float32Array(12), 3))
    geometry.setAttribute('uv', new three.BufferAttribute(new Float32Array(8), 2))
    geometry.setAttribute('color', new three.BufferAttribute(new Float32Array(16), 4))
    geometry.setAttribute('corner', new three.BufferAttribute(new Float32Array([0, 1, 2, 3]), 1))
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    // as many instances as particles can be drawn, set each frame by `order`
    geometry.instanceCount = 0
    const m = new three.MeshBasicMaterial({
      map, vertexColors: true, transparent: true, depthWrite: false, alphaTest: file!.alphaTest ?? 0,
      premultipliedAlpha: true, blending: three.CustomBlending, blendSrc: three.OneFactor, blendDst: three.OneMinusSrcAlphaFactor,
    })
    const uniforms = {
      skyLit: lit,
      tableTex: { value: null }, S: { value: S }, sorted: { value: null }, batch: { value: b.id },
      look0: { value: null }, look1: { value: null }, look2: { value: null }, look3: { value: null }, look4: { value: null }, look5: { value: null },
    }
    // particle3d's read of a picture drawn another way (its `material`): with `blend`, the next frame laid in
    // as far as the particle is between them; with `channels`, the picture's channels, back in the numbers the
    // bake wrote, weighed into its brightness, its opacity and how white-hot it is; with `erode`, its opacity
    // cut below the particle's cut and stretched back to whole.
    const how = b.how, c = how.channels
    const vec = (w: number[]) => `vec4(${w.map(n => n.toFixed(6)).join(', ')})`
    const read = [
      'vec4 t = texture2D(map, vMapUv);',
      how.blend ? 't = mix(t, texture2D(map, vFrame2), vLook.x);' : '',
      c ? 't = vec4(sRGBTransferOETF(vec4(t.rgb, 1.0)).rgb, t.a);' : '',
      c ? `float cover = dot(t, ${vec(c.alpha)});` : 'float cover = t.a;',
      how.erode ? 'cover = clamp((cover - vLook.y) / max(1.0 - vLook.y, 1e-3), 0.0, 1.0);' : '',
      c
        ? `float hot = clamp(dot(t, ${vec(c.hot)}), 0.0, 1.0); float top = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b);` +
          ` diffuseColor.rgb = mix(diffuseColor.rgb * dot(t, ${vec(c.value)}), vec3(top), hot);`
        : 'diffuseColor.rgb *= t.rgb;',
      'diffuseColor.a *= cover;',
    ].join('\n')
    m.onBeforeCompile = (shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, any> }) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${QUAD_PARS}`)
        .replace('#include <begin_vertex>', QUAD_MAIN)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${QUAD_AFTER}`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 skyLit;\nvarying float vKeep;\nvarying vec2 vFrame2;\nvarying vec2 vLook;')
        .replace('#include <map_fragment>', `#ifdef USE_MAP\n${read}\n#endif`)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= skyLit;')
        .replace('#include <premultiplied_alpha_fragment>', '#include <premultiplied_alpha_fragment>\ngl_FragColor.a *= vKeep;')
    }
    m.customProgramCacheKey = () => `gpuparticle3d ${S} ${how.key}`
    const mesh = new three.Mesh(geometry, m)
    mesh.frustumCulled = false
    mesh.userData.gpuparticle3d = uniforms
    mesh.userData.S = S
    mesh.onBeforeRender = (_renderer: unknown, _scene: unknown, camera: unknown) => order(mesh, camera)
    plugins.render3d.scene.add(mesh)
    b.mesh = mesh
    return mesh
  }

  // Every running effect's numbers, its row of the effects table.
  const effectsTable = () => {
    const g = gpu!
    if (g.effects.length < rows * E.size) g.effects = new Float32Array(rows * E.size)
    const t = g.effects
    for (const fx of ledger) {
      const o = fx.row * E.size
      const at = point(fx)
      for (let i = 0; i < 3; i++) {
        t[o + E.point + i] = at[i] ?? 0
        t[o + E.dir + i] = fx.dir?.[i] ?? 0
        t[o + E.to + i] = fx.to?.[i] ?? 0
        t[o + E.vel + i] = fx.vel[i] ?? 0
      }
      t[o + E.scale] = fx.scale
      t[o + E.hasDir] = fx.dir ? 1 : 0
      t[o + E.hasTo] = fx.to ? 1 : 0
      t[o + E.born] = time - epoch - fx.age
      t[o + E.root] = fx.root ? fx.root.row : NONE
      t[o + E.floor] = fx.floor ?? 0
      t[o + E.hasFloor] = fx.floor === undefined ? 0 : 1
      t[o + E.life] = fx.life
      t[o + E.carrier] = fx.carrier ? fx.carrier.slot : NONE
      t[o + E.carrierLive] = fx.carrier?.live ? 1 : 0
      t[o + E.hasTint] = fx.tint === undefined ? 0 : 1
      const c = fx.tint ?? 0xffffff
      t[o + E.tint] = ((c >> 16) & 255) / 255
      t[o + E.tint + 1] = ((c >> 8) & 255) / 255
      t[o + E.tint + 2] = (c & 255) / 255
    }
    return t
  }
  // How deep effects are carried now: 0 for none, 1 for an effect a particle carries, 2 for one a particle of
  // that carries, and on.
  const deepest = () => {
    let most = 0
    for (const fx of ledger) if (fx.carrier?.live) most = Math.max(most, fx.depth)
    return most
  }

  const frameGpu = (plugins: Plugins) => {
    const g = gpu!, three = g.three, renderer = g.renderer
    const was = renderer.getRenderTarget(), autoClear = renderer.autoClear
    renderer.autoClear = false

    // the effects uploaded only when a row is not what was last uploaded: a row holds still while its effect
    // does, its age worked out on the GPU from its birth
    if (time - epoch > EPOCH) epoch = time
    const table = effectsTable()
    if (!g.effectsTex || g.sent.length !== table.length || table.some((v, i) => v !== g.sent[i])) {
      g.effectsTex = dataTexture(three, g.effectsTex, table)
      g.sent = table.slice()
    }

    // the live texture, grown with the table's rows
    const liveRows = Math.max(1, Math.ceil((rows * 4) / TW))
    if (g.liveRows < liveRows) {
      for (const t of g.live) t.dispose()
      g.live = [floatTarget(three, TW, liveRows), floatTarget(three, TW, liveRows)]
      g.liveRows = liveRows
    }

    const [prev, cur] = [g.state[g.ping], g.state[1 - g.ping]]
    const setCommon = bindCommon
    // every slot from top up is free on the CPU, so the step runs over the rows up to it alone, and the keys
    // count no slot past it (a texel there may still hold a particle the step stopped moving: no pass reads it,
    // and the spawn writes the slot whole when it is taken again)
    top = 0
    for (const s of owner.keys()) if (s >= top) top = s + 1
    sortN = 2
    while (sortN < top) sortN *= 2
    // step: prev → cur
    setCommon(g.passes.step, prev)
    cur.viewport.set(0, 0, S, Math.max(1, Math.ceil(top / S)))
    run(g.passes.step, cur)
    cur.viewport.set(0, 0, S, S)
    g.ping = 1 - g.ping
    // carry: live, as deep as effects are carried, each run reading the last
    depth = deepest()
    for (let i = 0; i <= depth; i++) {
      setCommon(g.passes.carry, cur)
      g.passes.carry.uniforms.liveTex.value = g.live[0].texture
      run(g.passes.carry, g.live[1])
      g.live.reverse()
    }
    // spawn: points into cur, first every particle whose effect does not ride one thrown this frame; then the
    // carry pass again, so an effect a particle thrown this frame carries is where that particle is; then those
    // that ride, as deep as carrying goes
    const byRow = new Map(ledger.map(f => [f.row, f]))
    const thrown = new Set(births.map(b => b.slot))
    // whether a particle's effect is carried by a particle thrown this frame and not yet in its slot
    const rides = (b: Birth, born: Set<number>) => {
      const fx = byRow.get(bursts[b.burst * 4])
      const c = fx?.carrier
      return !!c && carried.get(c.slot) === fx && thrown.has(c.slot) && !born.has(c.slot)
    }
    const spawnPass = (list: Birth[], from: any, into: any, set: (m: any, state: any) => void) => {
      const n = list.length
      if (n > g.room) {
        g.points.geometry.dispose()
        g.room = Math.max(1024, n * 2)
        const made = new three.BufferGeometry()
        made.setAttribute('position', new three.BufferAttribute(new Float32Array(g.room * 3), 3))
        for (const k of ['slot', 'burst', 'seed']) made.setAttribute(k, new three.BufferAttribute(new Float32Array(g.room), 1))
        g.points.geometry = made
      }
      const geometry = g.points.geometry
      const slot = geometry.getAttribute('slot'), burst = geometry.getAttribute('burst'), seed = geometry.getAttribute('seed')
      list.forEach((b, i) => { slot.array[i] = b.slot; burst.array[i] = b.burst; seed.array[i] = b.seed })
      slot.needsUpdate = burst.needsUpdate = seed.needsUpdate = true
      geometry.setDrawRange(0, n)
      set(g.passes.spawn, from)
      g.passes.spawn.uniforms.liveTex.value = g.live[0].texture
      g.passes.spawn.uniforms.burstsTex.value = g.burstsTex
      g.points.material = g.passes.spawn
      renderer.setRenderTarget(into)
      renderer.render(g.pointScene, g.camera)
    }
    // the bursts uploaded only on a step that throws particles
    if (births.length) g.burstsTex = dataTexture(three, g.burstsTex, Float32Array.from(bursts))
    const born = new Set<number>()
    let waiting = births
    while (waiting.length) {
      const now = waiting.filter(b => !rides(b, born))
      const later = waiting.filter(b => rides(b, born))
      if (!now.length) throw new Error('gpuparticle3d has particles to throw whose carriers are never thrown')
      spawnPass(now, prev, cur, setCommon)
      for (const b of now) born.add(b.slot)
      if (later.length) {
        setCommon(g.passes.carry, cur)
        g.passes.carry.uniforms.liveTex.value = g.live[0].texture
        run(g.passes.carry, g.live[1])
        g.live.reverse()
      }
      waiting = later
    }
    renderer.setRenderTarget(was)
    renderer.autoClear = autoClear
    steps++

    // the batches' meshes, each handed what it reads when it is drawn (`order`)
    for (const b of batches.values()) meshOf(plugins, b)
    // the words, each handed where its layers' particles are; the list made again only when a particle of
    // them was thrown or died
    for (const [key, d] of drawings) {
      const w = key.slice(0, key.indexOf(' '))
      const any = [...d.layers][0]
      // a word none of whose layers is played any more, before it was ever drawn
      if (!d.drawing && !any) continue
      if (!d.drawing) d.drawing = words_[w].draw((any as any)[w], { plugins, name: `gpuparticle3d's ${w}` })
      if (d.at !== wordsAt) {
        d.particles = [...d.layers].flatMap(l => [...(worded.get(l) ?? [])].map(([slot, pick]) => ({ slot, pick })))
        d.at = wordsAt
      }
      d.drawing?.frame({
        S, slots: cap,
        state: { A: cur.textures[0], B: cur.textures[1], C: cur.textures[2], D: cur.textures[3], R: cur.textures[4] },
        table: g.tableTex, effects: g.effectsTex, live: g.live[0].texture,
        particles: d.particles,
        prelude: PRELUDE,
      })
    }
  }

  // A batch's mesh about to be drawn by `camera`: when a step has run since they last were, the keys sorted
  // and every particle's quad worked out for that camera (the look pass), by passes drawn inside the scene's
  // draw as three's own mirrors draw theirs; and the mesh handed them, with as many instances as are held.
  const order = (mesh: any, camera: any) => {
    const g = gpu!, renderer = g.renderer
    const e = camera.matrixWorld.elements
    const R = unit([e[0], e[1], e[2]]), U = unit([e[4], e[5], e[6]]), B = unit([e[8], e[9], e[10]])
    if (ordered !== steps) {
      ordered = steps
      const was = renderer.getRenderTarget(), autoClear = renderer.autoClear, xr = renderer.xr.enabled, shadows = renderer.shadowMap.autoUpdate
      renderer.autoClear = false
      renderer.xr.enabled = false
      renderer.shadowMap.autoUpdate = false
      // the keys, their sort and the look, each over the slots up to top alone, a power of two of them
      const across = Math.min(sortN, S), down = Math.max(1, sortN / S)
      for (const k of g.keys) k.viewport.set(0, 0, across, down)
      g.look.viewport.set(0, 0, across, down)
      const keys = g.passes.keys
      bindCommon(keys, g.state[g.ping])
      keys.uniforms.eye.value.set(e[12], e[13], e[14])
      keys.uniforms.back.value.set(B[0], B[1], B[2])
      keys.uniforms.top.value = top
      run(keys, g.keys[0])
      const sort = g.passes.sort
      for (let stage = 2; top > 0 && stage <= sortN; stage *= 2)
        for (let span = stage / 2; span >= 1; span /= 2) {
          sort.uniforms.keys.value = g.keys[0].texture
          sort.uniforms.stage.value = stage
          sort.uniforms.span.value = span
          run(sort, g.keys[1])
          g.keys.reverse()
        }
      // each particle's quad worked out once, for this camera
      const look = g.passes.look
      bindCommon(look, g.state[g.ping])
      look.uniforms.camR.value.set(R[0], R[1], R[2])
      look.uniforms.camU.value.set(U[0], U[1], U[2])
      look.uniforms.camB.value.set(B[0], B[1], B[2])
      if (top > 0) run(look, g.look)
      renderer.setRenderTarget(was)
      renderer.autoClear = autoClear
      renderer.xr.enabled = xr
      renderer.shadowMap.autoUpdate = shadows
    }
    const u = mesh.userData.gpuparticle3d
    u.tableTex.value = g.tableTex
    u.S.value = S
    u.sorted.value = g.keys[0].texture
    for (let i = 0; i < 6; i++) u[`look${i}`].value = g.look.textures[i]
    // the sort lays the particles drawn first, and no more are held than the slots the CPU owns
    mesh.geometry.instanceCount = top > 0 ? Math.min(sortN, owner.size) : 0
  }

  // Every running effect's lamps, as particle3d lights them.
  const lamp = (plugins: Plugins) => {
    const { THREE, scene } = plugins.render3d
    const away = (lights: any[]) => {
      for (const light of lights) {
        scene.remove(light)
        if (light.target) scene.remove(light.target)
        light.dispose()
      }
    }
    for (const [fx, lights] of lamps) {
      if (ledger.includes(fx) && lights.length === (fx.lamps?.length ?? 0)) continue
      away(lights)
      lamps.delete(fx)
    }
    for (const fx of ledger) {
      if (!fx.lamps?.length) continue
      let lights = lamps.get(fx)
      if (!lights || lights.some((light, i) => !!light.isSpotLight !== !!fx.lamps![i].spot)) {
        if (lights) away(lights)
        lights = fx.lamps.map(l => {
          const light = l.spot ? new THREE.SpotLight() : new THREE.PointLight()
          scene.add(light)
          if (l.spot) scene.add(light.target)
          return light
        })
        lamps.set(fx, lights)
      }
      const at = point(fx)
      fx.lamps.forEach((l, i) => {
        const light = lights![i]
        const [x, y, z] = l.at ?? [0, 0, 0]
        light.position.set(at[0] + x * fx.scale, at[1] + y * fx.scale, at[2] + z * fx.scale)
        light.color.setHex(l.tint ?? fx.tint ?? 0xffffff)
        const t = fx.age, w = 0.5 + 0.5 * (0.5 * Math.sin(t * 7.3 + i) + 0.3 * Math.sin(t * 13.1 + 2 * i) + 0.2 * Math.sin(t * 23.7 + 3 * i))
        light.intensity = l.intensity * (1 - (l.flicker ?? 0) * w)
        light.distance = l.distance * fx.scale
        light.decay = l.decay
        light.castShadow = !!l.shadow
        if (l.spot) {
          const d = unit(fx.dir ?? [0, -1, 0])
          light.angle = l.spot.angle
          light.penumbra = l.spot.penumbra
          light.target.position.set(light.position.x + d[0], light.position.y + d[1], light.position.z + d[2])
          light.target.updateMatrixWorld()
        }
      })
    }
  }

  const setup = (plugins: Plugins) => {
    const { scene } = plugins.wire
    const ownWorld = scene.world?.gpuparticle3d
    if (!ownWorld) throw new Error('the scene names gpuparticle3d but gives no world.gpuparticle3d')
    if (!checked) {
      checked = true
      const order = scene.plugins!
      if (order.indexOf('render3d') < order.indexOf('gpuparticle3d'))
        throw new Error('gpuparticle3d is listed after render3d, which would draw every particle before it has moved')
      ahead(scene, 'gpuparticle3d', 'solids')
      ahead(scene, 'gpuparticle3d', 'light')
    }
    if (!asked) {
      if (!plugins.loader) throw new Error('gpuparticle3d reads its effects through loader, which this scene does not name')
      asked = true
      words_ = drawers(scene.world!)
      plugins.loader.on(ownWorld.effects, (it: Effects) => gather(plugins, ownWorld.effects, it))
      plugins.loader.onWritten(ownWorld.effects, () => { stale = unchecked = true })
    }
    return ownWorld
  }
  const gather = (plugins: Plugins, name: string, it: Effects) => {
    if (!it.files) {
      file = it
      unchecked = true
      return
    }
    Promise.all(it.files.map(async p => JSON.parse(new TextDecoder().decode(await plugins.loader.beside(name, p)))))
      .then(listed => {
        file = { ...it, effects: Object.assign({}, it.effects, ...listed.map(l => l.effects)) }
        if (it.forceGenerators || listed.some(l => l.forceGenerators)) file.forceGenerators = Object.assign({}, it.forceGenerators, ...listed.map(l => l.forceGenerators))
        if (it.drivers || listed.some(l => l.drivers)) file.drivers = Object.assign({}, it.drivers, ...listed.map(l => l.drivers))
        unchecked = true
      })
  }

  return {
    emit(effect: string, at: number[], s: Spawn & { age?: number } = {}): Effect {
      const fx = spawn(effect, at, s)
      if (s.age !== undefined) fx.age = s.age
      return fx
    },
    has(effect: string): boolean { return !!file && effect in file.effects },
    drive(name: string, value?: number) {
      if (value === undefined) delete held[name]
      else held[name] = value
    },
    get drivers(): Readonly<Values> { return page.values },
    get effects(): readonly Effect[] { return ledger },
    get count() { return cap - free.size },
    tick(plugins: Plugins) { setup(plugins) },
    afterTick(plugins: Plugins) {
      const { scene } = plugins.wire
      const ownWorld = setup(plugins)
      const dt = scene.prefabs.engine?.dt
      if (!dt) throw new Error('scene has no engine prefab with dt')
      dtNow = dt
      lit.value = mod<SkyLight>(scene.world!, 'gpuparticle3d', 'light')?.(plugins) ?? [1, 1, 1]
      time += dt
      if (file && unchecked) {
        unchecked = false
        check(file, ownWorld, words_, scene.world)
        reread()
      }
      if (solver) solve(plugins)
      // the attachments' effects started, moved and driven by their sources, or stopped, before anything moves
      // this frame, as an actor's `emit` in its tick is
      if (solver && ownWorld.attach) attach(plugins, ownWorld.attach)
      if (!file || !solver || !setupGpu(plugins)) return

      // the particles that die this step: their slots freed, what they carry stopped
      while (deaths.size && deaths.peek() <= time + 1e-9) release(deaths.pop())
      for (const fx of ledger) if (!fresh.has(fx)) fx.age += dt
      // particles that last die with their effect's life
      for (const fx of ledger) if (fx.lasting.size && fx.age >= fx.life - 1e-9) for (const s of [...fx.lasting]) release(s)

      const row = plugins.wire.rows.find(r => r.kind === 'gpuparticle3d')
      const liveEntries: Entry[] = row?.data.live ?? []
      const ids = new Set<number>()
      for (const e of liveEntries) {
        ids.add(e.id)
        if (seen.has(e.id)) {
          const fx = served.get(e.id)
          if (fx) {
            fx.at = [...e.at]
            fx.dir = e.dir && [...e.dir]
            fx.to = e.to && [...e.to]
            // its drivers as the entry has them now, in the one object its carried effects share
            for (const n of Object.keys(fx.drivers)) if (!e.drivers || !(n in e.drivers)) delete fx.drivers[n]
            Object.assign(fx.drivers, e.drivers)
            if (e.from === undefined && fx.fly === undefined) {
              fx.from = undefined
              fx.life = e.life
            }
          }
          continue
        }
        seen.add(e.id)
        const fx = spawn(e.effect, e.at, e)
        fx.server = e.id
        served.set(e.id, fx)
        fx.age = e.age
      }
      for (const id of seen) {
        if (ids.has(id)) continue
        seen.delete(id)
        const fx = served.get(id)
        if (fx && fx.from !== undefined) end(fx)
      }
      fresh = new Set()
      // over a copy: an effect that ends here with no layers yet leaves the ledger at once
      for (const fx of [...ledger]) {
        if (fx.from !== undefined) {
          const from = plugins.wire.rows.find(r => r.id === fx.from)
          if (!from) end(fx)
          else if (Array.isArray(from.data.pos)) fx.at = [...from.data.pos]
        }
        if (fx.fly !== undefined) fx.life = flight(fx.name, fx.at, fx.to, fx.fly)
      }

      if (stale) {
        stale = false
        for (const fx of ledger) if (fx.layers) {
          const was = fx.layers
          relayer(fx)
          was.forEach((l, i) => { if (fx.layers![i]) inherit(l, fx.layers![i]) })
        }
      }
      births = []
      bursts = []
      // the table packed again when a number of it may have changed, so every layer played has its offset
      // before a burst names it; again each frame while a sheet a layer is drawn from has not landed. A slot
      // whose layer is played no more is freed (its play let go, so no particle is of it), and each layer
      // newly played takes the lowest free slot.
      const repack = () => {
        const playedNow = [page, ...plays.values()].flatMap(p => [...p.played.values()].flatMap(e => e.layers))
        const now = new Set(playedNow)
        slotted.forEach((l, i) => {
          if (!l || now.has(l)) return
          slotted[i] = undefined
          slotOf.delete(l)
          worded.delete(l)
          for (const d of drawings.values()) d.layers.delete(l)
        })
        for (const l of playedNow) {
          if (slotOf.has(l)) continue
          const i = slotted.includes(undefined) ? slotted.indexOf(undefined) : slotted.length
          slotted[i] = l
          slotOf.set(l, i)
        }
        while (slotted.length && slotted[slotted.length - 1] === undefined) slotted.pop()
        const seeing = visual(plugins)
        packed = pack(slotted, l => ins.get(l) ?? [], seeing)
        gpu!.tableTex = dataTexture(gpu!.three, gpu!.tableTex, packed.table)
        dirty = playedNow.some(l => !wordsOf(l).length && !seeing(l).ready)
      }
      // every effect run this frame, those its bursts carry and its landings throw among them, as particle3d
      // runs them: each its layers the first frame it runs, read again when its drivers' play is another, and
      // the table packed again when it brings layers
      for (const fx of ledger) {
        if (!fx.layers) {
          fx.play = playOf(fx)
          fx.uses.add(fx.play)
          const { layers, lamps } = playing(fx.play, fx.name)
          fx.layers = layers
          fx.lamps = lamps
          fx.bursts = fx.layers.map(() => 0)
          fx.last = fx.layers.map(() => 0)
        } else if (playOf(fx) !== fx.play) relayer(fx)
        if (dirty || !packed || fx.layers.some(l => !packed!.layer.has(l))) repack()
        if (!fx.root && !fx.carrier) {
          const now = point(fx)
          fx.vel = fx.was ? [0, 1, 2].map(k => ((now[k] ?? 0) - (fx.was![k] ?? 0)) / dt) : [0, 0, 0]
          fx.was = [...now]
        }
        fire(fx, dt, packed!.layer)
        land(fx)
      }
      // an effect stays while it has particles, bursts to come, a landing, a lamp's life, or carried effects
      // whose particles pull toward its point or count its age
      for (const fx of [...ledger]) {
        if (fx.parts > 0 || more(fx) || (!!fx.land && !fx.landed) || (!!fx.lamps?.length && fx.age < fx.life - 1e-9) || fx.holds > 0) continue
        gone(fx)
        if (fx.root) fx.root.holds--
      }
      frameGpu(plugins)
      if (scene.plugins!.includes('lights3d')) lamp(plugins)
    },
    close(plugins: Plugins) {
      disposeGpu(plugins)
      own?.dispose()
      own = undefined
      for (const d of drawings.values()) d.drawing?.dispose()
      drawings.clear()
      for (const lights of lamps.values()) {
        for (const light of lights) {
          plugins.render3d.scene.remove(light)
          if (light.target) plugins.render3d.scene.remove(light.target)
          light.dispose()
        }
      }
      lamps.clear()
      attached.clear()
      ledger = []
      served.clear()
    },
  }
}
