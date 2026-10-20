// Where a seat's car starts: a `start` actor of the scene, one per slot, holding the slot in `slot`
// and the grid place its car takes in `grid` (the track plugin's `gridAt`: grid places count back
// from the start line). The match plugin's `role` makes a racer's `car` on the grid place of its
// slot's start.
// It has no rule and is not drawn.
import type { Kind } from '#engine/engine.ts'

export const start: Kind = {}
