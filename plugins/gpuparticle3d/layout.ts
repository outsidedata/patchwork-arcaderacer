// gpuparticle3d's tables: where each number the shaders read sits. The CPU packs every played layer, every
// force generator entry, every sheet frame and every stop list into one float array, `table`, and every
// running effect into another, `effects`; each is a float texture the shaders read with `texelFetch`, four
// numbers a texel, a number found by its index (`at(i)` in `glsl.ts`). A record is a run of numbers at an
// offset, its fields at the offsets below; a list (stops, a clip's frames, a layer's generator entries) is a
// run of numbers elsewhere in `table`, which its record names by offset and count.
//
// Each layout is written once, here, as names and widths; `offsets` turns one into the index of each field
// and the record's size, and `defines` into the GLSL `#define`s the shaders are compiled with, so the
// packing in `pack.ts` and the reading in `glsl.ts` cannot disagree.
//
//   FORCE   one set of forces: a layer's own (its first FORCE.size numbers), or a force generator's entry.
//           A field a set does not give is its default: 0 for a force, `none` (-1) for a range, a shell or
//           a list, 1 for a noise frequency, and a `has` 0 for a vector it does not give.
//   LAYER   an emitter: its own forces, then every other field particle3d's header names.
//   FRAME   one frame of a sheet, or of a shape: its batch, its picture's corners, its whole size, anchor
//           and trim in pixels.
//   ENTRY   one generator entry a layer is in: the entry's offset, the strength (its least and most, the
//           same for a strength that is no range) and the roll it is drawn by.
//   EFFECT  one running effect: its point, the line it was thrown along, its `to`, its speed, the time it was
//           born on the clock the step is handed (`now` in `glsl.ts`), so its row holds still while it does, the
//           row of the effect the carrying began from (-1 for one not carried), its floor, its life, the slot
//           of the particle that carries it (-1 for none) and whether that particle lives, and its tint.
//           The point, line, speed and `to` of a carried effect are the carry pass's (`glsl.ts`).

export type Layout = readonly (readonly [string, number])[]
export type Offsets = Record<string, number> & { size: number }

export const NONE = -1

export const FORCE = [
  ['g', 1], ['drag', 1], ['pull', 1], ['swirl', 1],
  ['axis', 3], ['hasAxis', 1],
  ['at', 3], ['anchorEffect', 1],
  ['direction', 3], ['hasDirection', 1],
  ['range', 1], ['falloff', 1], ['noiseFrequency', 1], ['noiseAmplitude', 1], ['turbulence', 1],
  ['noiseScroll', 3], ['hasScroll', 1],
  ['wind', 3], ['hasWind', 1],
  ['dragBySpeed', 1], ['shell', 1], ['toAxis', 1],
  ['overLife', 1], ['overLifeN', 1], ['overAge', 1], ['overAgeN', 1],
] as const satisfies Layout

export const LAYER = [
  ['force', 0], // the layer's own forces, FORCE.size numbers from here
  ['life', 2], ['lasts', 1], ['skip', 1],
  ['sizes', 2], ['grow', 1], ['grows', 1], ['growsN', 1],
  ['dir', 3], ['hasDir', 1], ['spread', 1], ['speed', 2], ['outward', 2],
  ['jitter', 3], ['box', 6],
  ['pace', 1], ['paceN', 1],
  ['bounce', 1], ['follow', 1],
  ['flips', 1], ['flipsN', 1],
  ['tint', 3], ['hasTint', 1], ['tint1', 3], ['hasTint1', 1], ['tints', 1], ['tintsN', 1], ['gain', 1],
  ['a0', 1], ['a1', 1], ['fade', 1], ['alphas', 1], ['alphasN', 1],
  ['spin', 1], ['origin', 2], ['hasOrigin', 1],
  ['add', 1], ['stretch', 1], ['face', 1], ['beam', 1], ['inherit', 1],
  ['entries', 1], ['entriesN', 1],
  // how it is drawn: by a word (1, not as a quad), as frames of a clip (its frames' offset and count, played
  // over its life or at the clip's own times with `play`), or as one frame (a shape, or a flat square)
  ['word', 1], ['frames', 1], ['framesN', 1], ['play', 1], ['loop', 1], ['timed', 1], ['durations', 1], ['ppm', 1],
  ['ready', 1],
  // a flipbook's: the part of its clip its frames begin at, [min, max] (hasStart 0 for none, its frames from
  // the first and held on the last), whether each frame is laid into the next, and its erode stops
  ['start', 2], ['hasStart', 1], ['blend', 1], ['erode', 1], ['erodeN', 1],
] as const satisfies Layout

export const FRAME = [
  ['batch', 1], ['uv', 8], ['fsize', 2], ['anchor', 2], ['trim', 4], ['sheet', 1],
] as const satisfies Layout

export const ENTRY = [
  ['entry', 1], ['least', 1], ['most', 1], ['roll', 1],
] as const satisfies Layout

export const EFFECT = [
  ['point', 3], ['scale', 1],
  ['dir', 3], ['hasDir', 1],
  ['to', 3], ['hasTo', 1],
  ['vel', 3], ['born', 1],
  ['root', 1], ['floor', 1], ['hasFloor', 1], ['life', 1],
  ['carrier', 1], ['carrierLive', 1], ['hasTint', 1],
  ['tint', 3],
] as const satisfies Layout

// A layout's field named `size` would be lost under the record's size, so none is: a layer's [min, max]
// size is `sizes`, a frame's whole size `fsize`.
export function offsets(layout: Layout, start = 0): Offsets {
  const out: Record<string, number> = {}
  let at = start
  for (const [name, width] of layout) {
    if (name === 'size') throw new Error('a gpuparticle3d layout has a field named size, which is the record\'s own')
    out[name] = at
    at += width
  }
  return Object.assign(out, { size: at - start }) as Offsets
}

export const F = offsets(FORCE)
// A layer's own forces are its first F.size numbers, so its fields after them start there.
export const L = offsets(LAYER, F.size)
L.size += F.size
export const FR = offsets(FRAME)
export const EN = offsets(ENTRY)
export const E = offsets(EFFECT)

// The rolls a particle is thrown by, each a number from 0 to 1 drawn from its seed and the roll's number
// (`roll` in `hash.ts` and in `glsl.ts`); a force generator's strength that is a range draws roll GEN + its
// place among the layer's entries.
export const ROLL = {
  dirU: 0, dirW: 1, speed: 2, life: 3, skip: 4, size: 5,
  jitter: 6, // six: two an axis
  spin: 12, rot: 13, box: 14, // three: one an axis
  pick: 17, outward: 18, start: 19, gen: 32,
} as const

// The GLSL `#define`s of every layout: `F_<field>`, `L_<field>`, `FR_<field>`, `EN_<field>`, `E_<field>`,
// each record's `_SIZE`, `NONE` and `ROLL_<roll>`.
export function defines(): string {
  const of = (prefix: string, o: Offsets) =>
    Object.entries(o).map(([k, v]) => `#define ${prefix}_${k === 'size' ? 'SIZE' : k} ${v}`)
  return [
    ...of('F', F), ...of('L', L), ...of('FR', FR), ...of('EN', EN), ...of('E', E),
    `#define NONE ${NONE}.0`,
    ...Object.entries(ROLL).map(([k, v]) => `#define ROLL_${k} ${v}u`),
  ].join('\n')
}
