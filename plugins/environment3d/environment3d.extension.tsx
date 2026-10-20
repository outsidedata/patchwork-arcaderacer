// environment3d's extension: the types of its prefab's fields. Its colours, the sun's, the sky's,
// the ground light's, the ambient light's, each other light's and the floor's, are each the number
// 0xrrggbb or a CSS colour, and it has no angle: every directional light shines from its `at`
// toward the origin.
import type { Editor } from '#editor/editor.ts'

export function environment3d(ed: Editor) {
  ed.bind('environment3d', { 'sun.color': 'color', 'sky.color': 'color', 'sky.ground': 'color', 'ambient.color': 'color', 'lights.*.color': 'color', 'floor.color': 'color' })
}
