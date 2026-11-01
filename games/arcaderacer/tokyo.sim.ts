// The Tokyo course: forest.sim.ts's kinds, and the tokyo.scene.json file next to this one.
import type { Scene } from '#engine/engine.ts'
import file from './tokyo.scene.json' with { type: 'json' }

export { sim } from './forest.sim.ts'

export const scene = file as Scene
