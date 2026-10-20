// arcaderacer's extension, on while arcaderacer is open: the types of the game's fields that name a
// scene or count, so the editor shows each as what it is.
//   titlecard  each course's `scene`, a scene of the game (scenemanager's pick).
//   player     `exit`, the scene a seat goes back to from a course.
//   start      `slot` and `grid`, whole numbers: the seat's slot and its grid place.
//   rival      `grid`, its grid place, a whole number.
import type { Editor } from '#editor/editor.ts'

export function arcaderacer(ed: Editor) {
  ed.bind('titlecard', { 'courses.*.scene': 'scenemanager.scene' })
  ed.bind('player', { exit: 'scenemanager.scene' })
  ed.bind('start', { slot: 'integer', grid: 'integer' })
  ed.bind('rival', { grid: 'integer' })
}
