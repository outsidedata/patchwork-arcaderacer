// The fog's extension: the fog plugin's own numbers in `world.vision`, the block it shares with team
// vision (`addons/vision`, whose extension shows what each team sees and edits the rest of the
// block), drawn as what they are wherever a scene file's `world` is shown:
//   vision.opacity  `unexplored` and `explored`, the fog's opacity from 0 to 1: a slider;
//   vision.layer    `layer`, the render2d layer the fog is drawn on: a pick of the layers the owner
//                   scene's `world.render2d` names.
// It shares its name with the addon's extension, as the plugin shares the addon's name and block; its
// types are its own.
import type { Editor } from '#editor/editor.ts'
import { FogLayer, Opacity } from './vision.components.tsx'

export function vision(ed: Editor) {
  ed.field('vision.opacity', Opacity)
  ed.field('vision.layer', FogLayer)
  ed.bindFile(path => path.endsWith('.scene.json'), {
    'world.vision.unexplored': 'vision.opacity',
    'world.vision.explored': 'vision.opacity',
    'world.vision.layer': 'vision.layer',
  })
}
