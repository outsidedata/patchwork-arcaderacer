// The circuit: one row, which stands for the track the scene races on. Its definition is every number
// the track plugin makes the circuit from with the scene's `world.seed` (the header of
// `plugins/track/track.sim.ts`), and its look draws it. It has no rule and nothing of it changes.
import type { Kind } from '#engine/engine.ts'

export const circuit: Kind = {}
