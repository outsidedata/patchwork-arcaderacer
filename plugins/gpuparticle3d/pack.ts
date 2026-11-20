// Packs what the shaders read into `table` (`layout.ts`): every played layer, every force generator entry a
// layer is in, every frame a layer is drawn by, and every list of stops, each record at its offset. It is run
// whenever a number in it can have changed: the file read or written, a driver moved, a layer played or let
// go, a sheet landed.
import type { Emitter, Force } from '#plugins/particle3d/particle3d.plugin.ts'
import { F, FR, L, NONE, ROLL } from './layout.ts'

// One frame a layer is drawn by: the batch (mesh) that draws it, its picture's corners top left, top right,
// bottom left, bottom right, and, for a frame of a sheet, its whole size, anchor and trim in pixels. A frame
// of a shape or a flat square has none of those: it is a metre a side, its middle on its place.
export type Framed = { batch: number; uv: number[]; sheet?: { size: number[]; anchor: number[]; trim: number[] } }
// How a layer is drawn: by a word, or by `frames`, played evenly over its life, or at the clip's own times
// (`durations`, seconds a frame) with `play`, round again when it `loop`s. `timed` is false for a clip of one
// frame with no times, which holds it. `ready` is false while its sheet has not landed: it draws nothing.
export type Visual = {
  word: boolean; frames: Framed[]; play: boolean; loop: boolean; timed: boolean; durations: number[]; ppm: number; ready: boolean
}
// The entries a layer is in: each entry, and how hard it acts, least and most, and the roll that places a
// particle between them, one roll a generator.
export type In = { force: Force; least: number; most: number; roll: number }

export type Packed = { table: Float32Array; layer: Map<Emitter, number> }

// sRGB 0xRRGGBB as three numbers from 0 to 1, still sRGB: the shaders mix in sRGB, as particle3d's `mix` does,
// and take the mix to linear light.
const rgb = (c: number) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]

