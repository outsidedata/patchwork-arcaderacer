// The Paris course: forest.sim.ts's kinds, and the paris.scene.json file next to this one.
import type { Scene } from '#engine/engine.ts'
import file from './paris.scene.json' with { type: 'json' }

export { sim } from './forest.sim.ts'

export const scene = file as Scene
