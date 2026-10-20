// The title screen: one row, the game's name and the course select in 3D over the title's race once
// its intro is done. It has no rule: its look's course words, which the leader in the lobby presses,
// send `start` with the course the word names at the title's `match` row (the match plugin), and its
// look holds the camera on the race once the intro has let it go. Its definition holds every word,
// place, colour and number on the screen, each course's scene, and the camera's turn; the words' 3D
// model is made from its words by `assets/title/title.py`.
import type { Kind } from '#engine/engine.ts'

export const titlecard: Kind = {}