// `slots` is every played layer at its slot: each layer's record is at its slot times a layer's size, so a
// layer keeps its offset, which its particles hold on the GPU, while layers played before or after it come
// and go. A slot with no layer is left as zeros.
export function pack(slots: readonly (Emitter | undefined)[], ins: (l: Emitter) => In[], visual: (l: Emitter) => Visual): Packed {
  const out: number[] = []
  const layers = slots.filter((l): l is Emitter => l !== undefined)
  const reserve = (n: number) => {
    const at = out.length
    for (let i = 0; i < n; i++) out.push(0)
    return at
  }
  // A list appended: its offset, or NONE for no list.
  const list = (rows: number[][] | undefined) => {
    if (!rows?.length) return NONE
    const at = out.length
    for (const r of rows) out.push(...r)
    return at
  }

  // One set of forces written at `at`.
  const force = (at: number, f: Force) => {
    const put = (k: string, v: number) => { out[at + F[k]] = v }
    const vec = (k: string, has: string | undefined, v: number[] | undefined) => {
      if (v) for (let i = 0; i < 3; i++) out[at + F[k] + i] = v[i]
      if (has) put(has, v ? 1 : 0)
    }
    put('g', f.g ?? 0)
    put('drag', f.drag ?? 0)
    put('pull', f.pull ?? 0)
    put('swirl', f.swirl ?? 0)
    vec('axis', 'hasAxis', f.axis)
    vec('at', undefined, f.at ?? [0, 0, 0])
    put('anchorEffect', f.anchor === 'effect' ? 1 : 0)
    vec('direction', 'hasDirection', f.direction)
    put('range', f.range ?? NONE)
    put('falloff', f.falloff ?? 0)
    put('noiseFrequency', f.noiseFrequency ?? 1)
    put('noiseAmplitude', f.noiseAmplitude ?? 0)
    put('turbulence', f.turbulence ?? 0)
    vec('noiseScroll', 'hasScroll', f.noiseScroll)
    vec('wind', 'hasWind', f.wind)
    put('dragBySpeed', f.dragBySpeed ?? 0)
    put('shell', f.shell ?? NONE)
    put('toAxis', f.toAxis ? 1 : 0)
    // lists written after, so their offsets are set now
    return () => {
      out[at + F.overLife] = list(f.overLife)
      out[at + F.overLifeN] = f.overLife?.length ?? 0
      out[at + F.overAge] = list(f.overAge)
      out[at + F.overAgeN] = f.overAge?.length ?? 0
    }
  }

  const entryAt = new Map<Force, number>()
  const after: (() => void)[] = []
  const layer = new Map<Emitter, number>()
  reserve(slots.length * L.size)
  slots.forEach((l, i) => {
    if (!l) return
    const at = i * L.size
    layer.set(l, at)
    after.push(force(at, l))
  })
  for (const l of layers) for (const { force: f } of ins(l)) {
    if (entryAt.has(f)) continue
    const at = reserve(F.size)
    entryAt.set(f, at)
    after.push(force(at, f))
  }
  for (const a of after) a()

  for (const l of layers) {
    const at = layer.get(l)!
    const put = (k: string, v: number) => { out[at + L[k]] = v }
    const many = (k: string, v: readonly number[]) => v.forEach((n, i) => { out[at + L[k] + i] = n })
    many('life', l.life ?? [0, 0])
    put('lasts', l.lasts ? 1 : 0)
    put('skip', l.skip ?? 0)
    many('sizes', l.size ?? [1, 1])
    put('grow', l.grow ?? 1)
    put('grows', list(l.grows))
    put('growsN', l.grows?.length ?? 0)
    many('dir', l.dir ?? [0, 0, 0])
    put('hasDir', l.dir ? 1 : 0)
    put('spread', l.spread ?? NONE)
    many('speed', l.speed ?? [0, 0])
    many('outward', l.outward ?? [0, 0])
    many('jitter', l.jitter ?? [0, 0, 0])
    many('box', l.box ?? [0, 0, 0, 0, 0, 0])
    put('pace', list(l.pace))
    put('paceN', l.pace?.length ?? 0)
    put('bounce', l.bounce ?? NONE)
    put('follow', l.follow ? 1 : 0)
    put('flips', list(l.flips))
    put('flipsN', l.flips?.length ?? 0)
    many('tint', rgb(l.tint ?? 0xffffff))
    put('hasTint', l.tint === undefined ? 0 : 1)
    many('tint1', rgb(l.tint1 ?? 0xffffff))
    put('hasTint1', l.tint1 === undefined ? 0 : 1)
    put('tints', list(l.tints?.map(([p, c]) => [p, ...rgb(c)])))
    put('tintsN', l.tints?.length ?? 0)
    put('gain', l.gain ?? 1)
    put('a0', l.a0 ?? 1)
    put('a1', l.a1 ?? 1)
    put('fade', l.fade ?? NONE)
    put('alphas', list(l.alphas))
    put('alphasN', l.alphas?.length ?? 0)
    put('spin', l.spin ?? 0)
    many('origin', l.origin ?? [0, 0])
    put('hasOrigin', l.origin ? 1 : 0)
    put('add', l.add ? 1 : 0)
    put('stretch', l.stretch ? 1 : 0)
    put('face', l.face ? 1 : 0)
    put('beam', l.beam ? 1 : 0)
    put('inherit', l.inherit ?? 0)
    const its = ins(l)
    put('entries', list(its.map(i => [entryAt.get(i.force)!, i.least, i.most, ROLL.gen + i.roll])))
    put('entriesN', its.length)
    const v = visual(l)
    put('word', v.word ? 1 : 0)
    put('frames', list(v.frames.map(f => {
      const row = new Array(FR.size).fill(0)
      row[FR.batch] = f.batch
      f.uv.forEach((n, i) => { row[FR.uv + i] = n })
      if (f.sheet) {
        row[FR.sheet] = 1
        f.sheet.size.forEach((n, i) => { row[FR.fsize + i] = n })
        f.sheet.anchor.forEach((n, i) => { row[FR.anchor + i] = n })
        f.sheet.trim.forEach((n, i) => { row[FR.trim + i] = n })
      }
      return row
    })))
    put('framesN', v.frames.length)
    put('play', v.play ? 1 : 0)
    put('loop', v.loop ? 1 : 0)
    put('timed', v.timed ? 1 : 0)
    put('durations', list(v.durations.length ? [v.durations] : undefined))
    put('ppm', v.ppm)
    put('ready', v.ready ? 1 : 0)
    many('start', l.start ?? [0, 0])
    put('hasStart', l.start ? 1 : 0)
    put('blend', l.blend ? 1 : 0)
    put('erode', list(l.erode))
    put('erodeN', l.erode?.length ?? 0)
  }
  return { table: Float32Array.from(out), layer }
}
