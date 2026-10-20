// The land of experiment 2 as a terrain3d field: a height program whose `biomes` node holds two
// biomes, each with its own ground, and the bands that carry the desert's share to every vertex.
//
//   alpine  ridged, warped and terraced crags, the demo's `crags` ground.
//   desert  rolling dunes: simplex noise stretched across the wind so its cells run as long
//           ridges, folded to a ridge so each has a crest and a wide trough, its crest lines bent by
//           a slow warp, on a floor lifted by a broad swell.
//
// The desert's strength is a slow noise ramped about `cover`, the alpine's its complement, mixed by
// the node's `sharp`. Every
// number of it is the panel's (`land` in main.js), and `field(land)` makes the file terrain3d's
// `land(field)` reads, in the shape `terrain3d.sim.ts`'s header gives.

const WORLD = 12000, HSCALE = 1000

export const LAND = {
  sharp: 7,
  cover: 0.5,
  biomeFreq: 5,
  dunes: { spacing: 180, height: 22, wind: 20, length: 6, bend: 140, floor: 45, swell: 60 },
}

export function field(land) {
  const d = land.dunes
  // simplex cells are about one lattice unit, so `spacing` metres apart is world / spacing cells across
  const freq = WORLD / d.spacing
  const nodes = [
    // the alpine ground: the demo's crags
    { id: 'pushX', op: 'noise', kind: 'value', freq: 9, seed: 31 },
    { id: 'pushXs', op: 'remap', input: 'pushX', inLo: 0, inHi: 1, outLo: -1, outHi: 1, ease: 'smooth' },
    { id: 'pushZ', op: 'noise', kind: 'value', freq: 9, seed: 32 },
    { id: 'pushZs', op: 'remap', input: 'pushZ', inLo: 0, inHi: 1, outLo: -1, outHi: 1, ease: 'smooth' },
    { id: 'grain', op: 'noise', kind: 'value', freq: 16, seed: 41 },
    { id: 'warped', op: 'warp', input: 'grain', x: 'pushXs', z: 'pushZs', amount: 260 },
    { id: 'crest', op: 'fold', input: 'warped', kind: 'ridge' },
    { id: 'benches', op: 'fold', input: 'crest', kind: 'terrace', steps: 6 },
    { id: 'scree', op: 'noise', kind: 'value', freq: 200, seed: 66 },
    { id: 'broken', op: 'combine', mode: 'lerp', a: 'benches', b: 'scree', t: 0.03 },
    { id: 'alpineH', op: 'remap', input: 'broken', inLo: 0, inHi: 1, outLo: 0.08, outHi: 0.7, ease: 'smooth' },
    // the desert ground: dunes
    { id: 'bendX', op: 'noise', kind: 'value', freq: 30, seed: 71 },
    { id: 'bendXs', op: 'remap', input: 'bendX', inLo: 0, inHi: 1, outLo: -1, outHi: 1, ease: 'smooth' },
    { id: 'bendZ', op: 'noise', kind: 'value', freq: 30, seed: 72 },
    { id: 'bendZs', op: 'remap', input: 'bendZ', inLo: 0, inHi: 1, outLo: -1, outHi: 1, ease: 'smooth' },
    { id: 'ripple', op: 'noise', kind: 'simplex', freq, seed: 73, rotate: (d.wind * Math.PI) / 180, stretch: [1, 1 / d.length] },
    { id: 'rippleW', op: 'warp', input: 'ripple', x: 'bendXs', z: 'bendZs', amount: d.bend },
    { id: 'ridges', op: 'fold', input: 'rippleW', kind: 'ridge' },
    { id: 'dunesH0', op: 'scale', input: 'ridges', by: d.height / HSCALE },
    { id: 'swell', op: 'noise', kind: 'value', freq: 12, seed: 74 },
    { id: 'swellH', op: 'remap', input: 'swell', inLo: 0, inHi: 1, outLo: d.floor / HSCALE, outHi: (d.floor + d.swell) / HSCALE, ease: 'smooth' },
    { id: 'desertH', op: 'combine', mode: 'add', a: 'dunesH0', b: 'swellH' },
    // the biomes' shares
    { id: 'desertN', op: 'noise', kind: 'value', freq: land.biomeFreq, seed: 102 },
    { id: 'desertS', op: 'remap', input: 'desertN', inLo: 1 - land.cover - 0.25, inHi: 1 - land.cover + 0.25, outLo: 0, outHi: 1, ease: 'smooth' },
    { id: 'alpineSs', op: 'remap', input: 'desertS', inLo: 0, inHi: 1, outLo: 1, outHi: 0, ease: 'linear' },
    { id: 'ground', op: 'biomes', sharp: land.sharp, list: [
      { name: 'alpine', strength: 'alpineSs', height: 'alpineH' },
      { name: 'desert', strength: 'desertS', height: 'desertH' },
    ] },
  ]
  return {
    program: { world: WORLD, hscale: HSCALE, sea: 0.5, flood: false, out: 'ground', nodes },
    analysis: { slopeStep: 3, curveStep: 10, positionRadius: 50, occlusionRadius: 100, occlusionSteps: 6, cliffProbe: 40, cliffSlope: 0.6, cliffDrop: 40, flatAngle: 0.03, records: 50000 },
    // band 1 is the desert's share, which every vertex carries in its first value (tdA0.x)
    bands: [
      { colour: '#808080', amount: 1, rules: [] },
      { colour: '#808080', amount: 0, rules: [{ q: 'biome:desert', lo: 0, hi: 1 }] },
    ],
    grain: { base: 1, range: 0 },
    detail: [],
    surfaces: {},
    layers: [],
  }
}
