// gpuparticle3d's rolls. A particle is thrown on the GPU with a seed, and every number it is rolled (its way,
// its speed, its life, its size, its spin, where it starts in its jitter and its box, its pick, where it sits
// in each strength that is a range) is `roll(seed, k)` for that number's `k` (`ROLL` in `layout.ts`): a hash
// of the two, from 0 to 1. The shaders roll with the same hash (`glsl.ts`), in 32-bit unsigned integers, so the
// CPU rolls a particle's life as the GPU does and knows when each particle dies, the frame it dies, without
// reading anything back: which slots are free, how many particles each effect has, when a carried effect stops.

// The 32-bit hash: lowbias32 (Chris Wellons), in unsigned 32-bit arithmetic.
export const hash = (x: number) => {
  x = (x ^ (x >>> 16)) >>> 0
  x = Math.imul(x, 0x7feb352d) >>> 0
  x = (x ^ (x >>> 15)) >>> 0
  x = Math.imul(x, 0x846ca68b) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  return x
}

// Roll `k` of the particle seeded `seed`, from 0 up to but not 1, in 24 bits, so a float32 holds it exactly.
export const roll = (seed: number, k: number) => (hash((hash(seed >>> 0) + Math.imul(k, 0x9e3779b9)) >>> 0) >>> 8) / 16777216
