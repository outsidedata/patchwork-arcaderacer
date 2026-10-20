// Types any game's fields may be bound to (`Editor.bind`):
//   color    a colour, as the number 0xrrggbb or as `#rrggbb` text
//   angle    radians, shown and typed in degrees
//   integer  a whole number
//   bearing  a way in degrees clockwise from north (−z), as a wind blows toward: 0 toward −z, 90
//            toward +x; turned on a dial
import type { Editor } from '#editor/editor.ts'
import { Color, Angle, Integer, Bearing } from './types.components.tsx'

export function types(ed: Editor) {
  ed.field('color', Color)
  ed.field('angle', Angle)
  ed.field('integer', Integer)
  ed.field('bearing', Bearing)
}
