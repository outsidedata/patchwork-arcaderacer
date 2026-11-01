// What volley3d's extension tests share, those that attach the game view and those that do not: the
// test game's name and folder, its patterns file and the patterns written into it, and a check that
// two points are one to so many digits.
import { expect } from 'vitest'
import type { Patterns } from './volley3d.sim.ts'

export const GAME = 'volleyrange'
export const folder = `games/${GAME}`
export const path = `${folder}/assets/patterns.json`

export const look = { body: 'flame', trail: 'smoke', burst: 'boom' }
export const PATTERNS: Patterns = {
  patterns: {
    rocket: { speed: 40, life: 3, splash: 2, look },
    grenade: { speed: 20, g: 9.8, life: 4, splash: 4, look: { body: 'flame', burst: 'boom' } },
    missile: { speed: 30, seek: 1.5, life: 3, look },
    shell: { speed: 30, accel: 20, life: 4, look: { body: 'flame', burst: 'boom' } },
    dart: { speed: 30, life: 0.5, look },
  },
}

export const close = (got: number[], want: number[], digits = 9) => got.forEach((g, i) => expect(g).toBeCloseTo(want[i], digits))
